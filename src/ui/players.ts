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
import { boxView, favIn, type BoxTab } from './views.ts';
import { closeOnRequest } from './side-window.ts';

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

function render(): void {
  const onCourt = new Set(game?.onCourt ? [...game.onCourt.away, ...game.onCourt.home] : []);
  app.innerHTML = boxView(game?.teams, box, side, T, game?.favourites ?? [], onCourt, stats);
  // The window shaded in the colour of the side shown (app.css `.tinted`), or for the teams' stats
  // in both, the away side's on the left and the home side's on the right, as their bars grow.
  const c = game?.teams.away.id ? gameColours(game.teams, favIn(game.teams, game.favourites)) : undefined;
  app.classList.toggle('tinted', !!c && side !== 'team');
  app.classList.toggle('tinted-both', !!c && side === 'team');
  if (c && side !== 'team') app.style.setProperty('--side', `#${c[side]}`);
  if (c) { app.style.setProperty('--away', `#${c.away}`); app.style.setProperty('--home', `#${c.home}`); }
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
    if (game?.gameId === id) { box = data.players; stats = data.teams; render(); }
  } catch (e) { console.warn(e); }
}

function receive(next: PlayersState): void {
  const changed = next.gameId !== game?.gameId;
  // A new play on the main window: the box score follows it, not up to BOX_EVERY_MS later.
  if (!changed && next.live && JSON.stringify(next.lastPlay) !== JSON.stringify(game?.lastPlay)) loadSoon();
  T = STRINGS[langOf(next.lang)];
  game = next;
  if (changed) {
    // A new game: the favourite's side first if it is playing, and its box score now.
    const fav = favIn(next.teams, next.favourites);
    side = fav && next.teams.home.id === fav ? 'home' : 'away';
    box = undefined;
    stats = undefined;
    void load();
  }
  render();
}

setInterval(() => { if (game?.live) void load(); }, BOX_EVERY_MS);

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-box-side]');
  if (el?.dataset.boxSide) { side = el.dataset.boxSide as BoxTab; render(); }
});

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
