// The card stack: today's other games as cards behind the main window, out of sight until the pointer
// touches the window's top edge. Then the window grows upward (src/ui/main.ts grow) and they come up
// from behind it one after another; off the stack for a moment, they go back down and the window
// shrinks again. The main window's view stays where it is on the screen throughout: while the stack
// is up, #app keeps its height at the window's bottom (app.css `html.stacking`).

import type { GameCard } from '../model/types.ts';
import type { Strings } from '../i18n/index.ts';
import { backCards } from './day-order.ts';
import { cardPlace, CLOSE_AFTER_MS, FAN_MS, hoverPlace, LAND_MS, pickRise, RISE_MS, STAGGER_MS, stackRoom } from './stack-layout.ts';
import { stackView } from './views.ts';

/** What the stack asks of the main window. */
export interface StackHost {
  /** Today's games, asked of ESPN once each time the stack comes up; rejects when that fails. */
  today(): Promise<GameCard[]>;
  /** The last list of today's games there was (perhaps old), if any. */
  lastToday(): GameCard[] | undefined;
  currentId(): string | undefined;
  favourites(): readonly string[];
  /** Whether the stack may come up now: switched on, no panel open. */
  allowed(): boolean;
  /** How much of the screen there is above the window, and how high the main window's view is, px. */
  roomAbove(): Promise<number>;
  cardHeight(): number;
  /** Grow the window upward by `room` (0: back to its own size), the windows beside it left where they are. */
  grow(room: number): Promise<void>;
  /** A card drawn out to the front (src/ui/main.ts). */
  picked(card: GameCard): void;
}

export interface Stack {
  /** Down at once, the window its own size again: before anything else moves or resizes the window. */
  closeNow(): Promise<void>;
}

export function createStack(host: StackHost, T: Strings, tipOff: (g: GameCard) => string): Stack {
  const root = document.documentElement;
  const layer = document.createElement('div');
  layer.className = 'stack';
  // The strip along the main window's top edge: over #app, where the stack under it cannot be.
  const edge = document.createElement('div');
  edge.className = 'edge';
  // A card drawn out comes down in front of #app: over it, on a layer of its own.
  const drawn = document.createElement('div');
  drawn.className = 'stack drawn';
  document.body.append(layer, edge, drawn);

  let cards: GameCard[] = [];
  /** up: the cards are out or coming out; grown: the window is taller than its own size, with room for `fits` cards. */
  let up = false, grown = false, fits = 0;
  /** A card is being drawn out: nothing else answers the pointer until it is in front. */
  let picking = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined, settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Each bring-up or put-down: a later one makes an earlier one's waiting steps stop. */
  let run = 0;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const els = () => [...layer.querySelectorAll<HTMLElement>('.scard')];
  const place = (el: HTMLElement, depth: number, lifted = false) => {
    const p = cardPlace(depth, lifted);
    el.style.setProperty('--y', `${p.y}`);
    el.style.setProperty('--s', `${p.scale}`);
    el.style.setProperty('--b', `${p.brightness}`);
  };
  const depthOf = (el: HTMLElement) => Number(el.style.getPropertyValue('--depth'));
  /** Each card to its place, out or in, in turn: out the nearest first, in the furthest first. */
  const fan = (out: boolean) => {
    const all = els();
    // Out and back slowly; once there, a card lifts under the pointer quickly (app.css --move).
    root.style.setProperty('--move', `${FAN_MS}ms`);
    for (const el of all) {
      const d = depthOf(el);
      el.style.transitionDelay = `${(out ? d - 1 : all.length - d) * STAGGER_MS}ms`;
      place(el, out ? d : 0);
    }
    clearTimeout(settleTimer);
    // Once the last is out, a card answers the pointer at once, not after its turn in the fan.
    settleTimer = setTimeout(() => { for (const el of els()) el.style.transitionDelay = '0ms'; root.style.removeProperty('--move'); }, all.length * STAGGER_MS + 50);
  };
  /** Draw `list`'s cards behind the window, as many as `shown`, already where `up` puts them. */
  const draw = (list: GameCard[], shown: number) => {
    cards = backCards(list, host.currentId(), host.favourites()).slice(0, shown);
    layer.innerHTML = stackView(cards, T, tipOff, host.favourites());
    for (const el of els()) { el.style.transition = 'none'; place(el, up ? depthOf(el) : 0); }
    void layer.offsetHeight;
    for (const el of els()) el.style.transition = '';
  };

  /** Each resize of the window waits for the one before: a put-down asked for while it grows shrinks it after. */
  let resizing: Promise<void> = Promise.resolve();
  const resize = (room: number) => (resizing = resizing.then(() => host.grow(room), () => host.grow(room)));
  /** The pointer is on the main window, a card or the strip: off it, the stack goes down a moment later. */
  let pointerIn = false;
  /** The cards behind, ESPN's newer list in hand: the same cards, their strips as they now stand (not drawn
   *  again, which would put them in place at once instead of letting them come up). */
  const refresh = (list: GameCard[]) => {
    for (const el of els()) {
      const g = list.find((x) => x.id === el.dataset.game);
      const strip = el.querySelector('.strip');
      if (!g || !strip) continue;
      const tmp = document.createElement('div');
      tmp.innerHTML = stackView([g], T, tipOff, host.favourites());
      strip.innerHTML = tmp.querySelector('.strip')?.innerHTML ?? strip.innerHTML;
      el.classList.toggle('live', tmp.querySelector('.scard')?.classList.contains('live') ?? false);
    }
  };

  async function bringUp(): Promise<void> {
    clearTimeout(closeTimer);
    if (up || picking) return;
    if (!host.allowed()) return;
    const mine = ++run;
    // Nothing comes up this time: if it was going down, it still goes down.
    const none = async () => { if (mine === run && grown) await shrink(); };
    const fresh = host.today().catch(() => undefined);
    const list = host.lastToday() ?? (await fresh);
    if (mine !== run) return;
    if (!list) return none();
    const count = backCards(list, host.currentId(), host.favourites()).length;
    edge.classList.toggle('none', !count);
    if (!count) return none();
    // Back up while it was still going down: the window is still tall, the cards come out from where they are.
    if (!grown) {
      const cardH = host.cardHeight();
      const { room, shown } = stackRoom(count, cardH, await host.roomAbove());
      if (mine !== run || !shown) return;
      draw(list, shown);
      root.style.setProperty('--card-h', `${cardH}px`);
      root.classList.add('stacking');
      grown = true;
      fits = shown;
      await resize(room);
      if (mine !== run) return;
    }
    up = true;
    root.classList.add('stack-up');
    fan(true);
    // The pointer left while the window grew: down again, as if it had left now.
    if (!pointerIn) later();
    void fresh.then((newer) => { if (newer && mine === run && up && !picking) refresh(newer); });
  }

  async function putDown(): Promise<void> {
    if (!up && !grown) return;
    const mine = ++run;
    up = false;
    root.classList.remove('stack-up');
    fan(false);
    // The window shrinks once the furthest card is behind the main window again.
    if (!reducedMotion.matches) await wait(els().length * STAGGER_MS + FAN_MS);
    if (mine !== run) return;
    await shrink();
  }

  async function shrink(): Promise<void> {
    if (!grown) return;
    grown = false;
    await resize(0);
    // #app lets go of its height only once the web view is its own size again: before, it would fill
    // the tall window for a frame, and the view would take it for the court's size.
    const cardH = parseFloat(root.style.getPropertyValue('--card-h')) || 0;
    for (let i = 0; i < 20 && window.innerHeight > cardH + 1; i++) await new Promise(requestAnimationFrame);
    if (grown) return;
    root.classList.remove('stacking');
    layer.innerHTML = '';
  }

  // On the main window or a card, the stack stays; anywhere else, and off the window, it goes down a moment later.
  const onStack = (t: EventTarget | null) => t instanceof Element && !!t.closest('#app, .scard, .edge');
  // Not while a card is being drawn out: the stack goes down when it is in front.
  function later(): void { if (picking) return; clearTimeout(closeTimer); closeTimer = setTimeout(() => void putDown(), CLOSE_AFTER_MS); }
  edge.addEventListener('pointerenter', () => { pointerIn = true; void bringUp(); });
  // The hint along the top edge only when there is something behind (as far as the last list knows).
  document.getElementById('app')?.addEventListener('pointerenter', () => {
    const list = host.lastToday();
    edge.classList.toggle('none', !host.allowed() || (!!list && !backCards(list, host.currentId(), host.favourites()).length));
  });
  document.addEventListener('pointerover', (e) => {
    pointerIn = onStack(e.target);
    if (pointerIn) clearTimeout(closeTimer);
    else if (up || grown) later();
  });
  root.addEventListener('pointerleave', () => { pointerIn = false; if (up || grown) later(); });
  // A card behind rises under the pointer, the cards behind it with it (stack-layout.ts hoverPlace).
  const hover = (hovered: number) => {
    for (const el of els()) {
      const p = hoverPlace(depthOf(el), hovered);
      el.style.setProperty('--y', `${p.y}`);
      el.style.setProperty('--s', `${p.scale}`);
      el.style.setProperty('--b', `${p.brightness}`);
    }
  };
  layer.addEventListener('pointerover', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('.scard');
    if (el && up && !picking) hover(depthOf(el));
  });
  layer.addEventListener('pointerout', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('.scard');
    const to = (e.relatedTarget as Element | null)?.closest?.('.scard');
    if (el && up && !picking && !to) hover(0);
  });

  /** A card drawn out: up clear of the stack, then down in front of the main window, which by then
   *  shows its game; it fades into it, the game watched before goes back to its place in the stack,
   *  and the stack goes down. */
  async function pick(el: HTMLElement): Promise<void> {
    const card = cards.find((g) => g.id === el.dataset.game);
    if (!card) return;
    picking = true;
    clearTimeout(closeTimer);
    root.classList.add('stack-busy');
    if (!reducedMotion.matches) {
      el.style.transitionDelay = '0ms';
      el.style.setProperty('--move', `${RISE_MS}ms`);
      el.style.zIndex = '200';
      el.style.setProperty('--y', `${pickRise(depthOf(el), host.cardHeight())}`);
      el.style.setProperty('--s', '1');
      el.style.setProperty('--b', '1.05');
      await wait(RISE_MS);
      // Clear of the stack and of the main window: over to the layer in front of it, then down.
      drawn.append(el);
      void el.offsetHeight;
      el.style.setProperty('--move', `${LAND_MS}ms`);
      place(el, 0);
      await wait(LAND_MS);
    }
    host.picked(card);
    // The game watched before goes back to its place among the others, already out.
    const list = host.lastToday();
    if (list) draw(list, fits);
    el.style.opacity = '0';
    await wait(reducedMotion.matches ? 0 : 300);
    el.remove();
    root.classList.remove('stack-busy');
    picking = false;
    await putDown();
  }
  layer.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('.scard');
    if (el && up && !picking) void pick(el);
  });

  return {
    async closeNow() {
      ++run;
      clearTimeout(closeTimer);
      up = false;
      root.classList.remove('stack-up');
      await shrink();
    },
  };
}
