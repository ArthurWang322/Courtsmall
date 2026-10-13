// Text parts of the main window for each size tier. Pure string builders: state in, HTML out.
// What a glance needs (docs/PLAN.md Q3): score, period and clock, possession, the last basket,
// and a run once it is worth noticing.

import { STAT_KEYS, type GameCard, type GameState, type PlayLine, type Side, type TeamRef } from '../model/types.ts';
import type { Settings } from '../settings/store.ts';
import type { Tier } from '../render/tiers.ts';
import { gameColours, visibleColour } from '../render/colour.ts';
import { courtSvg } from '../render/court.ts';
import type { Strings } from '../i18n/index.ts';

/** How long a score that just changed keeps its jump, ms (app.css `.jump`). */
export const JUMP_MS = 600;
/** Ms since each side's score last changed; a side not in it has not changed lately. */
export type ScoreAges = Partial<Record<Side, number>>;

/** A score number, jumping if it changed less than JUMP_MS ago (resumed across redraws). */
const scoreNum = (n: number, age?: number) =>
  age !== undefined && age < JUMP_MS ? `<b class="jump" style="animation-delay:${-age}ms">${n}</b>` : `<b>${n}</b>`;

/** A run is shown from this many unanswered points. 【建議】 */
export const RUN_MIN = 6;

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** "7:02" from a minute up, "45.3" in the last minute, as the arena clock shows it. */
export function clockText(seconds: number): string {
  if (seconds < 60) return seconds.toFixed(1);
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Where the game is: "Q4 7:02", "Half", "End Q1", "Final", or the tip-off time. */
export function whenText(s: GameState, T: Strings, tipOff?: string): string {
  switch (s.status) {
    case 'scheduled': return tipOff ?? '';
    // "Final/OT": a game that went to overtime says so.
    case 'final': return s.period > 4 ? `${T.final}/${s.period === 5 ? 'OT' : `${s.period - 4}OT`}` : T.final;
    case 'postponed': return T.postponed;
    case 'cancelled': return T.cancelled;
    case 'delayed': return T.delayed;
    case 'break': return s.period === 2 ? T.half : T.endOf(T.period(s.period));
    // A timeout or review says why the clock is stopped.
    default: return s.period > 0 ? `${T.period(s.period)} ${clockText(s.clock)}${s.stoppage ? ` · ${T.stoppage(s.stoppage)}` : ''}` : '';
  }
}

const hasBall = (s: GameState, side: Side) => s.possession === side && s.status === 'live';

/** The favourite playing in this game, if any (it keeps its colour in a clash). */
export const favIn = (teams: Record<Side, TeamRef>, favs: readonly string[]) => favs.find((id) => id === teams.away.id || id === teams.home.id);
/** A star before a favourite team's abbreviation. */
const star = (t: TeamRef, favs: readonly string[]) => (favs.includes(t.id) ? '<span class="star">★</span>' : '');


/**
 * The bar's score, laid out like a broadcast score bug: one cell per team (a stripe in its colour,
 * the abbreviation, the score), then a cell with the period and clock.
 */
function scoreBug(s: GameState, T: Strings, tag?: string, favs: readonly string[] = [], ages: ScoreAges = {}): string {
  const c = gameColours(s.teams, favIn(s.teams, favs));
  // The team with the ball: its whole cell is framed in its colour, with a triangle by the score.
  // `--team` tints the cell (app.css); the stripe and the possession frame use it too.
  const cell = (side: Side) => hasBall(s, side)
    ? `<div class="cell team ball" style="--team:#${esc(c[side])};border-color:#${esc(c[side])}"><i class="stripe"></i><span class="abbr">${star(s.teams[side], favs)}${esc(s.teams[side].abbr)}</span>${scoreNum(s.score[side], ages[side])}<span class="ball-mark">◀</span></div>`
    : `<div class="cell team" style="--team:#${esc(c[side])}"><i class="stripe"></i><span class="abbr">${star(s.teams[side], favs)}${esc(s.teams[side].abbr)}</span>${scoreNum(s.score[side], ages[side])}<span class="ball-mark"></span></div>`;
  return `<div class="bug">${cell('away')}${cell('home')}${tag ? `<span class="tag">${esc(tag)}</span>` : '<span class="grow"></span>'}<div class="cell clock mono">${esc(whenText(s, T))}</div></div>`;
}

/** "[UTAH] I. Collier +2", "[PHI] J. Embiid shooting foul": the team first, so a glance at a
 *  name alone still says which side it was. Team-only plays (a team rebound) drop the name. */
export function playText(s: GameState, ev: PlayLine, T: Strings): string {
  const team = (side?: Side) => (side ? `[${s.teams[side].abbr}]` : '');
  const join = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' ');
  switch (ev.type) {
    case 'basket': return join(team(ev.basket.side), ev.basket.player?.short, `+${ev.basket.points}`);
    case 'miss': return join(team(ev.side), ev.player?.short, T.miss(ev.points)) + (ev.blockedBy ? T.block(ev.blockedBy.short) : '');
    case 'foul': return join(team(ev.side), ev.player?.short, T.foul(ev.kind));
    case 'turnover': return join(team(ev.side), ev.player?.short, T.turnover) + (ev.stolenBy ? T.steal(ev.stolenBy.short) : '');
    case 'rebound': return join(team(ev.side), ev.player?.short, T.rebound(ev.offensive));
    case 'substitution': return join(team(ev.side), ev.in && ev.out ? T.substitution(ev.in.short, ev.out.short) : undefined);
  }
}

/**
 * The play lines under the score, newest first: the latest `count` plays, the run (when it is long
 * enough) after the newest. The newest stays in one place and the one before it moves below, so
 * a miss and its rebound can be read together.
 */
export function playLines(s: GameState, T: Strings, count: number): string[] {
  const lines = (s.recentPlays ?? []).slice(-count).reverse().map((p) => esc(playText(s, p, T)));
  if (s.run && s.run.points >= RUN_MIN && s.status !== 'final') {
    const run = esc(T.run(s.teams[s.run.side].abbr, s.run.points));
    if (lines.length) lines[0] += ` · ${run}`; else lines.push(run);
  }
  return lines;
}


/**
 * Bar tier: the score bug on top; below, the newest play, and under a divider the one before it,
 * quieter. `result`: a finished game picked from the list, shown as its points per period instead,
 * and with `withLeaders` (a window tall enough) each side's leaders under them.
 */
export function barView(s: GameState, T: Strings, lines: number, tag?: string, favs: readonly string[] = [], result = false, ages: ScoreAges = {}, withLeaders = false): string {
  if (result) return `<div class="bar">${scoreBug(s, T, tag, favs)}${periodTable(s)}${withLeaders ? leadersTable(s, T) : ''}</div>`;
  const [newest = '', older = ''] = playLines(s, T, lines);
  return `<div class="bar">
      ${scoreBug(s, T, tag, favs, ages)}
      <div class="row play new">${newest}</div>${lines > 1 ? `
      <hr class="divider"><div class="row play old">${older}</div>` : ''}
    </div>`;
}

/** Points per period for a finished game: one row per team, overtimes included. */
export function periodTable(s: GameState): string {
  const row = (side: Side) => `<div class="row period"><span class="abbr">${esc(s.teams[side].abbr)}</span>${s.periodScores[side].map((n) => `<span class="mono">${n}</span>`).join('')}</div>`;
  return `<div class="periods">${row('away')}${row('home')}</div>`;
}

/**
 * Each side's leader in points, rebounds, assists, steals, blocks and turnovers: the stat in the
 * middle, the away leader to its left and the home leader to its right, so each side keeps its side.
 */
export function leadersTable(s: GameState, T: Strings): string {
  const cell = (side: Side, k: (typeof STAT_KEYS)[number]) => {
    const l = s.leaders?.[side][k];
    if (!l) return '<span class="who muted">–</span>';
    const name = `<span class="name">${esc(l.player.short)}</span>`, n = `<b>${l.value}</b>`;
    return `<span class="who ${side}">${side === 'away' ? name + n : n + name}</span>`;
  };
  return `<div class="leaders">${STAT_KEYS.map((k) => `<div class="leader">${cell('away', k)}<span class="stat">${esc(T.stat(k))}</span>${cell('home', k)}</div>`).join('')}</div>`;
}

/**
 * Court tier: the bar on top, the half court in 3D below. `landed`: whether a shot's flight is
 * over, so its mark is on the floor (src/render/court.ts draws the flights every frame).
 */
export function courtView(s: GameState, T: Strings, landed: (id: string) => boolean, tag?: string, favs: readonly string[] = [], ages: ScoreAges = {}): string {
  return `<div class="courtwrap">${barView(s, T, 2, tag, favs, false, ages)}${courtSvg(s, gameColours(s.teams, favIn(s.teams, favs)), landed)}</div>`;
}

/** No game to show: a message, and when the next one tips off. */
export const messageView = (text: string, sub?: string) =>
  `<div class="msg"><span>${esc(text)}</span>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</div>`;

const colourDot = (hex: string) => `<i class="dot" style="background:#${esc(hex)}"></i>`;
const cardDot = (t: TeamRef) => colourDot(visibleColour(t));

/** Whole days, hours, minutes and seconds left in `ms`; zero once it has passed. */
export function countdownParts(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86_400), h: Math.floor((t % 86_400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/**
 * A game not started yet: the score bug with the teams and, in the clock's place, the tip-off
 * (`when`); under it the time left in days, hours, minutes and seconds, or "tip-off soon" once
 * that has run out; larger in the court's size.
 */
export function pregameView(teams: GameCard['teams'], start: number, when: string, now: number, T: Strings, tier: Tier, favs: readonly string[] = []): string {
  const c = gameColours(teams, favIn(teams, favs));
  const cell = (side: Side) => `<div class="cell team" style="--team:#${esc(c[side])}"><i class="stripe"></i><span class="abbr">${star(teams[side], favs)}${esc(teams[side].abbr)}</span><b class="muted">–</b><span class="ball-mark"></span></div>`;
  const bug = `<div class="bug">${cell('away')}${cell('home')}<span class="grow"></span><div class="cell clock mono">${esc(when)}</div></div>`;
  const left = start - now;
  const p = countdownParts(left);
  const unit = (n: number, label: string) => `<div class="unit"><b>${String(n).padStart(2, '0')}</b><span>${esc(label)}</span></div>`;
  const clock = left > 0
    ? `<div class="countdown${tier === 'court' ? ' big' : ''}">${unit(p.d, T.units.d)}${unit(p.h, T.units.h)}${unit(p.m, T.units.m)}${unit(p.s, T.units.s)}</div>`
    : `<div class="countdown${tier === 'court' ? ' big' : ''}"><span class="soon">${esc(T.tipOffSoon)}</span></div>`;
  return `<div class="bar pregame">${bug}${clock}</div>`;
}

/** Choosing a team and the notices. Buttons carry data-* attributes; src/ui/main.ts handles clicks. */
export function settingsView(teams: readonly TeamRef[], s: Settings, T: Strings, pickerOpen = false): string {
  // The favourite, from a drop-down of our own (a native one opens all 30 teams at once): a button
  // with the choice, and when `pickerOpen`, a short scrolling list under it, none first, then the
  // teams by full name.
  const fav = teams.find((t) => s.favourites.includes(t.id));
  // The list is names only: the team list has no colours (src/data/espn/fetch.ts allTeams). The
  // choice shows its colour once its schedule has brought it.
  const item = (id: string, label: string) =>
    `<button class="fav-item${(fav?.id ?? '') === id ? ' on' : ''}" data-fav-pick="${esc(id)}">${esc(label)}</button>`;
  const list = pickerOpen
    ? `<div class="fav-list">${item('', T.noFavourite)}${[...teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => item(t.id, t.name)).join('')}</div>`
    : '';
  const mark = fav?.color ? cardDot(fav) : '<i class="dot none"></i>';
  const picker = `<div class="favourite"><button class="fav-current" data-fav-open aria-expanded="${pickerOpen}">${mark}<span>${esc(fav?.name ?? T.noFavourite)}</span><i class="caret"></i></button>${list}</div>`;
  const check = (key: keyof Settings['notify'], label: string) =>
    `<label class="check"><input type="checkbox" data-notify="${key}"${s.notify[key] ? ' checked' : ''}> ${esc(label)}</label>`;
  return `<div class="settings">
      <div class="head"><b>${esc(T.chooseTeam)}</b><button class="done" data-done>${esc(T.done)}</button></div>
      ${picker}
      <span class="hint muted">${esc(fav ? T.favouritesHint : T.noTeam)}</span>
      ${check('start', T.notifyStart)}${check('final', T.notifyFinal)}${check('clutch', T.notifyClutch)}
      <div class="themes"><span class="muted">${esc(T.theme)}</span>${(['system', 'dark', 'light'] as const).map((t) =>
        `<button class="${s.theme === t ? 'on' : ''}" data-pick-theme="${t}">${esc(T.themeName(t))}</button>`).join('')}</div>
    </div>`;
}

// ---- Hover toolbar and the games list ------------------------------------------------------------

/** Icons in basic shapes, 14 px, drawn in the current text colour. */
const ICON: Record<Tier | 'games' | 'settings' | 'theme', string> = {
  bar: '<rect x="1.5" y="3" width="11" height="8" rx="1.5"/><path d="M3.5 6.5h7"/>',
  court: '<path d="M3 3.5h8l1.5 7.5h-11z"/><path d="M5.2 3.5v3h3.6v-3"/>',
  games: '<path d="M2.5 4h9M2.5 7h9M2.5 10h9"/>',
  // Half a disc filled: dark and light at once.
  theme: '<circle cx="7" cy="7" r="5"/><path d="M7 2a5 5 0 0 1 0 10z" fill="currentColor"/>',
  settings: '<circle cx="7" cy="7" r="2"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3.1 3.1l1.4 1.4M9.5 9.5l1.4 1.4M3.1 10.9l1.4-1.4M9.5 4.5l1.4-1.4"/>',
};
const icon = (k: keyof typeof ICON) => `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${ICON[k]}</svg>`;

/**
 * The toolbar along the bottom of the window: the two sizes (the current one
 * lit), dark or light, the games list and the settings. Buttons carry data-* attributes; src/ui/main.ts handles them.
 */
export function controlsView(tier: Tier, T: Strings): string {
  const size = (t: Tier) => `<button class="icon${t === tier ? ' on' : ''}" data-tier="${t}" title="${esc(T.tierName(t))}">${icon(t)}</button>`;
  return `<div class="controls">${size('bar')}${size('court')}<span class="sep"></span>`
    + `<button class="icon" data-theme-toggle title="${esc(T.switchTheme)}">${icon('theme')}</button>`
    + `<button class="icon" data-open="games" title="${esc(T.games)}">${icon('games')}</button>`
    + `<button class="icon" data-open="settings" title="${esc(T.settings)}">${icon('settings')}</button></div>`;
}

/** Where a listed game is: "Q4 2:31", "Final", or its tip-off time. */
function cardWhen(g: GameCard, T: Strings, tipOff: (g: GameCard) => string): string {
  switch (g.status) {
    case 'scheduled': return tipOff(g);
    case 'final': return T.final;
    case 'postponed': return T.postponed;
    case 'cancelled': return T.cancelled;
    case 'break': return g.period === 2 ? T.half : T.endOf(T.period(g.period));
    default: return g.period > 0 ? `${T.period(g.period)} ${clockText(g.clock)}` : '';
  }
}

const ORDER: Partial<Record<GameCard['status'], number>> = { live: 0, break: 0, delayed: 0, scheduled: 1, final: 2 };

/**
 * A day's games: the ones on first, then the ones still to come, then the finished ones. A game on
 * or to come is followed live; a finished one shows its result. `current`: the game on screen.
 * The favourites' games come first in each group, starred.
 */
export function gamesView(day: string, games: readonly GameCard[], T: Strings, tipOff: (g: GameCard) => string, current?: string, favs: readonly string[] = []): string {
  // Within each group (on, to come, finished), the favourites' games come first.
  const isFav = (g: GameCard) => (favIn(g.teams, favs) ? 0 : 1);
  const sorted = [...games].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || isFav(a) - isFav(b) || a.start - b.start);
  const row = (g: GameCard) => {
    const how = g.status === 'final' ? 'result' : 'live';
    const showScore = g.status !== 'scheduled' && g.status !== 'postponed' && g.status !== 'cancelled';
    const abbr = (sd: Side) => `<span>${star(g.teams[sd], favs)}${esc(g.teams[sd].abbr)}</span>`;
    // Two teams in one row: the same clash rule as on the score (src/render/colour.ts).
    const c = gameColours(g.teams, favIn(g.teams, favs));
    const mid = showScore ? `<b>${g.score.away}</b><span class="muted">–</span><b>${g.score.home}</b>` : '<span class="muted">@</span>';
    return `<button class="game${g.id === current ? ' on' : ''}${how === 'live' && g.status !== 'scheduled' ? ' live' : ''}${favIn(g.teams, favs) ? ' fav' : ''}" data-game="${esc(g.id)}" data-how="${how}">`
      + `<span class="who">${colourDot(c.away)}${abbr('away')}${mid}${abbr('home')}${colourDot(c.home)}</span>`
      + `<span class="when mono">${esc(cardWhen(g, T, tipOff))}</span></button>`;
  };
  return `<div class="panel games">
      <div class="head"><button class="icon" data-day="-1" title="${esc(T.prevDay)}">‹</button><b>${esc(day)}</b><button class="icon" data-day="1" title="${esc(T.nextDay)}">›</button><span class="grow"></span><button class="done" data-done>${esc(T.done)}</button></div>
      <div class="list">${sorted.length ? sorted.map(row).join('') : `<span class="muted">${esc(T.noGames)}</span>`}</div>
    </div>`;
}

