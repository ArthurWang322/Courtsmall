// The stats window: the game's box score, beside the main window. The main window opens it,
// keeps it at its right edge and sends what it needs on every state (src/ui/main.ts sendStats):
// which game, the teams, who is on the court, the favourite. This window reads the box score itself,
// when the game changes and every 30 seconds while it is on. The main window's stats button closes it.
//
// Under `npm run dev` in a browser (no desktop shell) it opens in a tab: ?game=<id>&fixture reads a
// recorded game's box score, with no one starred.

import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/barlow-condensed/latin-500';
import '@fontsource/barlow-condensed/latin-600';
import type { BoxLine, Side, TeamRef, TeamStats } from '../model/types.ts';
import type { GameFeed } from '../data/espn/feed-types.ts';
import { boxScore, teamStats } from '../data/espn/box.ts';
import { loadBox } from '../data/espn/fetch.ts';
import { langOf, STRINGS } from '../i18n/index.ts';
import { gameColours } from '../render/colour.ts';
import { boxView, favIn, initials, logo, noLogo, onCourtNow, playerCardBody, playerCardHead, type BoxTab } from './views.ts';
import { loadPlayerCard } from '../data/espn/athlete.ts';
import { CARD_LEAVE_MS, CARD_TIMEOUT_MS, createCardController, type CardState } from './player-card.ts';
import { fetchWithin } from './fetch-within.ts';
import { closeOnRequest } from './side-window.ts';
import { reveal } from './reveal.ts';

/** What the main window sends (src/ui/main.ts). */
export interface PlayersState {
  gameId: string;
  teams: Record<Side, TeamRef>;
  onCourt?: Record<Side, readonly string[]>;
  favourites: readonly string[];
  /** The game is on: the box score is asked again every BOX_EVERY_MS, and soon after each new play. */
  live: boolean;
  /** The newest play on the main window's screen: when it changes, the box score is asked again. */
  lastPlay?: unknown;
  lang: string;
}

const BOX_EVERY_MS = 30_000;
/** After a new play the box score is asked again, but not sooner than this after the last time:
 *  a poll's burst of plays is one request, and ESPN's box score trails the plays a little. */
const BOX_MIN_GAP_MS = 10_000;
let lastLoadAt = 0;
let loadTimer: ReturnType<typeof setTimeout> | undefined;
function loadSoon(): void {
  if (loadTimer !== undefined) return;
  loadTimer = setTimeout(() => { loadTimer = undefined; void load(); }, Math.max(0, lastLoadAt + BOX_MIN_GAP_MS - Date.now()));
}
const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const shell = '__TAURI_INTERNALS__' in window;
let T = STRINGS[langOf(params.get('lang') ?? navigator.language)];

let game: PlayersState | undefined;
let box: Record<Side, BoxLine[]> | undefined;
let stats: Partial<Record<Side, TeamStats>> | undefined;
let side: BoxTab = 'away';
/** The full box score (every column, scrolled sideways) or the simple one; this window remembers which. */
const FULL_KEY = 'courtsmall.boxFull';
let full = (() => { try { return localStorage.getItem(FULL_KEY) === '1'; } catch { return false; } })();
/** The full view's columns' timing, from app.css (`--box-*`), in ms. */
const css = (v: string) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)) || 0;
/** How long the columns take to open (the numbers in last) or close: the switch waits this long
 *  before it can be turned again, or clicks in a row turn the columns back halfway, again and again,
 *  and the switch's thumb jumps. */
const SWITCH_MS = Math.max(css('--box-cols'), css('--box-in-delay') + css('--box-in'), css('--box-close-delay') + css('--box-cols'));
let switchedAt = 0;
/** Switched to another game: when its box score came, its lines coming in (src/ui/reveal.ts) until they
 *  are in. Not the first game: this window opens with its own movement. */
let revealedAt: number | undefined;
let revealNext = false;

function render(): void {
  const onCourt = game ? onCourtNow(game) : new Set<string>();
  // The box score is drawn again with each new play: where the list was scrolled to stays.
  const list = app.querySelector('.list'), cols = app.querySelector('.list > [data-box-cols]');
  const top = list?.scrollTop ?? 0, left = cols?.scrollLeft ?? 0;
  app.innerHTML = boxView(game?.teams, box, side, T, game?.favourites ?? [], onCourt, stats, full);
  const nextList = app.querySelector('.list');
  if (nextList) nextList.scrollTop = top;
  for (const el of app.querySelectorAll('[data-box-cols]')) el.scrollLeft = left;
  if (revealedAt !== undefined && !reveal(app, lines(), Date.now() - revealedAt)) revealedAt = undefined;
  // The window shaded in the colour of the side shown (app.css `.tinted`), or for the teams' stats
  // in both, the away side's on the left and the home side's on the right, as their bars grow.
  const c = game?.teams.away.id ? gameColours(game.teams, favIn(game.teams, game.favourites)) : undefined;
  app.classList.toggle('tinted', !!c && side !== 'team');
  app.classList.toggle('tinted-both', !!c && side === 'team');
  if (c && side !== 'team') app.style.setProperty('--side', `#${c[side]}`);
  if (c) { app.style.setProperty('--away', `#${c.away}`); app.style.setProperty('--home', `#${c.home}`); }
}

/** The lines, top to bottom: the buttons, the header, then each player's (the name and the numbers
 *  beside it, together) or each of the teams' stats. */
function lines(): HTMLElement[][] {
  const q = (sel: string) => [...app.querySelectorAll<HTMLElement>(sel)];
  const names = q('.names > .row'), nums = q('.list > .cols > .row');
  return [...q('.box > .head, .head-row, .trow').map((el) => [el]), ...names.map((el, i) => [el, ...(nums[i] ? [nums[i]] : [])])];
}

// Never from the cache, which answers with a previous response (src/ui/main.ts FRESH).
const get = async (url: string) => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json() as Promise<unknown>; };

async function load(): Promise<void> {
  const id = game?.gameId;
  if (!id) return;
  lastLoadAt = Date.now();
  try {
    let data: Awaited<ReturnType<typeof loadBox>>;
    if (import.meta.env.DEV && params.has('fixture')) {
      const { summary } = await get(`/fixtures/nba/game-${id}.json`) as GameFeed;
      data = { players: boxScore(summary), teams: teamStats(summary) };
    } else data = await loadBox(get, id);
    if (game?.gameId === id) {
      box = data.players;
      stats = data.teams;
      if (revealNext) { revealNext = false; revealedAt = Date.now(); }
      render();
    }
  } catch (e) { console.warn(e); }
}

function receive(next: PlayersState): void {
  const changed = next.gameId !== game?.gameId;
  const relang = !!layer && STRINGS[langOf(next.lang)] !== T;
  // A new play on the main window: the box score follows it, not up to BOX_EVERY_MS later.
  if (!changed && next.live && JSON.stringify(next.lastPlay) !== JSON.stringify(game?.lastPlay)) loadSoon();
  T = STRINGS[langOf(next.lang)];
  const first = !game;
  game = next;
  if (changed) {
    // A new game: the favourite's side first if it is playing, and its box score now, coming in.
    revealNext = !first;
    revealedAt = undefined;
    const fav = favIn(next.teams, next.favourites);
    side = fav && next.teams.home.id === fav ? 'home' : 'away';
    box = undefined;
    stats = undefined;
    void load();
  }
  render();
  // The card open stays (it is about the player, not this game); only a new language redraws it.
  const open = cards.state();
  if (relang && open) paintCard(open, true);
}

setInterval(() => { if (game?.live) void load(); }, BOX_EVERY_MS);

app.addEventListener('click', (e) => {
  const player = (e.target as HTMLElement).closest<HTMLElement>('[data-player]')?.dataset.player;
  if (player) openCard(player);
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-box-side]');
  if (el?.dataset.boxSide) { side = el.dataset.boxSide as BoxTab; render(); }
  if ((e.target as HTMLElement).closest('[data-box-full]') && Date.now() - switchedAt >= SWITCH_MS) {
    switchedAt = Date.now();
    full = !full;
    try { localStorage.setItem(FULL_KEY, full ? '1' : '0'); } catch { /* blocked storage: for this session only */ }
    // Not drawn again: the same cells stay, so the full view's columns open and close in place and
    // the switch's thumb travels (app.css). The next box score is drawn as it now is.
    const sw = app.querySelector<HTMLElement>('[data-box-full]');
    const track = sw?.querySelector<HTMLElement>('.t-toggle');
    sw?.classList.toggle('on', full);
    sw?.setAttribute('aria-checked', String(full));
    if (track) { track.dataset.on = String(full); track.classList.add('is-init'); }
    app.querySelector('.table')?.classList.toggle('full', full);
    // Closing from the right: back to the left as the columns close, in step with them.
    const cols = app.querySelector<HTMLElement>('.list > [data-box-cols]');
    if (!full && cols?.scrollLeft) scrollBack(cols);
  }
});

// ---- The player card ----------------------------------------------------------------------------------
// A name in the box score opens the player's card over this window (src/ui/player-card.ts holds its state). It
// lives outside #app, which is drawn again with every box score, and makes #app inert while it is open: only its ✕
// closes it.

/** A card's request, given up after CARD_TIMEOUT_MS: a stalled one becomes a failure the user can ask again. */
const getCard = fetchWithin(CARD_TIMEOUT_MS);

const cards = createCardController({
  fetch: (id) => loadPlayerCard(getCard, id, Date.now()),
  now: () => Date.now(),
  changed: (state) => (state ? paintCard(state, false) : unmountCard()),
});
/** The card on screen, if any; one leaving is not counted. */
let layer: HTMLElement | undefined;

function openCard(id: string): void {
  const s = side === 'team' ? undefined : side;
  const line = s ? box?.[s].find((l) => l.player.id === id) : undefined;
  if (!game || !s || !line) return;
  cards.open({
    id, name: line.player.name, ...(line.headshot ? { headshot: line.headshot } : {}),
    team: game.teams[s], colour: gameColours(game.teams, favIn(game.teams, game.favourites))[s],
  });
}

/** Draws the card: the whole of it when it opens or the language changes (`head`), else only its body, keeping
 *  where it was scrolled to and ✕ focused. */
function paintCard(state: CardState, head: boolean): void {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'pcard-layer';
    layer.dataset.cardLayer = '';
    const card = document.createElement('div');
    card.className = 'pcard';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', state.who.name);
    card.style.setProperty('--team', `#${state.who.colour}`);
    card.innerHTML = `<header class="pcard-head">${playerCardHead(state.who, T)}</header><div class="pcard-body">${playerCardBody(state.load, T)}</div>`;
    layer.append(card);
    document.body.append(layer);
    app.inert = true;
    layer.querySelector<HTMLElement>('[data-card-close]')?.focus();
    return;
  }
  const card = layer.querySelector<HTMLElement>('.pcard')!;
  const cols = () => layer?.querySelector<HTMLElement>('[data-card-cols]');
  const top = card.scrollTop, left = cols()?.scrollLeft ?? 0;
  if (head) layer.querySelector('.pcard-head')!.innerHTML = playerCardHead(state.who, T);
  layer.querySelector('.pcard-body')!.innerHTML = playerCardBody(state.load, T);
  card.scrollTop = top;
  const c = cols();
  if (c) c.scrollLeft = left;
  // The retry button had focus and is gone: back to ✕, inside the card.
  if (!card.contains(document.activeElement)) layer.querySelector<HTMLElement>('[data-card-close]')?.focus();
}

function unmountCard(): void {
  const leaving = layer;
  layer = undefined;
  if (!leaving) return;
  leaving.classList.add('leaving');
  setTimeout(() => {
    leaving.remove();
    // A card opened meanwhile keeps the box score inert and its ✕ focused.
    if (layer) return;
    app.inert = false;
    (document.activeElement as HTMLElement | null)?.blur();
  }, CARD_LEAVE_MS);
}

// The card is outside #app (inert while it is open), so its buttons are heard here.
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest?.('[data-card-layer]')) return;
  if (t.closest('[data-card-close]')) cards.close();
  else if (t.closest('[data-card-retry]')) cards.retry();
});
// A headshot that does not load (none at ESPN, offline): the initials take its place. Image errors do not bubble.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  // The team's logo on the card: its badge instead, as the main window does (src/ui/main.ts).
  const who = cards.state()?.who;
  if (img.matches('[data-card-layer] img.logo') && who) {
    noLogo.add(who.team.abbr);
    img.outerHTML = logo(who.team, who.colour);
    return;
  }
  if (!img.matches('[data-card-layer] img[data-face]')) return;
  const name = img.closest('.pcard-head')?.querySelector('.pcard-name')?.textContent ?? '';
  const disc = document.createElement('i');
  disc.className = 'pcard-face initials';
  disc.textContent = initials(name);
  img.replaceWith(disc);
}, true);

/**
 * Scrolls the full box score's numbers back to the left as its columns close, keeping to the share of
 * what is left to scroll that it was at, frame by frame: what is on screen moves one way only, and
 * reaches the left as the columns finish. The browser's own smooth scroll, quicker, threw it right,
 * then the columns pulled it back; one on its own clock ran ahead of the columns near the end.
 */
function scrollBack(el: HTMLElement): void {
  const share = el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth), until = performance.now() + SWITCH_MS;
  const step = (now: number) => {
    el.scrollLeft = share * (el.scrollWidth - el.clientWidth);
    if (now < until && el.isConnected && !full) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// The full box score's header follows its numbers sideways.
app.addEventListener('scroll', (e) => {
  const el = e.target as HTMLElement;
  if (el.matches?.('.list > [data-box-cols]')) for (const h of app.querySelectorAll('.head-row [data-box-cols]')) h.scrollLeft = el.scrollLeft;
}, true);

render();
void closeOnRequest(app);
if (shell) {
  const { listen, emitTo } = await import('@tauri-apps/api/event');
  await listen<PlayersState>('players-state', (e) => receive(e.payload));
  await emitTo('main', 'players-ready');
} else if (params.get('game')) {
  receive({ gameId: params.get('game')!, teams: { away: { id: '', abbr: '', name: '' }, home: { id: '', abbr: '', name: '' } }, favourites: [], live: false, lang: params.get('lang') ?? navigator.language });
  // The teams come with the box score's summary under &fixture; a recorded game's file has them.
  if (import.meta.env.DEV && params.has('fixture')) {
    const feed = await get(`/fixtures/nba/game-${params.get('game')}.json`) as GameFeed;
    const teams = {} as Record<Side, TeamRef>;
    for (const c of feed.summary.header.competitions[0]!.competitors) teams[c.homeAway] = { id: c.team.id, abbr: c.team.abbreviation, name: c.team.displayName, ...(c.team.color ? { color: c.team.color } : {}) };
    if (game) { game = { ...game, teams }; render(); }
  }
}
