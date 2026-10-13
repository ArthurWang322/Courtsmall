// The main window. Decides what to show (src/follow/decide.ts), subscribes to that game, sends the
// notices for it, and draws the tier the window's height asks for. The settings page (team and
// notices) opens from the tray menu.
//
// URL parameters, for development: ?game=<ESPN event id> (skip following), &replay (replay even
// if live), &pace=real|compact|results, &speed=<n>, &lang=en|zh-TW, &settings (open settings).
// In `npm run dev` only, &fixture replays fixtures/nba/game-<id>.json and reads the team list from
// fixtures/nba/teams.json instead of asking ESPN (node scripts/probe/06-fixtures.mjs).

import type { GameCard, GameState, TeamRef, Unsubscribe } from '../model/types.ts';
import type { GameFeed } from '../data/espn/feed-types.ts';
import { allTeams, dayGames, loadFeed, teamGames, type FetchJson } from '../data/espn/fetch.ts';
import { EspnLiveSource } from '../data/espn/live-source.ts';
import { EspnReplaySource } from '../data/replay/espn-replay-source.ts';
import type { PaceMode } from '../data/replay/pacing.ts';
import { decide, type Decision } from '../follow/decide.ts';
import { langOf, STRINGS } from '../i18n/index.ts';
import { Notifier } from '../notify/notifier.ts';
import { notices } from '../notify/rules.ts';
import { playLinesAt, TIER_PRESET, tierOf } from '../render/tiers.ts';
import { loadSettings, saveSettings, type Settings } from '../settings/store.ts';
import { barView, dotView, messageView, settingsView, upcomingView } from './views.ts';

// In `npm run dev`, VITE_PARAMS fills in for the URL, which the desktop window does not have:
// VITE_PARAMS='game=401898721&replay' npx tauri dev
const params = new URLSearchParams(location.search || (import.meta.env.DEV ? (import.meta.env.VITE_PARAMS as string | undefined) ?? '' : ''));
const T = STRINGS[langOf(params.get('lang') ?? navigator.language)];
const app = document.getElementById('app')!;
const shell = '__TAURI_INTERNALS__' in window;
const win = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();

/** How often the schedule is asked again while no game is on screen, ms. */
const DECIDE_EVERY_MS = 60_000;
/** How long a team's schedule is reused, ms. */
const TEAM_SCHEDULE_TTL_MS = 5 * 60_000;
const SETTINGS_SIZE = { w: 360, h: 380 };

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

let settings: Settings = loadSettings();
let teams: TeamRef[] = [];

// What is on screen.
let state: GameState | undefined;
let currentId: string | undefined;
let finalAt: number | undefined;
let replaying = false;
let unsubscribe: Unsubscribe | undefined;
let upcoming: GameCard | undefined;
let message = T.loading;
let messageSub: string | undefined;
let settingsOpen = false;
let sizeBeforeSettings: { w: number; h: number } | undefined;

function whenOf(g: GameCard): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(g.start);
  const day = (t: number) => new Date(t).toDateString();
  if (day(g.start) === day(Date.now())) return `${T.today} ${time}`;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(g.start);
}

function render(): void {
  const tier = tierOf(app.clientHeight);
  app.dataset.tier = settingsOpen ? 'settings' : tier;
  if (settingsOpen) { app.innerHTML = settingsView(teams, settings, T); return; }
  const tag = replaying ? T.replay : undefined;
  if (state) app.innerHTML = tier === 'dot' ? dotView(state, T, tag) : barView(state, T, playLinesAt(app.clientHeight), tag);
  else if (upcoming) app.innerHTML = upcomingView(upcoming, whenOf(upcoming), tier === 'dot');
  else app.innerHTML = messageView(message, tier === 'bar' ? messageSub : undefined);
}

const live = new EspnLiveSource(fetchJson);
const notifier = new Notifier(T);
document.addEventListener('visibilitychange', () => live.setBackground(document.hidden));

function pace(): PaceMode {
  const p = params.get('pace');
  return p === 'real' ? { kind: 'real' } : p === 'results' ? { kind: 'results' } : { kind: 'compact' };
}

function leave(): void {
  unsubscribe?.();
  unsubscribe = undefined;
  state = undefined;
  currentId = undefined;
  finalAt = undefined;
}

function follow(id: string, how: 'live' | 'replay'): void {
  leave();
  currentId = id;
  replaying = how === 'replay';
  upcoming = undefined;
  message = T.loading;
  const handlers = {
    onEvent: () => {},
    onState: (s: GameState) => {
      // Notices for live games only: a replay already happened.
      if (!replaying) notifier.send(notices(state, s, settings.notify));
      if (s.status === 'final' && finalAt === undefined) finalAt = Date.now();
      state = s;
      render();
    },
    onError: (e: unknown) => { console.warn(e); if (!state) { message = T.offline; render(); } },
  };
  if (how === 'live') { unsubscribe = live.subscribe(id, handlers); return; }
  const fromFixture = import.meta.env.DEV && params.has('fixture');
  const load = (gid: string) => (fromFixture
    ? fetch(`/fixtures/nba/game-${gid}.json`).then((r) => r.json() as Promise<GameFeed>)
    : loadFeed(fetchJson, gid));
  const replay = new EspnReplaySource(load, { pace: pace(), speed: Number(params.get('speed') ?? 1) });
  unsubscribe = replay.subscribe(id, handlers);
}

let teamCache: { team: string; at: number; games: GameCard[] } | undefined;
async function scheduleOf(team: string): Promise<GameCard[]> {
  if (teamCache?.team === team && Date.now() - teamCache.at < TEAM_SCHEDULE_TTL_MS) return teamCache.games;
  // The current part of the season (the preseason in October), then the regular season.
  const games = [...(await teamGames(fetchJson, team)), ...(await teamGames(fetchJson, team, 2))];
  teamCache = { team, at: Date.now(), games };
  return games;
}

function apply(d: Decision): void {
  if (d.kind === 'game') { if (d.id !== currentId) follow(d.id, 'live'); return; }
  leave();
  upcoming = d.kind === 'upcoming' ? d.game : undefined;
  message = T.noGame;
  messageSub = d.kind === 'idle' && d.next ? T.nextGame(`${d.next.teams.away.abbr} @ ${d.next.teams.home.abbr} ${whenOf(d.next)}`) : undefined;
  render();
}

let deciding = false;
async function decideNow(): Promise<void> {
  // Still loading the game on screen, or it is in progress: decide() would keep it anyway, so the
  // schedule is not asked (docs/PLAN.md M4: no schedule polling during a game).
  if (deciding || (currentId && (!state || state.status === 'live' || state.status === 'break' || state.status === 'delayed'))) return;
  deciding = true;
  try {
    const today = await dayGames(fetchJson);
    const teamSchedule = settings.team ? await scheduleOf(settings.team) : undefined;
    const current = currentId && state ? { id: currentId, status: state.status, ...(finalAt !== undefined ? { finalAt } : {}) } : undefined;
    apply(decide({ now: Date.now(), today, ...(settings.team ? { team: settings.team } : {}), ...(teamSchedule ? { teamGames: teamSchedule } : {}), ...(current ? { current } : {}) }));
  } catch (e) {
    console.warn(e);
    if (!state && !upcoming) { message = T.offline; render(); }
  } finally {
    deciding = false;
  }
}

async function openSettings(): Promise<void> {
  if (settingsOpen) return;
  settingsOpen = true;
  if (shell) {
    const { LogicalSize } = await import('@tauri-apps/api/window');
    sizeBeforeSettings = { w: window.innerWidth, h: window.innerHeight };
    await (await win()).setSize(new LogicalSize(SETTINGS_SIZE.w, SETTINGS_SIZE.h));
  }
  render();
  if (!teams.length) {
    const fromFixture = import.meta.env.DEV && params.has('fixture');
    try { teams = await allTeams(fromFixture ? () => fetch('/fixtures/nba/teams.json').then((r) => r.json()) : fetchJson); } catch (e) { console.warn(e); }
    render();
  }
}

async function closeSettings(): Promise<void> {
  settingsOpen = false;
  if (shell && sizeBeforeSettings) {
    const { LogicalSize } = await import('@tauri-apps/api/window');
    await (await win()).setSize(new LogicalSize(sizeBeforeSettings.w, sizeBeforeSettings.h));
  }
  render();
}

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-team], [data-done], [data-notify]');
  if (!el || !settingsOpen) return;
  if (el.dataset.done !== undefined) { void closeSettings(); return; }
  if (el.dataset.notify) {
    const key = el.dataset.notify as keyof Settings['notify'];
    settings = { ...settings, notify: { ...settings.notify, [key]: (el as HTMLInputElement).checked } };
    saveSettings(settings);
    return;
  }
  const team = el.dataset.team ?? '';
  const changed = team !== (settings.team ?? '');
  const { team: _, ...rest } = settings;
  settings = team ? { ...rest, team } : rest;
  saveSettings(settings);
  render();
  // A new team: drop the game on screen unless it is in progress (decide() never leaves one).
  if (changed && !params.has('game')) { teamCache = undefined; void decideNow(); }
});

// The window has no title bar or border: press and drag moves it, a double-click switches
// between the dot and the bar. (Tauri's drag region would turn a double-click into maximize.)
// Outside the desktop shell (npm run dev in a browser) there is no window to move or resize.
app.addEventListener('mousedown', async (e) => {
  if (shell && !settingsOpen && e.button === 0 && e.detail === 1) await (await win()).startDragging();
});
app.addEventListener('dblclick', async () => {
  if (!shell || settingsOpen) return;
  const { LogicalSize } = await import('@tauri-apps/api/window');
  const next = TIER_PRESET[tierOf(app.clientHeight) === 'dot' ? 'bar' : 'dot'];
  await (await win()).setSize(new LogicalSize(next.w, next.h));
});
if (shell) void import('@tauri-apps/api/event').then(({ listen }) => listen('open-settings', () => void openSettings()));

// Redraw only when the layout changes: redrawing on every resize notification feeds the observer
// its own changes ("ResizeObserver loop completed with undelivered notifications").
let lastLayout = '';
new ResizeObserver(() => {
  const layout = `${settingsOpen}:${tierOf(app.clientHeight)}:${playLinesAt(app.clientHeight)}`;
  if (layout !== lastLayout) { lastLayout = layout; render(); }
}).observe(app);

render();
const devGame = params.get('game');
if (devGame) follow(devGame, params.has('replay') ? 'replay' : 'live');
else {
  void decideNow();
  setInterval(() => void decideNow(), DECIDE_EVERY_MS);
}
if (params.has('settings')) void openSettings();
