// The main window. Picks a game, subscribes to it (live, or a replay of a finished one) and
// draws the tier the window's height asks for. Following a team is M4 (docs/PLAN.md).
//
// URL parameters, for development: ?game=<ESPN event id>, &replay (replay even if live),
// &pace=real|compact|results, &speed=<n>, &lang=en|zh-TW. In `npm run dev` only, &fixture replays
// fixtures/nba/game-<id>.json instead of asking ESPN (node scripts/probe/06-fixtures.mjs).

import type { GameCard, GameState } from '../model/types.ts';
import type { GameFeed } from '../data/espn/feed-types.ts';
import { dayGames, loadFeed, type FetchJson } from '../data/espn/fetch.ts';
import { EspnLiveSource } from '../data/espn/live-source.ts';
import { EspnReplaySource } from '../data/replay/espn-replay-source.ts';
import type { PaceMode } from '../data/replay/pacing.ts';
import { langOf, STRINGS } from '../i18n/index.ts';
import { TIER_PRESET, tierOf } from '../render/tiers.ts';
import { barView, dotView, messageView } from './views.ts';

const params = new URLSearchParams(location.search);
const T = STRINGS[langOf(params.get('lang') ?? navigator.language)];
const app = document.getElementById('app')!;

// One request in flight at a time across the whole app.
let chain: Promise<unknown> = Promise.resolve();
const fetchJson: FetchJson = (url) => {
  const run = async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json() as Promise<unknown>;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
};

let state: GameState | undefined;
let tag: string | undefined;
let message = T.loading;
let messageSub: string | undefined;

function render(): void {
  const tier = tierOf(app.clientHeight);
  app.dataset.tier = tier;
  if (!state) { app.innerHTML = messageView(message, tier === 'bar' ? messageSub : undefined); return; }
  app.innerHTML = tier === 'dot' ? dotView(state, T, tag) : barView(state, T, tag);
}

const live = new EspnLiveSource(fetchJson);
document.addEventListener('visibilitychange', () => live.setBackground(document.hidden));

function pace(): PaceMode {
  const p = params.get('pace');
  return p === 'real' ? { kind: 'real' } : p === 'results' ? { kind: 'results' } : { kind: 'compact' };
}

function follow(id: string, how: 'live' | 'replay'): void {
  const handlers = {
    onEvent: () => {},
    onState: (s: GameState) => { state = s; render(); },
    onError: (e: unknown) => { console.warn(e); if (!state) { message = T.offline; render(); } },
  };
  if (how === 'live') { tag = undefined; live.subscribe(id, handlers); return; }
  tag = T.replay;
  const fromFixture = import.meta.env.DEV && params.has('fixture');
  const load = (gid: string) => (fromFixture
    ? fetch(`/fixtures/nba/game-${gid}.json`).then((r) => r.json() as Promise<GameFeed>)
    : loadFeed(fetchJson, gid));
  new EspnReplaySource(load, { pace: pace(), speed: Number(params.get('speed') ?? 1) }).subscribe(id, handlers);
}

const tipOff = (c: GameCard) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(c.start);

async function start(): Promise<void> {
  const id = params.get('game');
  if (id) { follow(id, params.has('replay') ? 'replay' : 'live'); return; }
  const games = await dayGames(fetchJson);
  const now = games.find((g) => g.status === 'live' || g.status === 'break');
  if (now) { follow(now.id, 'live'); return; }
  const next = games.filter((g) => g.status === 'scheduled').sort((a, b) => a.start - b.start)[0];
  message = T.noGame;
  messageSub = next ? T.nextGame(`${next.teams.away.abbr} @ ${next.teams.home.abbr} ${tipOff(next)}`) : undefined;
  render();
}

// The window has no title bar or border: press and drag moves it, a double-click switches
// between the dot and the bar. (Tauri's drag region would turn a double-click into maximize.)
// Outside the desktop shell (npm run dev in a browser) there is no window to move or resize.
const shell = '__TAURI_INTERNALS__' in window;
const win = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();
app.addEventListener('mousedown', async (e) => {
  if (shell && e.button === 0 && e.detail === 1) await (await win()).startDragging();
});
app.addEventListener('dblclick', async () => {
  if (!shell) return;
  const { LogicalSize } = await import('@tauri-apps/api/window');
  const next = TIER_PRESET[tierOf(app.clientHeight) === 'dot' ? 'bar' : 'dot'];
  await (await win()).setSize(new LogicalSize(next.w, next.h));
});

new ResizeObserver(render).observe(app);
render();
start().catch((e: unknown) => { console.warn(e); message = T.offline; render(); });
