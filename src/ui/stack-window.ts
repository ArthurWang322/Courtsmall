// The cards' own window: today's other games as cards behind the main window. It is always there,
// above the main window and over it, and never resized for the stack: a resize makes the web view
// paint its old frame out of place for a moment (the flash the maintainer saw, 2026-10-22). Clear
// and letting the pointer through, it is not seen and takes no clicks; the main window brings the
// cards up from the strip along its top edge (src/ui/stack.ts). While they are up this window looks
// where the pointer is on the screen, every few frames, rather than waiting for the web view's pointer
// events (a window the pointer passes through gets none): on the cards it takes the pointer, so a card
// can be clicked; on the strip it lets it through to the main window; off both, the cards go down.
//
// Its bottom part is the main window's place: the cards behind sit in the part above it (clipped
// there, so they never cover the main window), and a card drawn out comes down over it.

import '@fontsource/barlow-condensed/latin-600';
import type { GameCard } from '../model/types.ts';
import { langOf, STRINGS, type Strings } from '../i18n/index.ts';
import { backCards } from './day-order.ts';
import { bus as makeBus, type Show } from './stack-bus.ts';
import { cardPlace, CLOSE_AFTER_MS, FAN_MS, KEEP_H, hoverPlace, LAND_MS, overlayRoom, pickRise, RISE_MS, STAGGER_MS } from './stack-layout.ts';
import { stackView } from './views.ts';

const shell = '__TAURI_INTERNALS__' in window;
const root = document.documentElement;
const bus = await makeBus('stack');
const behind = document.querySelector<HTMLElement>('.behind')!;
const layer = document.querySelector<HTMLElement>('.behind .stack')!;
const drawn = document.querySelector<HTMLElement>('.stack.drawn')!;

let show: Show | undefined;
let T: Strings = STRINGS.en;
let cards: GameCard[] = [];
let up = false, picking = false;
/** The card under the pointer (its depth), 0 for none. */
let hovered = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
/** Each bring-up or put-down: a later one makes an earlier one's waiting steps stop. */
let run = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const tipOff = (g: GameCard) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(g.start);

/** Let the pointer through to what is under this window, or take it. */
let through = true;
async function setThrough(on: boolean): Promise<void> {
  if (through === on) return;
  through = on;
  if (shell) await (await import('@tauri-apps/api/window')).getCurrentWindow().setIgnoreCursorEvents(on);
  else bus.send('main', 'stack-through', on);
}

const els = () => [...layer.querySelectorAll<HTMLElement>('.scard')];
const depthOf = (el: HTMLElement) => Number(el.style.getPropertyValue('--depth'));
const set = (el: HTMLElement, p: { y: number; scale: number; brightness: number }) => {
  el.style.setProperty('--y', `${p.y}`);
  el.style.setProperty('--s', `${p.scale}`);
  el.style.setProperty('--b', `${p.brightness}`);
};
/** Each card to its place, out or in, in turn: out the nearest first, in the furthest first; slowly,
 *  then a card lifts under the pointer quickly (app.css --move). */
function fan(out: boolean): void {
  const all = els();
  root.style.setProperty('--move', `${FAN_MS}ms`);
  for (const el of all) {
    const d = depthOf(el);
    el.style.transitionDelay = `${(out ? d - 1 : all.length - d) * STAGGER_MS}ms`;
    set(el, cardPlace(out ? d : 0));
  }
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { for (const el of els()) el.style.transitionDelay = '0ms'; root.style.removeProperty('--move'); }, all.length * STAGGER_MS + 50);
}
/** Today's cards behind the game on screen, as many as there is room for, where `up` puts them. */
function draw(): void {
  if (!show) return;
  cards = backCards(show.today, show.currentId, show.favourites).slice(0, show.shown);
  layer.innerHTML = stackView(cards, T, tipOff, show.favourites);
  for (const el of els()) { el.style.transition = 'none'; set(el, cardPlace(up ? depthOf(el) : 0)); }
  void layer.offsetHeight;
  for (const el of els()) el.style.transition = '';
}
/** ESPN's newer list: the same cards, their strips as they now stand, not drawn again (which would put them in place at once). */
function refresh(today: GameCard[]): void {
  if (!show) return;
  show = { ...show, today };
  for (const el of els()) {
    const g = today.find((x) => x.id === el.dataset.game);
    const strip = el.querySelector('.strip');
    if (!g || !strip) continue;
    const tmp = document.createElement('div');
    tmp.innerHTML = stackView([g], T, tipOff, show.favourites);
    strip.innerHTML = tmp.querySelector('.strip')?.innerHTML ?? strip.innerHTML;
    el.classList.toggle('live', tmp.querySelector('.scard')?.classList.contains('live') ?? false);
  }
}

function bringUp(s: Show): void {
  clearTimeout(closeTimer);
  if (picking) return;
  ++run;
  show = s;
  T = STRINGS[langOf(s.lang)];
  root.style.setProperty('--card-h', `${s.cardH}px`);
  root.style.setProperty('--room', `${overlayRoom(s.cardH)}px`);
  // Back up while it was going down: the same cards come out from where they are.
  if (!els().length) { up = false; draw(); }
  up = true;
  root.classList.add('stack-up');
  fan(true);
  bus.send('main', 'stack-state', { up: true });
  void watch();
}

async function putDown(): Promise<void> {
  if (!up) return;
  const mine = ++run;
  up = false;
  root.classList.remove('stack-up');
  fan(false);
  if (!reducedMotion.matches) await wait(els().length * STAGGER_MS + FAN_MS);
  if (mine !== run) return;
  layer.innerHTML = '';
  hovered = 0;
  await setThrough(true);
  bus.send('main', 'stack-state', { up: false });
}

/** Where the pointer is in this window, px, or undefined if that cannot be told. */
let pointerAt: () => Promise<{ x: number; y: number } | undefined> = async () => devPointer;
let devPointer: { x: number; y: number } | undefined;
if (shell) {
  const { cursorPosition, getCurrentWindow, primaryMonitor } = await import('@tauri-apps/api/window');
  const me = getCurrentWindow();
  let place: { x: number; y: number; cursorScale: number } | undefined;
  pointerAt = async () => {
    // This window's place in points, once each time the cards come up: it does not move while they are.
    // The pointer's pixels are counted at the main screen's scale, this window's at its own screen's:
    // with two screens of different scales (the maintainer's, 2026-10-22) they cannot simply be subtracted.
    place ??= await (async () => {
      const [p, scale, primary] = await Promise.all([me.outerPosition(), me.scaleFactor(), primaryMonitor()]);
      return { x: p.x / scale, y: p.y / scale, cursorScale: primary?.scaleFactor ?? scale };
    })();
    const c = await cursorPosition();
    return { x: c.x / place.cursorScale - place.x, y: c.y / place.cursorScale - place.y };
  };
  bus.on('stack-show', () => { place = undefined; });
}

/** While the cards are up: where the pointer is, every few frames. On the cards, this window takes it
 *  and the card under it lifts; on the main window's top strip it goes through to the main window;
 *  off both for CLOSE_AFTER_MS, the cards go down. */
async function watch(): Promise<void> {
  const mine = run;
  while (up && mine === run) {
    const at = await pointerAt();
    if (!up || mine !== run) break;
    if (at && !picking) {
      const top = behind.offsetHeight, w = window.innerWidth;
      const across = at.x >= 0 && at.x < w;
      const cardsTop = Math.min(top, ...els().map((el) => el.getBoundingClientRect().top));
      const onCards = across && at.y >= cardsTop && at.y < top;
      const onStrip = across && at.y >= top && at.y < top + KEEP_H;
      void setThrough(!onCards);
      const el = onCards ? document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>('.behind .scard') : null;
      const now = el ? depthOf(el) : 0;
      if (now !== hovered) { hovered = now; hover(now); }
      if (onCards || onStrip) { clearTimeout(closeTimer); closeTimer = undefined; }
      else closeTimer ??= setTimeout(() => { closeTimer = undefined; void putDown(); }, CLOSE_AFTER_MS);
    }
    await wait(30);
  }
}

/** A card behind rises under the pointer, the cards behind it with it (stack-layout.ts hoverPlace). */
function hover(hovered: number): void {
  for (const el of els()) { set(el, hoverPlace(depthOf(el), hovered)); el.classList.toggle('lit', depthOf(el) === hovered); }
}

/** A card drawn out: up clear of the stack, then down over the main window, which by then shows its
 *  game; it fades into it, the game watched before goes back to its place, and the stack goes down. */
async function pick(el: HTMLElement): Promise<void> {
  const card = cards.find((g) => g.id === el.dataset.game);
  if (!card || !show) return;
  picking = true;
  clearTimeout(closeTimer);
  root.classList.add('stack-busy');
  // Onto the layer that reaches over the main window, where it is now: then up and down.
  el.style.transitionDelay = '0ms';
  drawn.append(el);
  if (!reducedMotion.matches) {
    void el.offsetHeight;
    el.style.setProperty('--move', `${RISE_MS}ms`);
    set(el, { y: pickRise(depthOf(el), show.cardH), scale: 1, brightness: 1.05 });
    await wait(RISE_MS);
    el.style.setProperty('--move', `${LAND_MS}ms`);
    set(el, cardPlace(0));
    await wait(LAND_MS);
  }
  bus.send('main', 'stack-picked', { card });
  show = { ...show, currentId: card.id };
  draw();
  el.style.opacity = '0';
  await wait(reducedMotion.matches ? 0 : 300);
  el.remove();
  root.classList.remove('stack-busy');
  picking = false;
  await putDown();
}

bus.on('stack-show', (s) => bringUp(s));
bus.on('stack-refresh', ({ today }) => { if (up && !picking) refresh(today); });
bus.on('stack-close', () => {
  ++run;
  clearTimeout(closeTimer);
  up = picking = false;
  hovered = 0;
  root.classList.remove('stack-up', 'stack-busy');
  layer.innerHTML = '';
  drawn.innerHTML = '';
  void setThrough(true);
  bus.send('main', 'stack-state', { up: false });
});

// Under `npm run dev` in a browser: where the pointer is, from this page and from the main page under it.
if (!shell) {
  document.addEventListener('pointermove', (e) => { devPointer = { x: e.clientX, y: e.clientY }; });
  bus.on('stack-cursor', (p) => { devPointer = p; });
}
layer.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('.scard');
  if (el && up && !picking) void pick(el);
});

// Clear and letting the pointer through until the main window brings the cards up.
if (shell) await (await import('@tauri-apps/api/window')).getCurrentWindow().setIgnoreCursorEvents(true);
else bus.send('main', 'stack-through', true);
