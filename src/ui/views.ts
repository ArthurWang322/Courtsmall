// Text parts of the main window for each size tier. Pure string builders: state in, HTML out.
// What a glance needs (docs/PLAN.md Q3): score, period and clock, possession, the last basket,
// and a run once it is worth noticing.

import { STAT_KEYS, type BoxLine, type MadeOf, type TeamStats, type GameCard, type GameState, type PlayLine, type Side, type TeamRef } from '../model/types.ts';
import type { Settings } from '../settings/store.ts';
import type { Tier } from '../render/tiers.ts';
import { gameColours, visibleColour } from '../render/colour.ts';
import { courtSvg } from '../render/court.ts';
import type { Lang, Strings } from '../i18n/index.ts';
import type { Release } from '../changelog.ts';
import { keyLabel, SHORTCUTS, type ShortcutAction } from './shortcuts.ts';
import type { UpdateState } from './update.ts';

/** How long a score that just changed keeps its jump, ms (app.css `.jump`). */
export const JUMP_MS = 600;
/** How long the play lines take to move when a new one comes, ms: the older ones down a place, the
 *  oldest out at the bottom, the new one in from the left just behind them (app.css `.moving`). */
export const SLIDE_MS = 560;
/** Ms since each side's score last changed, and since the newest play line did (`play`); one not in
 *  it has not changed lately. `leaving`: the line pushed out at the bottom by the newest, as it was. */
export type ScoreAges = Partial<Record<Side | 'play', number>> & { leaving?: string };

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

/** The clock cell's look, to tell at a glance how the game stands: running (green light flowing
 *  round it), half time (gold, breathing), stopped for a timeout, a review or between quarters (red,
 *  breathing), over (grey). */
export const clockLook = (s: GameState) =>
  s.status === 'final' ? ' final' : s.status === 'break' && s.period === 2 ? ' paused half'
    : s.status === 'break' || (s.status === 'live' && s.stoppage) ? ' paused' : s.status === 'live' ? ' live' : '';

const hasBall = (s: GameState, side: Side) => s.possession === side && s.status === 'live';

/** The favourite playing in this game, if any (it keeps its colour in a clash). */
export const favIn = (teams: Record<Side, TeamRef>, favs: readonly string[]) => favs.find((id) => id === teams.away.id || id === teams.home.id);
/** A star after a favourite team's abbreviation. */
const star = (t: TeamRef, favs: readonly string[]) => (favs.includes(t.id) ? '<span class="star">★</span>' : '');
/** Abbreviations whose logo failed to load (a club from abroad on a preseason tour, or offline);
 *  src/ui/main.ts adds them as the images fail. */
export const noLogo = new Set<string>();
/** The team's logo, loaded from ESPN by its abbreviation (the path its own feeds use: …/500/utah.png);
 *  without one, its initial on a disc in its colour (`hex`). */
export const logo = (t: TeamRef, hex: string) => noLogo.has(t.abbr)
  ? `<i class="logo badge" style="background:#${esc(hex)}">${esc(t.abbr.charAt(0))}</i>`
  : `<img class="logo" data-abbr="${esc(t.abbr)}" src="${logoUrl(t)}" alt="">`;
const logoUrl = (t: TeamRef) => `https://a.espncdn.com/i/teamlogos/nba/500/${esc(t.abbr.toLowerCase())}.png`;


/**
 * The bar's score, laid out like a broadcast score bug: one cell per team (shaded in its colour, the
 * logo, the abbreviation, the score), then a cell with the period and clock.
 */
function scoreBug(s: GameState, T: Strings, tag?: string, favs: readonly string[] = [], ages: ScoreAges = {}): string {
  const c = gameColours(s.teams, favIn(s.teams, favs));
  // The team with the ball: its whole cell is framed in its colour, with a triangle by the score.
  // `--team` shades the cell (app.css); the possession frame uses it too.
  const cell = (side: Side) => hasBall(s, side)
    ? `<div class="cell team ball" style="--team:#${esc(c[side])};border-color:#${esc(c[side])}">${logo(s.teams[side], c[side])}<span class="abbr">${esc(s.teams[side].abbr)}${star(s.teams[side], favs)}</span>${scoreNum(s.score[side], ages[side])}<span class="ball-mark">◀</span></div>`
    : `<div class="cell team" style="--team:#${esc(c[side])}">${logo(s.teams[side], c[side])}<span class="abbr">${esc(s.teams[side].abbr)}${star(s.teams[side], favs)}</span>${scoreNum(s.score[side], ages[side])}<span class="ball-mark"></span></div>`;
  return `<div class="bug">${cell('away')}${cell('home')}${tag ? `<span class="tag">${esc(tag)}</span>` : '<span class="grow"></span>'}${clockCell(s, T)}</div>`;
}

/** The clock cell. Stopped for a timeout or a review, the reason goes small on a line of its own
 *  under the period and clock: on one line it ran out of the cell, and the red already says stopped. */
function clockCell(s: GameState, T: Strings): string {
  if (s.status === 'live' && s.stoppage)
    return `<div class="cell clock mono stacked${clockLook(s)}"><span>${esc(whenText({ ...s, stoppage: undefined }, T))}</span><small>${esc(T.stoppage(s.stoppage))}</small></div>`;
  return `<div class="cell clock mono${clockLook(s)}">${esc(whenText(s, T))}</div>`;
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
 * enough) at the end of the newest. The newest stays in one place and the one before it moves below, so
 * a miss and its rebound can be read together.
 */
export function playLines(s: GameState, T: Strings, count: number): string[] {
  const lines = (s.recentPlays ?? []).slice(-count).reverse().map((p) => esc(playText(s, p, T)));
  if (s.run && s.run.points >= RUN_MIN && s.status !== 'final') {
    // The run ends the newest line, at its right end, in the accent colour (app.css .run).
    const run = `<span class="run">${esc(T.run(s.teams[s.run.side].abbr, s.run.points))}</span>`;
    if (lines.length) lines[0] += run; else lines.push(run);
  }
  return lines;
}


/**
 * Bar tier: the score bug on top; below, the newest play, and under a divider the ones before it
 * (`lines` in all), quieter the older they are. `result`: a finished game picked from the list, shown as its points per period instead,
 * and with `withLeaders` (a window tall enough) each side's leaders under them.
 */
export function barView(s: GameState, T: Strings, lines: number, tag?: string, favs: readonly string[] = [], result = false, ages: ScoreAges = {}, withLeaders = false): string {
  if (result) return `<div class="bar result">${scoreBug(s, T, tag, favs)}${periodTable(s)}${withLeaders ? leadersTable(s, T) : ''}</div>`;
  const [newest = '', ...older] = playLines(s, T, lines);
  // Every older line has its place even before there are plays for it, so nothing moves later.
  const rows = Array.from({ length: lines - 1 }, (_, i) => `<div class="row play old old-${i + 1}">${older[i] ?? ''}</div>`);
  // A new line: every line moves together, resumed where it was across redraws (`--age`).
  const moving = ages.play !== undefined && ages.play < SLIDE_MS;
  const leaving = moving && ages.leaving && lines > 1 ? `<div class="row play old old-${lines - 1} leaving">${ages.leaving}</div>` : '';
  return `<div class="bar${moving ? ` moving" style="--age:${-ages.play!}ms` : ''}">
      ${scoreBug(s, T, tag, favs, ages)}
      <div class="row play new">${newest}</div>${lines > 1 ? `
      <hr class="divider">${rows.join('')}${leaving}` : ''}
    </div>`;
}

/** Points per period for a finished game: one row per team, overtimes included. */
export function periodTable(s: GameState): string {
  // Over the points, which period they are: 1 to 4, then OT, 2OT…, as the line score labels them.
  const n = Math.max(s.periodScores.away.length, s.periodScores.home.length);
  const head = `<div class="row period head"><span class="abbr"></span>${Array.from({ length: n }, (_, i) => `<span class="mono">${periodLabel(i + 1)}</span>`).join('')}</div>`;
  const row = (side: Side) => `<div class="row period"><span class="abbr">${esc(s.teams[side].abbr)}</span>${s.periodScores[side].map((n) => `<span class="mono">${n}</span>`).join('')}</div>`;
  return `<div class="periods">${head}${row('away')}${row('home')}</div>`;
}

/** A period's label over its points: 1 to 4, then OT, 2OT… */
const periodLabel = (p: number) => (p <= 4 ? `${p}` : p === 5 ? 'OT' : `${p - 4}OT`);

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
  const cell = (side: Side) => `<div class="cell team" style="--team:#${esc(c[side])}">${logo(teams[side], c[side])}<span class="abbr">${esc(teams[side].abbr)}${star(teams[side], favs)}</span><b class="muted">–</b><span class="ball-mark"></span></div>`;
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
export function settingsView(teams: readonly TeamRef[], s: Settings, T: Strings, pickerOpen = false, mac = true, shortcutsTaken = false, version?: string, update: UpdateState = { kind: 'idle' }): string {
  // The favourite, from a drop-down of our own (a native one opens all 30 teams at once): a button
  // with the choice, and when `pickerOpen`, a short scrolling list under it, none first, then the
  // teams by full name.
  // A favourite whose name has not come yet (the team list loads in the background) reads as
  // loading, not as none.
  const fav = teams.find((t) => s.favourites.includes(t.id));
  // Each team with its logo, none with nothing. The team list has no colours (src/data/espn/fetch.ts
  // allTeams), so a logo's stand-in takes the fallback colour until the schedule brings the real one.
  const mark = (t?: TeamRef) => (t ? logo(t, visibleColour(t)) : '');
  const item = (t: TeamRef | undefined, label: string) =>
    `<button class="fav-item${(fav?.id ?? '') === (t?.id ?? '') ? ' on' : ''}" data-fav-pick="${esc(t?.id ?? '')}">${mark(t)}<span>${esc(label)}</span></button>`;
  const list = pickerOpen
    ? `<div class="fav-list">${item(undefined, T.noFavourite)}${[...teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => item(t, t.name)).join('')}</div>`
    : '';
  const picker = `<div class="favourite"><button class="fav-current" data-fav-open aria-expanded="${pickerOpen}">${mark(fav)}<span>${esc(fav?.name ?? (s.favourites.length ? T.loading : T.noFavourite))}</span><i class="caret"></i></button>${list}</div>`;
  // The favourite's logo, large and faint behind the page, in the window's bottom right corner and cut
  // by it. Outside the scrolling page, so what is cut off never makes it scroll (Windows shows the bar).
  const watermark = fav && !noLogo.has(fav.abbr) ? `<img class="watermark" data-abbr="${esc(fav.abbr)}" src="${logoUrl(fav)}" alt="">` : '';
  // The notices are for the favourite's games: without one they cannot be turned on, and show off;
  // the choices are kept for when a favourite is picked.
  const hasFav = s.favourites.length > 0;
  // The shortcuts, on or off: a choice of two, set apart from the notices above.
  const radio = (on: boolean, label: string) =>
    `<label class="check"><input type="radio" name="shortcuts" data-shortcuts="${on ? 'on' : 'off'}"${s.shortcuts === on ? ' checked' : ''}> ${esc(label)}</label>`;
  const check = (key: keyof Settings['notify'], label: string, hint?: string) =>
    `<label class="check${hasFav ? '' : ' off'}"><input type="checkbox" data-notify="${key}"${hasFav && s.notify[key] ? ' checked' : ''}${hasFav ? '' : ' disabled'}><span>${esc(label)}${hint ? `<small class="sub">${esc(hint)}</small>` : ''}</span></label>`;
  return `${watermark}<div class="settings">
      <div class="head"><b>${esc(T.tip.settings)}</b><span class="grow"></span><button class="icon close" data-done aria-label="${esc(T.close)}">✕</button></div>
      <div class="fav-row"><span class="label">${esc(T.chooseTeam)}</span>${picker}</div>
      <div class="checks">${check('start', T.notifyStart)}${check('clutch', T.notifyClutch, T.notifyClutchHint)}</div>${hasFav ? '' : `<span class="hint">${esc(T.notifyNeedsFavourite)}</span>`}
      <div class="shortcuts-row"><span class="label">${esc(T.shortcuts)}</span>${radio(true, T.shortcutsOn)}${radio(false, T.shortcutsOff)}</div>
      <span class="keys">${(Object.keys(SHORTCUTS) as ShortcutAction[]).map((a) => `<kbd>${esc(keyLabel(SHORTCUTS[a], mac))}</kbd> ${esc(T.shortcut[a])}`).join('<i>·</i>')}</span>
      ${s.shortcuts && shortcutsTaken ? `<span class="hint warn">${esc(T.shortcutsTaken)}</span>` : ''}
      ${version ? updateRow(version, update, T) : ''}
      <div class="links"><a data-open="changelog">${esc(T.changelog.title)}</a><a data-feedback>${esc(T.feedback)}</a></div>
    </div>`;
}

/**
 * The changelog, opened from the settings: each version newest first along a timeline, its date,
 * number and title, then what it brought. The ✕ goes back to the settings.
 */
export function changelogView(releases: readonly Release[], T: Strings, lang: Lang): string {
  const entry = (r: Release, i: number) => `<li class="release${i === 0 ? ' newest' : ''}">`
    + `<div class="when"><span class="date mono">${esc(r.date.replaceAll('-', '/'))}</span><span class="ver">v${esc(r.version)}</span>${i === 0 ? `<span class="tag">${esc(T.changelog.latest)}</span>` : ''}</div>`
    + `<b class="title">${esc(r.title[lang])}</b><ul>${r.items[lang].map((x) => `<li>${esc(x)}</li>`).join('')}</ul></li>`;
  return `<div class="panel changelog">
      <div class="head"><b>${esc(T.changelog.title)}</b><span class="grow"></span><button class="icon close" data-done aria-label="${esc(T.close)}">✕</button></div>
      <span class="intro">${esc(T.changelog.intro)}</span>
      <ol class="list timeline">${releases.map(entry).join('')}</ol>
    </div>`;
}

/** The version, and the one button that checks, then installs. */
function updateRow(version: string, u: UpdateState, T: Strings): string {
  const U = T.update;
  const [note, button] =
    u.kind === 'checking' ? [U.checking, ''] :
    u.kind === 'latest' ? [U.latest, `<button data-update="check">${esc(U.check)}</button>`] :
    u.kind === 'available' ? [U.available(u.version), `<button class="on" data-update="install">${esc(U.install)}</button>`] :
    u.kind === 'installing' ? [U.installing(u.percent), ''] :
    u.kind === 'failed' ? [u.during === 'check' ? U.checkFailed : U.installFailed, `<button data-update="check">${esc(U.check)}</button>`] :
    ['', `<button data-update="check">${esc(U.check)}</button>`];
  return `<div class="update"><span class="version">${esc(U.version(version))}</span><span class="note${u.kind === 'available' ? ' new' : ''}">${esc(note)}</span>${button}</div>`;
}

// ---- Hover toolbar and the games list ------------------------------------------------------------

/** Icons in basic shapes, 14 px, drawn in the current text colour. */
const ICON: Record<Tier | 'games' | 'box' | 'settings' | 'corner', string> = {
  bar: '<rect x="1.5" y="3" width="11" height="8" rx="1.5"/><path d="M3.5 6.5h7"/>',
  court: '<path d="M3 3.5h8l1.5 7.5h-11z"/><path d="M5.2 3.5v3h3.6v-3"/>',
  games: '<path d="M2.5 4h9M2.5 7h9M2.5 10h9"/>',
  // A small table: the players' lines.
  box: '<rect x="2" y="2.5" width="10" height="9" rx="1.5"/><path d="M2 5.5h10M5.5 5.5v6"/>',
  // The screen, and a small window in its bottom-right corner.
  corner: '<rect x="1.5" y="2" width="11" height="10" rx="1.5"/><rect x="7" y="7" width="3.5" height="3" rx=".5" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="7" cy="7" r="2"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3.1 3.1l1.4 1.4M9.5 9.5l1.4 1.4M3.1 10.9l1.4-1.4M9.5 4.5l1.4-1.4"/>',
};
const icon = (k: keyof typeof ICON) => `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${ICON[k]}</svg>`;

/**
 * The toolbar along the bottom of the window: the two sizes (the current one
 * lit), the games list and the settings. Buttons carry data-* attributes; src/ui/main.ts handles them.
 */
export function controlsView(tier: Tier, T: Strings, playersOpen = false, moved = false): string {
  // Each button's tip is drawn by app.css from data-tip (a native title shows late and plain).
  const size = (t: Tier) => `<button class="icon${t === tier ? ' on' : ''}" data-tier="${t}" data-tip="${esc(T.tip[t])}" aria-label="${esc(T.tip[t])}">${icon(t)}</button>`;
  // Only once the window was dragged away from the screen's corner; at the row's left end, apart
  // from the others, which stay put.
  const corner = moved ? `<button class="icon corner" data-corner data-tip="${esc(T.tip.corner)}" aria-label="${esc(T.tip.corner)}">${icon('corner')}</button>` : '';
  return `<div class="controls">${corner}${size('bar')}${size('court')}<span class="sep"></span>`
    + `<button class="icon" data-open="games" data-tip="${esc(T.tip.games)}" aria-label="${esc(T.tip.games)}">${icon('games')}</button>`
    + `<button class="icon${playersOpen ? ' on' : ''}" data-players data-tip="${esc(T.tip.box)}" aria-label="${esc(T.tip.box)}">${icon('box')}</button>`
    + `<button class="icon" data-open="settings" data-tip="${esc(T.tip.settings)}" aria-label="${esc(T.tip.settings)}">${icon('settings')}</button></div>`;
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
    // Two teams in one row: the same clash rule as on the score (src/render/colour.ts), for a logo's stand-in.
    const c = gameColours(g.teams, favIn(g.teams, favs));
    const abbr = (sd: Side) => `${logo(g.teams[sd], c[sd])}<span>${esc(g.teams[sd].abbr)}${star(g.teams[sd], favs)}</span>`;
    const mid = showScore ? `<b>${g.score.away}</b><span class="muted">–</span><b>${g.score.home}</b>` : '<span class="muted">@</span>';
    return `<button class="game${g.id === current ? ' on' : ''}${how === 'live' && g.status !== 'scheduled' ? ' live' : ''}${favIn(g.teams, favs) ? ' fav' : ''}" data-game="${esc(g.id)}" data-how="${how}">`
      + `<span class="who">${abbr('away')}${mid}${abbr('home')}</span>`
      + `<span class="when mono">${esc(cardWhen(g, T, tipOff))}</span></button>`;
  };
  return `<div class="panel games">
      <div class="head"><button class="icon" data-day="-1" title="${esc(T.prevDay)}">‹</button><b>${esc(day)}</b><button class="icon" data-day="1" title="${esc(T.nextDay)}">›</button><span class="grow"></span><button class="icon close" data-done aria-label="${esc(T.close)}">✕</button></div>
      <div class="list">${sorted.length ? sorted.map(row).join('') : `<span class="muted">${esc(T.noGames)}</span>`}</div>
    </div>`;
}

/** The players' window's tabs: a side's players, or the two teams' stats side by side. */
export type BoxTab = Side | 'team';

const pct = (m: MadeOf) => (m.att ? Math.round((m.made / m.att) * 100) : 0);

/**
 * The two teams' stats as a butterfly chart: each row a stat, the away bar growing left from the
 * middle and the home bar right, in the team colours. A shooting row's bar is its percentage, the
 * whole half 100% (made-attempted beside it); a count's bars compare the two, the larger as long as
 * the half. The better side's number is brighter
 * (for turnovers and fouls, the fewer).
 */
export function teamView(teams: Record<Side, TeamRef>, stats: Partial<Record<Side, TeamStats>>, T: Strings, favs: readonly string[] = []): string {
  const a = stats.away, h = stats.home;
  if (!a || !h) return `<span class="muted">${esc(T.loading)}</span>`;
  const c = gameColours(teams, favIn(teams, favs));
  type Row = { label: string; av: number; hv: number; at: string; ht: string; fewer?: boolean; percent?: boolean };
  const shot = (label: string, x: MadeOf, y: MadeOf): Row => ({ label, av: pct(x), hv: pct(y), at: `${x.made}-${x.att} · ${pct(x)}%`, ht: `${pct(y)}% · ${y.made}-${y.att}`, percent: true });
  const count = (label: string, x: number, y: number, fewer = false): Row => ({ label, av: x, hv: y, at: String(x), ht: String(y), fewer });
  const S = T.teamStat;
  const rows: Row[] = [
    shot(S.fg, a.fg, h.fg), shot(S.two, a.two, h.two), shot(S.three, a.three, h.three), shot(S.ft, a.ft, h.ft),
    { ...count(S.reb, a.reb, h.reb), at: `${a.reb} (${a.oreb}/${a.dreb})`, ht: `(${h.oreb}/${h.dreb}) ${h.reb}` },
    count(S.ast, a.ast, h.ast), count(S.stl, a.stl, h.stl), count(S.blk, a.blk, h.blk),
    count(S.to, a.to, h.to, true), count(S.fouls, a.fouls, h.fouls, true),
    count(S.fastBreak, a.fastBreak, h.fastBreak), count(S.paint, a.paint, h.paint), count(S.largestLead, a.largestLead, h.largestLead),
  ];
  const row = (r: Row) => {
    const max = r.percent ? 100 : Math.max(r.av, r.hv) || 1;
    const better = r.av === r.hv ? '' : (r.av > r.hv) !== !!r.fewer ? 'away' : 'home';
    const bar = (side: Side, v: number) => `<i class="bar ${side}" style="width:${((v / max) * 100).toFixed(1)}%;background:#${esc(c[side])}"></i>`;
    return `<div class="trow" title="${esc(`${teams.away.abbr} ${r.at}  ·  ${r.label}  ·  ${r.ht} ${teams.home.abbr}`)}">`
      + `<div class="tvals"><span class="${better === 'away' ? 'better' : ''}">${esc(r.at)}</span><span class="tlabel">${esc(r.label)}</span><span class="${better === 'home' ? 'better' : ''}">${esc(r.ht)}</span></div>`
      + `<div class="tbars"><div class="half away">${bar('away', r.av)}</div><div class="half home">${bar('home', r.hv)}</div></div></div>`;
  };
  return `<div class="teamstats">${rows.map(row).join('')}</div>`;
}

/**
 * The players' window: one side's box score, starters first, a line, then the bench, those who did
 * not play last and quieter. A "*" marks who is on the court now (`onCourt`, from the plays). The
 * buttons switch between the sides and the teams' stats (`stats`); the main window's stats button
 * opens and closes it. `box` is undefined while it loads.
 */
export function boxView(teams: Record<Side, TeamRef> | undefined, box: Record<Side, BoxLine[]> | undefined, side: BoxTab, T: Strings, favs: readonly string[] = [], onCourt: ReadonlySet<string> = new Set(), stats?: Partial<Record<Side, TeamStats>>): string {
  if (!teams) return `<div class="panel box"><span class="muted">${esc(T.box.noGame)}</span></div>`;
  const c = gameColours(teams, favIn(teams, favs));
  const tab = (sd: Side) => `<button class="side${sd === side ? ' on' : ''}" data-box-side="${sd}">${colourDot(c[sd])}${esc(teams[sd].abbr)}${star(teams[sd], favs)}</button>`;
  const tabs = `${tab('away')}${tab('home')}<button class="side${side === 'team' ? ' on' : ''}" data-box-side="team">${esc(T.box.team)}</button>`;
  if (side === 'team') return `<div class="panel box"><div class="head">${tabs}</div>${stats ? teamView(teams, stats, T, favs) : `<span class="muted">${esc(T.loading)}</span>`}</div>`;
  const cols = ['min', ...STAT_KEYS] as const;
  const head = `<div class="row head-row"><span class="name">${esc(T.box.player)}</span>${cols.map((k) => `<span>${esc(k === 'min' ? T.box.min : T.stat(k))}</span>`).join('')}</div>`;
  const name = (l: BoxLine) => `<span class="name">${onCourt.has(l.player.id) ? '<b class="on-court">*</b>' : ''}${esc(l.player.short)}</span>`;
  const row = (l: BoxLine) => l.dnp
    ? `<div class="row dnp">${name(l)}<span class="why">${esc(T.box.dnp)}</span></div>`
    : `<div class="row${l.starter ? ' starter' : ''}">${name(l)}${cols.map((k) => `<span>${l[k]}</span>`).join('')}</div>`;
  // A line between the starters and the bench.
  const lines = box?.[side];
  const body = lines
    ? lines.map((l, i) => (i > 0 && lines[i - 1]!.starter && !l.starter ? '<hr class="bench">' : '') + row(l)).join('')
    : `<span class="muted">${esc(T.loading)}</span>`;
  return `<div class="panel box"><div class="head">${tabs}</div><div class="table">${head}<div class="list">${body}</div></div></div>`;
}

/**
 * The line score, under the main window when the stats are open: each side's points per period
 * (overtimes included) and in total, the period being played lit. Periods not started yet show "–".
 */
export function lineScoreView(s: Pick<GameState, 'teams' | 'periodScores' | 'score' | 'period' | 'status'>, T: Strings, favs: readonly string[] = []): string {
  const c = gameColours(s.teams, favIn(s.teams, favs));
  const n = Math.max(4, s.period, s.periodScores.away.length, s.periodScores.home.length);
  const on = (p: number) => (s.status === 'live' || s.status === 'break') && p === s.period;
  const head = `<div class="lrow lhead"><span class="lteam"></span>${Array.from({ length: n }, (_, i) => `<span class="${on(i + 1) ? 'now' : ''}">${periodLabel(i + 1)}</span>`).join('')}<span class="ltotal">${esc(T.lineTotal)}</span></div>`;
  const row = (side: Side) => `<div class="lrow"><span class="lteam"><i class="stripe" style="background:#${esc(c[side])}"></i>${esc(s.teams[side].abbr)}${star(s.teams[side], favs)}</span>`
    + Array.from({ length: n }, (_, i) => { const v = s.periodScores[side][i]; return `<span class="${on(i + 1) ? 'now' : ''}">${v === undefined ? '–' : v}</span>`; }).join('')
    + `<b class="ltotal">${s.score[side]}</b></div>`;
  return `<div class="linescore">${head}${row('away')}${row('home')}</div>`;
}

