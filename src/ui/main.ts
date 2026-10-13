// The main window. Decides what to show (src/follow/decide.ts), subscribes to that game, sends the
// notices for it, and draws the tier the window's height asks for. The settings page (team and
// notices) and the games list open from the toolbar that shows on hover, or from the tray menu.
//
// URL parameters, for development: ?game=<ESPN event id> (skip following), &replay (replay even
// if live), &pace=real|compact|results, &speed=<n>, &lang=en|zh-TW, &settings or &games (open
// that panel), &theme=dark|light (dev only).
// In `npm run dev` only, &fixture replays fixtures/nba/game-<id>.json and reads the team list from
// fixtures/nba/teams.json instead of asking ESPN (node scripts/probe/06-fixtures.mjs).

// Fonts, bundled (SIL OFL 1.1): Big Shoulders Display for the scores, Barlow Condensed for labels.
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/barlow-condensed/latin-500';
import '@fontsource/barlow-condensed/latin-600';
import type { GameCard, GameState, Side, TeamRef, Unsubscribe } from '../model/types.ts';
import type { GameFeed } from '../data/espn/feed-types.ts';
import { allTeams, dayGames, loadFeed, teamGames, type FetchJson } from '../data/espn/fetch.ts';
import { EspnLiveSource } from '../data/espn/live-source.ts';
import { buildTimeline } from '../data/espn/timeline.ts';
import { EspnReplaySource } from '../data/replay/espn-replay-source.ts';
import type { PaceMode } from '../data/replay/pacing.ts';
import { decide, STAY_AFTER_FINAL_MS, type Decision } from '../follow/decide.ts';
import { langOf, STRINGS } from '../i18n/index.ts';
import { Notifier } from '../notify/notifier.ts';
import { notices } from '../notify/rules.ts';
import { playLinesAt, TIER_PRESET, tierOf, TOOLBAR_H, type Tier } from '../render/tiers.ts';
import { drawFlights, shotSeconds } from '../render/court.ts';
import { gameColours, useTheme, type Theme } from '../render/colour.ts';
import { loadSettings, saveSettings, type Settings, type ThemeChoice } from '../settings/store.ts';
import { barView, controlsView, courtView, dotView, gamesView, JUMP_MS, messageView, settingsView, upcomingView, type ScoreAges } from './views.ts';

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
/** The window's size while a panel (games, settings) is open. */
const PANEL_SIZE = { w: 360, h: 420 };

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

// ---- Theme --------------------------------------------------------------------------------------
// The page's colours come from CSS tokens keyed on <html data-theme>; team colours are checked
// against the same background (src/render/colour.ts useTheme).

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
// Under `npm run dev`, &theme=dark|light overrides the setting for this page only (screenshots).
const devTheme = import.meta.env.DEV ? (params.get('theme') as Theme | null) : null;
const resolvedTheme = (): Theme => devTheme ?? (settings.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : settings.theme);
function applyTheme(): void {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  useTheme(theme);
}
function setTheme(choice: ThemeChoice): void {
  settings = { ...settings, theme: choice };
  saveSettings(settings);
  applyTheme();
  render();
}
applyTheme();
systemDark.addEventListener('change', () => { if (settings.theme === 'system') { applyTheme(); render(); } });
let teams: TeamRef[] = [];

// What is on screen.
let state: GameState | undefined;
let currentId: string | undefined;
let finalAt: number | undefined;
let replaying = false;
/** A finished game picked from the list: its result, not its plays (no replay). */
let resultOnly = false;
let unsubscribe: Unsubscribe | undefined;
let upcoming: GameCard | undefined;
let message = T.loading;
let messageSub: string | undefined;
/** A panel over the game: the games list or the settings. */
let panel: 'games' | 'settings' | undefined;
/** The games list: which day (0 = ESPN's today), and its games. */
let gamesDay = 0;
let dayList: GameCard[] = [];
/** A game the user picked from the list: following leaves it alone until it is over. */
let pinned: string | undefined;
/** When each shot on the court first appeared, epoch ms, for its animation (src/render/court.ts). */
const shotSeen = new Map<string, number>();
/** When each side's score last went up, epoch ms, for the score's jump (src/ui/views.ts). */
const scoreChangedAt: Partial<Record<Side, number>> = {};
let sizeBeforePanel: { w: number; h: number } | undefined;

/** ESPN's day `offset` days from today, "YYYYMMDD": ESPN counts days in US Eastern time. */
const espnDate = (offset: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(Date.now() + offset * 86_400_000).replaceAll('-', '');
const dayLabel = (offset: number) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', weekday: 'short' }).format(Date.now() + offset * 86_400_000);
const tipOff = (g: GameCard) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(g.start);

function whenOf(g: GameCard): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(g.start);
  const day = (t: number) => new Date(t).toDateString();
  if (day(g.start) === day(Date.now())) return `${T.today} ${time}`;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(g.start);
}

// ---- Court animation ----------------------------------------------------------------------------
// The court's flights are drawn every frame from each shot's age; marks land with a full render.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0;
let flyingIds = '';
const ageOf = (id: string, now = Date.now()) => { const at = shotSeen.get(id); return at === undefined ? undefined : (now - at) / 1000; };
const inAir = (id: string) => {
  const shot = courtShots().find((s) => s.id === id);
  const t = ageOf(id);
  return !reducedMotion.matches && shot !== undefined && t !== undefined && t < shotSeconds(shot);
};
const landed = (id: string) => !inAir(id);
/** Everything that can fly on the court: field goals and free throws. */
const courtShots = () => [...(state?.recentShots ?? []), ...(state?.recentFreeThrows ?? [])];

function animate(): void {
  frame = 0;
  if (!state || panel || tierOf(app.clientHeight) !== 'court') return;
  const shots = courtShots();
  const flying = shots.filter((s) => inAir(s.id)).map((s) => s.id).join();
  // A flight just ended: redraw so its mark is on the floor.
  if (flying !== flyingIds) { flyingIds = flying; render(); }
  const now = Date.now();
  if (!reducedMotion.matches && drawFlights(app, shots, gameColours(state.teams, settings.team), (id) => ageOf(id, now)) && !frame)
    frame = requestAnimationFrame(animate);
}

function render(): void {
  const tier = tierOf(app.clientHeight);
  // A result in a court-sized window keeps the court's layout: the score where it always is, the
  // points per period and the leaders where the court would be.
  app.dataset.tier = panel ? 'panel' : tier;
  if (panel === 'settings') { app.innerHTML = settingsView(teams, settings, T); return; }
  if (panel === 'games') { app.innerHTML = gamesView(dayLabel(gamesDay), dayList, T, tipOff, currentId); return; }
  const tag = replaying ? T.replay : undefined;
  // Below the dot the toolbar has a row of its own; the dot has no room, so there it shows on hover.
  const contentHeight = tier === 'dot' ? app.clientHeight : app.clientHeight - TOOLBAR_H;
  let body: string;
  if (state) {
    const now = Date.now();
    const ages: ScoreAges = {};
    for (const side of ['away', 'home'] as const) { const at = scoreChangedAt[side]; if (at !== undefined && now - at < JUMP_MS) ages[side] = now - at; }
    body = tier === 'dot' ? dotView(state, T, tag, settings.team, ages)
      // A finished game picked from the list is its result: no court, whatever the size.
      : tier === 'court' && !resultOnly ? courtView(state, T, landed, tag, settings.team, ages)
      : barView(state, T, playLinesAt(contentHeight), tag, settings.team, resultOnly, ages, tier === 'court');
  }
  else if (upcoming) body = upcomingView(upcoming, whenOf(upcoming), tier === 'dot');
  else body = messageView(message, tier === 'bar' ? messageSub : undefined);
  app.innerHTML = tier === 'dot' ? body + controlsView(tier, T) : `<div class="content">${body}</div>${controlsView(tier, T)}`;
  if (state && tier === 'court' && !resultOnly && !frame) frame = requestAnimationFrame(animate);
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
  shotSeen.clear();
  delete scoreChangedAt.away;
  delete scoreChangedAt.home;
  currentId = undefined;
  finalAt = undefined;
}

function follow(id: string, how: 'live' | 'replay' | 'result'): void {
  leave();
  currentId = id;
  replaying = how === 'replay';
  resultOnly = how === 'result';
  upcoming = undefined;
  message = T.loading;
  const handlers = {
    onEvent: () => {},
    onState: (s: GameState) => {
      // Notices for live games only: a replay already happened.
      if (!replaying) notifier.send(notices(state, s, settings.notify));
      if (s.status === 'final' && finalAt === undefined) finalAt = Date.now();
      // Shots already on the court when the game is first shown do not fly in.
      const seenAt = state ? Date.now() : Date.now() - 60_000;
      const onCourt = new Set([...(s.recentShots ?? []), ...(s.recentFreeThrows ?? [])].map((shot) => shot.id));
      for (const id of shotSeen.keys()) if (!onCourt.has(id)) shotSeen.delete(id);
      for (const id of onCourt) if (!shotSeen.has(id)) shotSeen.set(id, seenAt);
      // A score that went up jumps; the first state of a game does not.
      if (state) for (const side of ['away', 'home'] as const) if (s.score[side] > state.score[side]) scoreChangedAt[side] = Date.now();
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
  if (how === 'result') {
    // One load, straight to the last state: no notices, no flights (handlers.onState would do both).
    let cancelled = false;
    unsubscribe = () => { cancelled = true; };
    load(id).then((feed) => {
      const last = buildTimeline(feed).at(-1)?.state;
      if (cancelled || !last) return;
      if (last.status === 'final') finalAt = Date.now();
      for (const shot of [...(last.recentShots ?? []), ...(last.recentFreeThrows ?? [])]) shotSeen.set(shot.id, Date.now() - 60_000);
      state = last;
      render();
    }).catch(handlers.onError);
    return;
  }
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
  // A game the user picked stays until it has been over for a while, even one not started yet.
  if (pinned && pinned === currentId && !(state?.status === 'final' && finalAt !== undefined && Date.now() - finalAt >= STAY_AFTER_FINAL_MS)) return;
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

async function loadDay(): Promise<void> {
  // Under `npm run dev` with &fixture, every day is fixtures/nba/scoreboard.json.
  const fromFixture = import.meta.env.DEV && params.has('fixture');
  const get = fromFixture ? () => fetch('/fixtures/nba/scoreboard.json').then((r) => r.json()) : fetchJson;
  try { dayList = await dayGames(get, espnDate(gamesDay)); } catch (e) { console.warn(e); dayList = []; }
  if (panel === 'games') render();
}

async function openPanel(kind: 'games' | 'settings'): Promise<void> {
  const was = panel;
  panel = kind;
  if (!was && shell) {
    const { LogicalSize } = await import('@tauri-apps/api/window');
    sizeBeforePanel = { w: window.innerWidth, h: window.innerHeight };
    await (await win()).setSize(new LogicalSize(PANEL_SIZE.w, PANEL_SIZE.h));
  }
  render();
  if (kind === 'games') { gamesDay = 0; await loadDay(); }
  if (kind === 'settings' && !teams.length) {
    const fromFixture = import.meta.env.DEV && params.has('fixture');
    try { teams = await allTeams(fromFixture ? () => fetch('/fixtures/nba/teams.json').then((r) => r.json()) : fetchJson); } catch (e) { console.warn(e); }
    render();
  }
}

async function closePanel(): Promise<void> {
  panel = undefined;
  if (shell && sizeBeforePanel) {
    const { LogicalSize } = await import('@tauri-apps/api/window');
    await (await win()).setSize(new LogicalSize(sizeBeforePanel.w, sizeBeforePanel.h));
  }
  render();
}

async function setTier(t: Tier): Promise<void> {
  if (!shell) return;
  const { LogicalSize } = await import('@tauri-apps/api/window');
  await (await win()).setSize(new LogicalSize(TIER_PRESET[t].w, TIER_PRESET[t].h));
}

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tier], [data-open], [data-day], [data-game], [data-team], [data-done], [data-notify], [data-theme-toggle], [data-pick-theme]');
  if (!el) return;
  // The toolbar's button flips to the other theme; the settings page offers system, dark, light.
  if (el.dataset.themeToggle !== undefined) { setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'); return; }
  if (el.dataset.pickTheme) { setTheme(el.dataset.pickTheme as ThemeChoice); return; }
  if (el.dataset.tier) { void setTier(el.dataset.tier as Tier); return; }
  if (el.dataset.open) { void openPanel(el.dataset.open as 'games' | 'settings'); return; }
  if (el.dataset.done !== undefined) { void closePanel(); return; }
  if (el.dataset.day) { gamesDay += Number(el.dataset.day); dayList = []; render(); void loadDay(); return; }
  if (el.dataset.game) {
    // Picked from the list: a game on or to come is followed live, a finished one shows its result.
    pinned = el.dataset.game;
    follow(el.dataset.game, el.dataset.how === 'result' ? 'result' : 'live');
    void closePanel();
    return;
  }
  if (panel !== 'settings') return;
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

// The window has no title bar or border: press and drag moves it; the toolbar along the bottom
// (on hover, in the dot) switches the size and opens the panels. Outside the desktop shell (npm run dev in a browser)
// there is no window to move or resize.
app.addEventListener('mousedown', async (e) => {
  if ((e.target as HTMLElement).closest('button, input, label')) return;
  if (shell && !panel && e.button === 0 && e.detail === 1) await (await win()).startDragging();
});
if (shell) void import('@tauri-apps/api/event').then(({ listen }) => {
  void listen('open-settings', () => void openPanel('settings'));
  void listen('open-games', () => void openPanel('games'));
});

// Redraw only when the layout changes, and in the next frame: redrawing inside the observer's
// callback feeds it its own changes ("ResizeObserver loop completed with undelivered notifications").
let lastLayout = '';
new ResizeObserver(() => requestAnimationFrame(() => {
  const layout = `${panel}:${tierOf(app.clientHeight)}:${playLinesAt(app.clientHeight - TOOLBAR_H)}`;
  if (layout !== lastLayout) { lastLayout = layout; render(); }
})).observe(app);

render();
const devGame = params.get('game');
if (devGame) follow(devGame, params.has('replay') ? 'replay' : 'live');
else {
  void decideNow();
  setInterval(() => void decideNow(), DECIDE_EVERY_MS);
}
if (params.has('settings')) void openPanel('settings');
if (params.has('games')) void openPanel('games');
