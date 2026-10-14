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
  /** The game is on: the box score is asked again every BOX_EVERY_MS. */
  live: boolean;
  lang: string;
}

const BOX_EVERY_MS = 30_000;
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
  // A side's box score: the window shaded in that side's colour (app.css `.tinted`); the teams' stats stay plain.
  const tint = game?.teams.away.id && side !== 'team' ? gameColours(game.teams, favIn(game.teams, game.favourites))[side] : undefined;
  app.classList.toggle('tinted', !!tint);
  if (tint) app.style.setProperty('--side', `#${tint}`);
}

const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json() as Promise<unknown>; };

async function load(): Promise<void> {
  const id = game?.gameId;
  if (!id) return;
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
