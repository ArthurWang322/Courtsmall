// The main window. Decides what to show (src/follow/decide.ts), subscribes to that game, sends the
// notices for it, and draws the tier the window's height asks for. The settings page (team and
// notices) and the games list open from the toolbar that shows on hover, or from the tray menu.
//
// URL parameters, for development: ?game=<ESPN event id> (skip following), &replay (replay even
// if live), &result (show it as it stands, no replay), &pace=real|compact|results, &speed=<n>, &lang=en|zh-TW, &settings or &games (open
// that panel).
// In `npm run dev` only, &fixture replays fixtures/nba/game-<id>.json and reads the team list from
// fixtures/nba/teams.json instead of asking ESPN (node scripts/probe/06-fixtures.mjs).

// Fonts, bundled (SIL OFL 1.1): Big Shoulders Display for the scores, Barlow Condensed for labels.
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/barlow-condensed/latin-500';
import '@fontsource/barlow-condensed/latin-600';
import type { GameCard, GameState, Shot, Side, TeamRef, Unsubscribe } from '../model/types.ts';
import type { GameFeed } from '../data/espn/feed-types.ts';
import { allTeams, dayGames, loadFeed, teamColour, teamGames, type FetchJson } from '../data/espn/fetch.ts';
import { EspnLiveSource } from '../data/espn/live-source.ts';
import { buildTimeline, initialState } from '../data/espn/timeline.ts';
import { EspnReplaySource } from '../data/replay/espn-replay-source.ts';
import type { PaceMode } from '../data/replay/pacing.ts';
import { decide, STAY_AFTER_FINAL_MS, type Decision } from '../follow/decide.ts';
import { CHANGELOG } from '../changelog.ts';
import { langOf, STRINGS } from '../i18n/index.ts';
import { Notifier } from '../notify/notifier.ts';
import { assumedBefore, notices } from '../notify/rules.ts';
import { SHORTCUTS, type ShortcutAction } from './shortcuts.ts';
import { checkForUpdate, installUpdate, type UpdateState } from './update.ts';
import { between, cornerRect, ease, GLIDE_MS, LINE_H, PLAYERS_W, sideRects, SIDE_GAP, type Rect } from './placement.ts';
import { LEAVE_MS } from './side-window.ts';
import { Pacer } from './pacer.ts';
import { playLinesAt, TIER_PRESET, tierOf, TOOLBAR_H, type Tier } from '../render/tiers.ts';
import { drawFlights, flightSeconds, LANDED, shotSeconds, WINDUP_SECONDS } from '../render/court.ts';
import { gameColours } from '../render/colour.ts';
import { loadSettings, saveSettings, type Settings } from '../settings/store.ts';
import { barView, changelogView, controlsView, courtView, favIn, gamesView, JUMP_MS, messageView, noLogo, playLines, SLIDE_MS, pregameView, settingsView, type ScoreAges } from './views.ts';

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
/** The window's size while a panel is open: the games list is long, the settings are short. */
const PANEL_SIZE = { games: { w: 360, h: 330 }, settings: { w: 360, h: 300 }, changelog: { w: 360, h: 330 } } as const;
/** Where feedback and bug reports go, by mail from the settings. */
const FEEDBACK_MAIL = 'arthur800322@hotmail.com';

// One request in flight at a time across the whole app.
let chain: Promise<unknown> = Promise.resolve();
/** Never from the web view's cache: ESPN sends `stale-while-revalidate=7200`, so the cache answered
 *  with the previous response (a poll behind, or a game as it was hours ago, at half time, when it
 *  was last opened) while it fetched the new one in the background. */
const FRESH: RequestInit = { cache: 'no-store' };
const fetchJson: FetchJson = (url) => {
  const run = async () => {
    const res = await fetch(url, FRESH);
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
/** A finished game picked from the list: its result, not its plays (no replay). */
let resultOnly = false;
let unsubscribe: Unsubscribe | undefined;
let upcoming: GameCard | undefined;
/** Games the schedule last had as not started: one of them coming on has just tipped off. */
const knownScheduled = new Set<string>();
let message = T.loading;
let messageSub: string | undefined;
/** A panel over the game: the games list or the settings. */
type Panel = 'games' | 'settings' | 'changelog';
let panel: Panel | undefined;
/** The games list: which day (0 = ESPN's today), and its games. */
let gamesDay = 0;
let dayList: GameCard[] = [];
/** A game the user picked from the list: following leaves it alone until it is over. */
let pinned: string | undefined;
/** When each shot on the court first appeared, epoch ms, for its animation (src/render/court.ts). */
const shotSeen = new Map<string, number>();

/** When each side's score last went up, epoch ms, for the score's jump (src/ui/views.ts). */
const scoreChangedAt: Partial<Record<Side, number>> = {};
/** The newest play line on screen, and when it changed, epoch ms, for its slide in (src/ui/views.ts).
 *  Undefined until a game's first state, which shows as it is, nothing sliding. */
let playKey: string | undefined;
let playChangedAt: number | undefined;
/** The state before the newest line changed, for the line it pushed out at the bottom, and the
 *  state last drawn (which becomes that one when the next line comes). */
let playBefore: GameState | undefined;
let playShown: GameState | undefined;
/** Where the play lines sit, measured after each draw (app.css `.moving`): from the newest down to the
 *  first older line (across the divider), from one older line to the next, and the last one's top. */
const lineGaps = { first: 29, step: 21, last: 0 };
let sizeBeforePanel: { w: number; h: number } | undefined;
/** The favourite team's list is open on the settings page. */
let pickerOpen = false;
/** The stats windows are open (src/ui/players.ts, src/ui/linescore.ts). */
let playersOpen = false;

/** ESPN's day `offset` days from today, "YYYYMMDD": ESPN counts days in US Eastern time. */
const espnDate = (offset: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(Date.now() + offset * 86_400_000).replaceAll('-', '');
const dayLabel = (offset: number) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', weekday: 'short' }).format(Date.now() + offset * 86_400_000);
const tipOff = (g: GameCard) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(g.start);

/** When a game tips off, short enough for the clock cell: "Today 19:30", "Tomorrow 09:30", "10/23 09:30". */
function whenOf(g: Pick<GameCard, 'start'>): string {
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(g.start);
  const day = (t: number) => new Date(t).toDateString();
  if (day(g.start) === day(Date.now())) return `${T.today} ${time}`;
  if (day(g.start) === day(Date.now() + 86_400_000)) return `${T.tomorrow} ${time}`;
  const d = new Date(g.start);
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
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
/** Everything that can fly on the court: field goals and free throws, and a shot already in the air
 *  whose play has not shown yet. */
const courtShots = () => [...(state?.recentShots ?? []), ...(state?.recentFreeThrows ?? []), ...flying.values()];

function animate(): void {
  frame = 0;
  if (!state || panel || tierOf(app.clientHeight) !== 'court') return;
  const shots = courtShots();
  const flying = shots.filter((s) => inAir(s.id)).map((s) => s.id).join();
  // A flight just ended: redraw so its mark is on the floor.
  if (flying !== flyingIds) { flyingIds = flying; render(); }
  const now = Date.now();
  if (!reducedMotion.matches && drawFlights(app, shots, gameColours(state.teams, favIn(state.teams, settings.favourites)), (id) => ageOf(id, now)) && !frame)
    frame = requestAnimationFrame(animate);
}

// The window is two parts made once: the view, redrawn on every state, and the toolbar, redrawn only
// when what it shows changes. Rebuilding the toolbar each time would drop the pointer's hover, and
// with it the button's tip, every few seconds.
const contentEl = document.createElement('div');
contentEl.className = 'content';
const controlsEl = document.createElement('div');
controlsEl.className = 'toolbar';
app.replaceChildren(contentEl, controlsEl);
let controlsFor = '';

/** Put `html` in the view; `tier`: the toolbar for that size, or none (a panel). */
/** One turn of the clock cell's light, and one breath, ms (app.css `--phase`). */
const CLOCK_LIGHT_MS = 2400;
/** A game picked from the list: how long the list gives way, then how long the game takes to come
 *  in once a panel closes (app.css `.picking`, `.entering`), ms. */
const PICK_MS = 320;
const ENTER_MS = 700;
let picking: string | undefined;
let enteredAt = 0;
/** The window is gliding back from a panel: the view is hidden until it is there. */
let gliding = false;

function show(html: string, tier: Tier | undefined): void {
  // The clock cell's light is redrawn with the rest: started where the wall clock says it is, it
  // carries on across redraws instead of starting over.
  contentEl.style.setProperty('--phase', `${-(Date.now() % CLOCK_LIGHT_MS)}ms`);
  contentEl.style.setProperty('--shift-first', `${lineGaps.first}px`);
  contentEl.style.setProperty('--shift', `${lineGaps.step}px`);
  contentEl.style.setProperty('--last-top', `${lineGaps.last}px`);
  contentEl.innerHTML = html;
  // Back from a panel: the view comes in, resumed across redraws like the rest.
  const enterAge = Date.now() - enteredAt;
  contentEl.classList.toggle('veiled', gliding && tier !== undefined);
  contentEl.classList.toggle('entering', !gliding && tier !== undefined && enterAge < ENTER_MS);
  contentEl.style.setProperty('--enter-age', `${-enterAge}ms`);
  // Where the lines sit, for the next move (the layout only changes with the window's size).
  const rows = [...contentEl.querySelectorAll<HTMLElement>('.bar .row.play:not(.leaving)')];
  if (rows.length > 1) {
    lineGaps.first = rows[1]!.offsetTop - rows[0]!.offsetTop;
    if (rows.length > 2) lineGaps.step = rows[2]!.offsetTop - rows[1]!.offsetTop;
    lineGaps.last = rows.at(-1)!.offsetTop;
  }
  const want = tier ?? '';
  const key = `${want}:${playersOpen}:${anchored}`;
  if (key !== controlsFor) { controlsFor = key; controlsEl.innerHTML = tier ? controlsView(tier, T, playersOpen, !anchored) : ''; }
}

// ---- The stats windows ------------------------------------------------------------------------------
// Two windows of their own, so the game stays in view: the stats at the main window's right edge and
// the line score under it, the three making one rectangle (the stats as tall as the main window, the
// gap and the line score together). The main window opens and closes them as a pair, keeps them in
// place as it moves or changes size, and sends them the game on every render. Each animates itself
// in, and out on 'side-close' before it closes (src/ui/side-window.ts).

const PLAYERS = 'players', LINESCORE = 'linescore';
const mainWindow = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();
const langTag = () => (T === STRINGS.en ? 'en' : 'zh-TW');

/** A result shows its points per period itself (src/ui/views.ts barView), so with one the line score stays closed. */
const withLine = () => !resultOnly;
/** Where the stats and the line score go, and how big, from the main window's place and size. */
const sideLayout = async () => sideRects(await mainRect(), withLine());
/** The stats windows: children of the main window, so on macOS the system moves them with it, with no lag. */
const SIDE_WINDOW = { decorations: false, transparent: true, shadow: false, alwaysOnTop: true, resizable: false, skipTaskbar: true, focus: false, parent: 'main' } as const;

// ---- The corner (src/ui/placement.ts) ----------------------------------------------------------

/** The main window stays in the screen's corner until the user drags it. */
let anchored = true;
/** Until when moves of the main window are the glide's own, not the user's, epoch ms. */
let placingUntil = 0;
let glideRun = 0;

async function mainRect(): Promise<Rect> {
  const w = await mainWindow();
  const scale = await w.scaleFactor();
  const pos = (await w.outerPosition()).toLogical(scale), size = (await w.outerSize()).toLogical(scale);
  return { x: pos.x, y: pos.y, w: size.width, h: size.height };
}

/** The part of the main window's screen not under the Dock or the taskbar, logical pixels. */
async function workArea(): Promise<Rect | undefined> {
  const { currentMonitor } = await import('@tauri-apps/api/window');
  const m = await currentMonitor();
  if (!m) return undefined;
  const s = m.scaleFactor, a = m.workArea;
  return { x: a.position.x / s, y: a.position.y / s, w: a.size.width / s, h: a.size.height / s };
}

/** Move and size the main window, and the stats with it when open, from `from` to `to` in `ms`;
 *  one Rust call a frame places them all at once (src-tauri/src/lib.rs place). */
async function glide(from: Rect, to: Rect, withStats: boolean, ms = GLIDE_MS): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const run = ++glideRun;
  const placeAt = (r: Rect) => {
    placingUntil = Date.now() + 400;
    const rects = [{ label: 'main', ...r }];
    if (withStats) { const s = sideRects(r, withLine()); rects.push({ label: PLAYERS, ...s.players }, ...(withLine() ? [{ label: LINESCORE, ...s.linescore }] : [])); }
    return invoke('place', { rects });
  };
  if (ms <= 0) { await placeAt(to); return; }
  const start = performance.now();
  await new Promise<void>((done) => {
    const step = async () => {
      if (run !== glideRun) { done(); return; }
      const t = Math.min(1, (performance.now() - start) / ms);
      await placeAt(between(from, to, ease(t)));
      if (t < 1) requestAnimationFrame(() => void step()); else done();
    };
    requestAnimationFrame(() => void step());
  });
}

/** Back to the corner (the toolbar's button, once dragged away), the stats with it, and stay there. */
async function backToCorner(): Promise<void> {
  anchored = true;
  render();
  const r = await mainRect();
  await sizeMain(r.w, r.h);
}

/** Give the main window a size. In the corner it glides there with the new size, room made for the
 *  stats when open; dragged elsewhere it only changes size. */
async function sizeMain(w: number, h: number, withStats = playersOpen): Promise<void> {
  const area = anchored ? await workArea() : undefined;
  if (!area) {
    const { LogicalSize } = await import('@tauri-apps/api/window');
    await (await win()).setSize(new LogicalSize(w, h));
    return;
  }
  await glide(await mainRect(), cornerRect(area, { w, h }, withStats, withStats && withLine()), withStats);
}

// The window starts hidden (tauri.conf.json): placed in the corner first, then shown.
if (shell) void (async () => {
  try {
    const area = await workArea(), r = await mainRect();
    if (area) await glide(r, cornerRect(area, r, false), false, 0);
  } finally {
    await (await win()).show();
  }
})();

async function toggleStats(): Promise<void> {
  if (!shell) {
    // In a browser under `npm run dev`: the stats in a tab.
    if (currentId) window.open(`/players.html?game=${currentId}${params.has('fixture') ? '&fixture' : ''}&lang=${langTag()}`, PLAYERS);
    return;
  }
  if (playersOpen) { await closeStats(); return; }
  playersOpen = true;
  render();
  // In the corner, first make room for them.
  if (anchored) { const r = await mainRect(); await sizeMain(r.w, r.h, true); }
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const at = await sideLayout();
  new WebviewWindow(PLAYERS, { url: 'players.html', x: at.players.x, y: at.players.y, width: at.players.w, height: at.players.h, ...SIDE_WINDOW });
  // The line score, when this game needs one, the same way as when another game is picked.
  await syncLine();
}

/** Another game picked with the stats open: open or close the line score as it now needs, and give
 *  the stats their new height (in the corner, the group glides to fit). One run at a time, checking
 *  again after each step, so games picked in quick succession end with the windows the last one needs:
 *  a line score still animating out is waited for, then opened anew. */
let syncingLine = false;
async function syncLine(): Promise<void> {
  if (!shell || syncingLine) return;
  syncingLine = true;
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    for (;;) {
      if (!playersOpen) return;
      const open = await WebviewWindow.getByLabel(LINESCORE);
      if (!!open === withLine()) return;
      const r = await mainRect(), at = sideRects(r, withLine());
      if (open) {
        await (await import('@tauri-apps/api/event')).emitTo(LINESCORE, 'side-close');
        // It closes itself after its animation (src/ui/side-window.ts); if it has not by a while
        // after, it goes anyway, so the next step never waits on it.
        const until = Date.now() + LEAVE_MS + 400;
        while (await WebviewWindow.getByLabel(LINESCORE)) {
          if (Date.now() > until) { await open.destroy(); break; }
          await new Promise((done) => setTimeout(done, 50));
        }
      } else {
        lineSent = '';
        new WebviewWindow(LINESCORE, { url: 'linescore.html', x: at.linescore.x, y: at.linescore.y, width: at.linescore.w, height: at.linescore.h, ...SIDE_WINDOW });
      }
      if (anchored) await sizeMain(r.w, r.h);
      else {
        const { LogicalSize } = await import('@tauri-apps/api/window');
        await (await WebviewWindow.getByLabel(PLAYERS))?.setSize(new LogicalSize(at.players.w, at.players.h));
      }
    }
  } finally { syncingLine = false; }
}

/** Ask both to animate out and close; close whatever is still there once their animation is over,
 *  and in the corner, glide back into it. */
async function closeStats(): Promise<void> {
  playersOpen = false;
  playersSent = lineSent = '';
  render();
  const { emitTo } = await import('@tauri-apps/api/event');
  await Promise.all([emitTo(PLAYERS, 'side-close'), emitTo(LINESCORE, 'side-close')]);
  setTimeout(async () => {
    if (playersOpen) return;
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    for (const label of [PLAYERS, LINESCORE]) await (await WebviewWindow.getByLabel(label))?.close();
    if (anchored && !playersOpen) { const r = await mainRect(); await sizeMain(r.w, r.h, false); }
  }, LEAVE_MS + 80);
}

let playersSent = '', lineSent = '';
/** Tell the stats windows what they show: the game, who is on the court, the line score, the favourite. */
async function sendStats(force = false): Promise<void> {
  if (!shell || !playersOpen || !currentId || !state) return;
  const { emitTo } = await import('@tauri-apps/api/event');
  const players = JSON.stringify({
    gameId: currentId, teams: state.teams, onCourt: state.onCourt, favourites: settings.favourites, lastPlay: state.recentPlays?.at(-1),
    live: state.status === 'live' || state.status === 'break', lang: langTag(),
  });
  if (force || players !== playersSent) { playersSent = players; await emitTo(PLAYERS, 'players-state', JSON.parse(players)); }
  const line = JSON.stringify({
    teams: state.teams, periodScores: state.periodScores, score: state.score, period: state.period, status: state.status,
    favourites: settings.favourites, lang: langTag(),
  });
  if (force || line !== lineSent) { lineSent = line; await emitTo(LINESCORE, 'linescore-state', JSON.parse(line)); }
}

if (shell) void (async () => {
  const { listen } = await import('@tauri-apps/api/event');
  // Each asks for the game when it starts.
  await listen('players-ready', () => { playersSent = ''; void sendStats(); });
  await listen('linescore-ready', () => { lineSent = ''; void sendStats(); });
  // They stay in place, and in shape, as the main window moves or changes size. On macOS a child
  // window already moves with its parent; elsewhere each move places them again, both at once, and
  // a move that comes while the last is still being placed waits, only the latest kept.
  const w = await mainWindow();
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');
  const childrenMove = navigator.userAgent.includes('Mac');
  let busy = false, again = false, againResize = false;
  const follow = async (resize: boolean) => {
    // A glide places them itself.
    if (!playersOpen || Date.now() < placingUntil) return;
    if (busy) { again = true; againResize ||= resize; return; }
    busy = true;
    const at = await sideLayout();
    await Promise.all(([PLAYERS, LINESCORE] as const).map(async (label) => {
      const win = await WebviewWindow.getByLabel(label);
      await win?.setPosition(new LogicalPosition(at[label].x, at[label].y));
      if (resize) await win?.setSize(new LogicalSize(at[label].w, at[label].h));
    }));
    busy = false;
    if (again) { const r = againResize; again = againResize = false; void follow(r); }
  };
  // A move that is not a glide's is the user's drag: from then on the window stays where they put it.
  await w.onMoved(() => { if (anchored && Date.now() >= placingUntil) { anchored = false; render(); } });
  if (!childrenMove) await w.onMoved(() => void follow(false));
  await w.onResized(() => void follow(true));
})();

function render(): void {
  const tier = tierOf(app.clientHeight);
  // A result in a court-sized window keeps the court's layout: the score where it always is, the
  // points per period and the leaders where the court would be.
  app.dataset.tier = panel ? 'panel' : tier;
  if (panel === 'settings') {
    show(settingsView(teams, settings, T, pickerOpen, isMac, shortcutsTaken, appVersion, updateState), undefined);
    // The list opens on the current choice: scroll the list only (scrollIntoView would move the page too).
    const list = app.querySelector<HTMLElement>('.fav-list'), on = app.querySelector<HTMLElement>('.fav-item.on');
    if (list && on) list.scrollTop = on.offsetTop - (list.clientHeight - on.offsetHeight) / 2;
    return;
  }
  if (panel === 'changelog') { show(changelogView(CHANGELOG, T, langTag()), undefined); return; }
  if (panel === 'games') { show(gamesView(dayLabel(gamesDay), dayList, T, tipOff, currentId, settings.favourites, picking), undefined); return; }
  const tag = replaying ? T.replay : undefined;
  // The toolbar has a row of its own along the bottom.
  const contentHeight = app.clientHeight - TOOLBAR_H;
  let body: string;
  // A game not started yet: the tip-off and a countdown, whether it is followed or the team's next.
  const pre = state?.status === 'scheduled' && state.start !== undefined ? { teams: state.teams, start: state.start }
    : !state && upcoming ? { teams: upcoming.teams, start: upcoming.start } : undefined;
  if (pre) body = pregameView(pre.teams, pre.start, whenOf({ start: pre.start }), Date.now(), T, tier, settings.favourites);
  else if (state) {
    const now = Date.now();
    const ages: ScoreAges = {};
    for (const side of ['away', 'home'] as const) { const at = scoreChangedAt[side]; if (at !== undefined && now - at < JUMP_MS) ages[side] = now - at; }
    const key = JSON.stringify(state.recentPlays?.at(-1) ?? null);
    if (key !== playKey) { if (playKey !== undefined && state.recentPlays?.length) { playChangedAt = now; playBefore = playShown; } playKey = key; }
    playShown = state;
    if (playChangedAt !== undefined && now - playChangedAt < SLIDE_MS) {
      ages.play = now - playChangedAt;
      const n = tier === 'court' && !resultOnly ? 2 : playLinesAt(contentHeight);
      // The line that was at the bottom: pushed out now, if there was one.
      if (playBefore) ages.leaving = playLines(playBefore, T, n)[n - 1];
    }
    // A finished game picked from the list is its result: no court, whatever the size.
    body = tier === 'court' && !resultOnly ? courtView(state, T, landed, tag, settings.favourites, ages)
      : barView(state, T, playLinesAt(contentHeight), tag, settings.favourites, resultOnly, ages, tier === 'court');
  }
  else body = messageView(message, tier === 'bar' ? messageSub : undefined);
  show(body, tier);
  void sendStats();
  if (state && tier === 'court' && !resultOnly && !frame) frame = requestAnimationFrame(animate);
}

const live = new EspnLiveSource(fetchJson);
const notifier = new Notifier(T);
document.addEventListener('visibilitychange', () => live.setBackground(document.hidden));
// A logo that does not load (no such team at ESPN, or offline): from now on its initial stands in.
// Image errors do not bubble, so this listens while they go down.
document.addEventListener('error', (e) => {
  const abbr = e.target instanceof HTMLImageElement ? e.target.dataset.abbr : undefined;
  if (abbr && !noLogo.has(abbr)) { noLogo.add(abbr); render(); }
}, true);

function pace(): PaceMode {
  const p = params.get('pace');
  return p === 'real' ? { kind: 'real' } : p === 'results' ? { kind: 'results' } : { kind: 'compact' };
}

/** Shows a game's states one after another (src/ui/pacer.ts). */
let pacer: Pacer<GameState> | undefined;
/** A shot in the air before the state that has it shows, and when that state will show. */
const flying = new Map<string, Shot>();
let commitTimer: ReturnType<typeof setTimeout> | undefined;
/** How far apart a poll's plays show, ms, and how many of a backlog are kept. A poll's burst (a
 *  stoppage's substitutions) all shows, line by line: dropping some made the next one bring several
 *  lines at once. Eight steps still end before the next poll, 10 s on. */
const PLAY_STEP_MS = 1200;
const PLAY_BACKLOG = 8;

function leave(): void {
  pacer?.clear();
  pacer = undefined;
  clearTimeout(commitTimer);
  flying.clear();
  unsubscribe?.();
  unsubscribe = undefined;
  state = undefined;
  shotSeen.clear();
  delete scoreChangedAt.away;
  delete scoreChangedAt.home;
  playKey = playChangedAt = playBefore = playShown = undefined;
  currentId = undefined;
  finalAt = undefined;
}

function follow(id: string, how: 'live' | 'replay' | 'result'): void {
  leave();
  currentId = id;
  replaying = how === 'replay';
  const wasLine = withLine();
  resultOnly = how === 'result';
  if (withLine() !== wasLine) void syncLine();
  upcoming = undefined;
  message = T.loading;
  // A poll brings several plays at once. Notices go out as they arrive; the screen shows the plays
  // one after another (src/ui/pacer.ts), and each new shot ties the text to the court: the ball
  // flies first, the play's line and the score come when it reaches the rim, and the next play
  // waits until its animation is over. The first state of a game shows at once, nothing flying.
  let arrived: GameState | undefined;
  const commit = (s: GameState) => {
    if (s.status === 'final' && finalAt === undefined) finalAt = Date.now();
    const all = [...(s.recentShots ?? []), ...(s.recentFreeThrows ?? [])];
    const kept = new Set(all.map((shot) => shot.id));
    for (const sid of shotSeen.keys()) if (!kept.has(sid) && !flying.has(sid)) shotSeen.delete(sid);
    for (const shot of all) if (!shotSeen.has(shot.id)) shotSeen.set(shot.id, LANDED);
    for (const shot of all) flying.delete(shot.id);
    // A score that went up jumps; the first state of a game does not.
    if (state) for (const side of ['away', 'home'] as const) if (s.score[side] > state.score[side]) scoreChangedAt[side] = Date.now();
    state = s;
    render();
  };
  const display = (s: GameState): number | void => {
    const shot = state ? [...(s.recentShots ?? []), ...(s.recentFreeThrows ?? [])].find((x) => !shotSeen.has(x.id)) : undefined;
    if (!shot) { commit(s); return; }
    // The ball goes up now (drawn from `flying` until the state that has it shows).
    shotSeen.set(shot.id, Date.now());
    flying.set(shot.id, shot);
    if (!frame && tierOf(app.clientHeight) === 'court') frame = requestAnimationFrame(animate);
    commitTimer = setTimeout(() => commit(s), (WINDUP_SECONDS + flightSeconds(shot)) * 1000);
    return shotSeconds(shot) * 1000;
  };
  pacer = new Pacer(display, PLAY_STEP_MS, PLAY_BACKLOG);
  const handlers = {
    onEvent: () => {},
    onState: (s: GameState) => {
      // Notices for the favourite's live games only: a replay already happened, and another game is
      // followed only because there is nothing better on (src/ui/views.ts settingsView).
      if (!replaying && favIn(s.teams, settings.favourites)) notifier.send(notices(arrived ?? assumedBefore(s, knownScheduled.has(id)), s, settings.notify));
      arrived = s;
      pacer?.push(s);
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
      // A game with no plays yet is shown as it stands before tip-off.
      const last = buildTimeline(feed).at(-1)?.state ?? initialState(feed);
      if (cancelled || !last) return;
      if (last.status === 'final') finalAt = Date.now();
      for (const shot of [...(last.recentShots ?? []), ...(last.recentFreeThrows ?? [])]) shotSeen.set(shot.id, LANDED);
      state = last;
      render();
    }).catch(handlers.onError);
    return;
  }
  const replay = new EspnReplaySource(load, { pace: pace(), speed: Number(params.get('speed') ?? 1) });
  unsubscribe = replay.subscribe(id, handlers);
}

let teamCache: { key: string; at: number; games: GameCard[] } | undefined;
/** The favourites' games: the current part of the season (the preseason in October), then the regular season. */
async function scheduleOf(teams: readonly string[]): Promise<GameCard[]> {
  const key = teams.join();
  if (teamCache?.key === key && Date.now() - teamCache.at < TEAM_SCHEDULE_TTL_MS) return teamCache.games;
  const games: GameCard[] = [];
  for (const team of teams) games.push(...(await teamGames(fetchJson, team)), ...(await teamGames(fetchJson, team, 2)));
  teamCache = { key, at: Date.now(), games };
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
    const teamSchedule = settings.favourites.length ? await scheduleOf(settings.favourites) : undefined;
    for (const g of [...today, ...(teamSchedule ?? [])]) if (g.status === 'scheduled') knownScheduled.add(g.id); else knownScheduled.delete(g.id);
    const current = currentId && state ? { id: currentId, status: state.status, ...(finalAt !== undefined ? { finalAt } : {}) } : undefined;
    apply(decide({ now: Date.now(), today, favourites: settings.favourites, ...(teamSchedule ? { teamGames: teamSchedule } : {}), ...(current ? { current } : {}) }));
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

async function openPanel(kind: Panel): Promise<void> {
  const was = panel;
  panel = kind;
  if (shell) {
    if (!was) sizeBeforePanel = { w: window.innerWidth, h: window.innerHeight };
    await sizeMain(PANEL_SIZE[kind].w, PANEL_SIZE[kind].h);
  }
  render();
  if (kind === 'games') { gamesDay = 0; await loadDay(); }
  if (kind === 'settings') { await loadTeams(); void colourFavourite(); }
}

/** The league's teams, for the favourite's name in the settings: fetched once (again only after a
 *  failure), at start when there is a favourite, so the settings open on its name, not on none. */
let teamsLoading: Promise<void> | undefined;
function loadTeams(): Promise<void> {
  return teamsLoading ??= (async () => {
    const fromFixture = import.meta.env.DEV && params.has('fixture');
    try { teams = await allTeams(fromFixture ? () => fetch('/fixtures/nba/teams.json').then((r) => r.json()) : fetchJson); } catch (e) { console.warn(e); teamsLoading = undefined; }
    if (panel === 'settings') render();
  })();
}

/** The team list has no colours; the favourite's comes with its schedule, for the dot beside the drop-down. */
async function colourFavourite(): Promise<void> {
  const fav = teams.find((t) => settings.favourites.includes(t.id));
  if (!fav || fav.color) return;
  try {
    const color = await teamColour(fetchJson, fav.id);
    if (color) { teams = teams.map((t) => (t.id === fav.id ? { ...t, color } : t)); if (panel === 'settings') render(); }
  } catch (e) { console.warn(e); }
}

async function closePanel(): Promise<void> {
  // The changelog was opened from the settings: its ✕ goes back there.
  if (panel === 'changelog') { await openPanel('settings'); return; }
  panel = undefined;
  pickerOpen = false;
  // While the window glides back to the game's size, the view stays hidden: drawn at every passing
  // size it jumped about (and between sizes); once the window is there, it comes in.
  if (shell && sizeBeforePanel) {
    gliding = true;
    render();
    await sizeMain(sizeBeforePanel.w, sizeBeforePanel.h);
    gliding = false;
  }
  enteredAt = Date.now();
  render();
}

/** A new mail to the developer in the user's mail app, the version and system in the subject. */
async function sendFeedback(): Promise<void> {
  const system = isMac ? 'macOS' : navigator.userAgent.includes('Windows') ? 'Windows' : 'Linux';
  const subject = `Courtsmall${appVersion ? ` ${appVersion}` : ''} (${system})`;
  const url = `mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent(subject)}`;
  if (!shell) { window.location.href = url; return; }
  await (await import('@tauri-apps/plugin-opener')).openUrl(url);
}

async function setTier(t: Tier): Promise<void> {
  if (!shell) return;
  await sizeMain(TIER_PRESET[t].w, TIER_PRESET[t].h);
}

app.addEventListener('click', (e) => {
  // The size buttons only: #app carries data-tier too (the size it shows), so a click anywhere else
  // would ask for the size it already has, and snap the window back to that size's preset.
  const el = (e.target as HTMLElement).closest<HTMLElement>('button[data-tier], [data-corner], [data-open], [data-day], [data-players], [data-game], [data-done], [data-notify], [data-shortcuts], [data-update], [data-fav-open], [data-fav-pick], [data-feedback]');
  // The favourite's list: its button opens and closes it, a team in it is picked, a click
  // anywhere else closes it.
  if (pickerOpen && !el?.closest('.favourite')) { pickerOpen = false; render(); }
  if (!el) return;
  if (el.dataset.favOpen !== undefined) { pickerOpen = !pickerOpen; render(); return; }
  if (el.dataset.favPick !== undefined) {
    pickerOpen = false;
    settings = { ...settings, favourites: el.dataset.favPick ? [el.dataset.favPick] : [] };
    saveSettings(settings);
    render();
    void colourFavourite();
    // A new favourite: drop the game on screen unless it is in progress (decide() never leaves one).
    if (!params.has('game')) { teamCache = undefined; void decideNow(); }
    return;
  }
  if (el.dataset.tier) { void setTier(el.dataset.tier as Tier); return; }
  if (el.dataset.corner !== undefined) { void backToCorner(); return; }
  if (el.dataset.open) { void openPanel(el.dataset.open as Panel); return; }
  if (el.dataset.feedback !== undefined) { void sendFeedback(); return; }
  if (el.dataset.players !== undefined) { void toggleStats(); return; }
  if (el.dataset.done !== undefined) { void closePanel(); return; }
  if (el.dataset.day) { gamesDay += Number(el.dataset.day); dayList = []; render(); void loadDay(); return; }
  if (el.dataset.game) {
    if (picking) return;
    // Picked from the list: a game on or to come is followed live, a finished one shows its result.
    // Its card lifts and the others give way first (PICK_MS), the game already loading; then the
    // window goes back to the game, which comes in (show's `.entering`).
    pinned = picking = el.dataset.game;
    follow(el.dataset.game, el.dataset.how === 'result' ? 'result' : 'live');
    setTimeout(() => { picking = undefined; void closePanel(); }, PICK_MS);
    return;
  }
  if (panel !== 'settings') return;
  if (el.dataset.update) {
    const set = (u: UpdateState) => { updateState = u; if (panel === 'settings') render(); };
    void (el.dataset.update === 'install' ? installUpdate(set) : checkForUpdate(set));
    return;
  }
  if (el.dataset.shortcuts !== undefined) {
    settings = { ...settings, shortcuts: el.dataset.shortcuts === 'on' };
    saveSettings(settings);
    void applyShortcuts();
    return;
  }
  if (el.dataset.notify) {
    const key = el.dataset.notify as keyof Settings['notify'];
    settings = { ...settings, notify: { ...settings.notify, [key]: (el as HTMLInputElement).checked } };
    saveSettings(settings);
    return;
  }
});



// The window has no title bar or border: press and drag moves it; the toolbar along the bottom
// switches the size and opens the panels. Outside the desktop shell (npm run dev in a browser)
// there is no window to move or resize.
app.addEventListener('mousedown', async (e) => {
  // Anything to click or scroll keeps the press; everywhere else moves the window, panels included.
  if ((e.target as HTMLElement).closest('button, a, input, label, .fav-list, .list')) return;
  if (shell && e.button === 0 && e.detail === 1) await (await win()).startDragging();
});
// ---- Global shortcuts (src/ui/shortcuts.ts) ---------------------------------------------------------

const isMac = navigator.userAgent.includes('Mac');

// ---- Version and updates (src/ui/update.ts) ------------------------------------------------------

let appVersion: string | undefined;
let updateState: UpdateState = { kind: 'idle' };
if (shell) void import('@tauri-apps/api/app').then(async ({ getVersion }) => { appVersion = await getVersion(); if (panel === 'settings') render(); });
/** Another app holds some of the keys: the settings say so. */
let shortcutsTaken = false;

/** Hide the main window and the stats beside it, or show them again. */
async function toggleHidden(): Promise<void> {
  const w = await win();
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const visible = await w.isVisible();
  const sides = await Promise.all([PLAYERS, LINESCORE].map((label) => WebviewWindow.getByLabel(label)));
  for (const side of sides) await (visible ? side?.hide() : side?.show());
  if (visible) await w.hide(); else await w.show();
}

const ACTIONS: Record<ShortcutAction, () => void> = {
  mode: () => { if (!panel) void setTier(tierOf(app.clientHeight) === 'court' ? 'bar' : 'court'); },
  stats: () => void toggleStats(),
  hide: () => void toggleHidden(),
};

/** Take the keys when the switch is on, give them back when it is off. */
async function applyShortcuts(): Promise<void> {
  if (!shell) return;
  const { register, unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
  await unregisterAll();
  shortcutsTaken = false;
  if (settings.shortcuts) {
    for (const action of Object.keys(SHORTCUTS) as ShortcutAction[]) {
      try {
        await register(SHORTCUTS[action], (e) => { if (e.state === 'Pressed') ACTIONS[action](); });
      } catch (e) { console.warn(`shortcut ${SHORTCUTS[action]}:`, e); shortcutsTaken = true; }
    }
  }
  if (panel === 'settings') render();
}
void applyShortcuts();

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
// The countdown ticks once a second while a game not started yet is on screen.
setInterval(() => { if (!panel && (state?.status === 'scheduled' || (!state && upcoming))) render(); }, 1000);

const devGame = params.get('game');
if (devGame) follow(devGame, params.has('replay') ? 'replay' : params.has('result') ? 'result' : 'live');
else {
  void decideNow();
  setInterval(() => void decideNow(), DECIDE_EVERY_MS);
}
if (settings.favourites.length) void loadTeams();
if (params.has('settings')) void openPanel('settings');
if (params.has('games')) void openPanel('games');
