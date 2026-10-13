// Text parts of the main window for each size tier. Pure string builders: state in, HTML out.
// What a glance needs (docs/PLAN.md Q3): score, period and clock, possession, the last basket,
// and a run once it is worth noticing.

import type { GameState, PlayLine, Side } from '../model/types.ts';
import type { Strings } from '../i18n/index.ts';

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
    case 'final': return T.final;
    case 'postponed': return T.postponed;
    case 'cancelled': return T.cancelled;
    case 'delayed': return T.delayed;
    case 'break': return s.period === 2 ? T.half : T.endOf(T.period(s.period));
    // A timeout or review says why the clock is stopped.
    default: return s.period > 0 ? `${T.period(s.period)} ${clockText(s.clock)}${s.stoppage ? ` · ${T.stoppage(s.stoppage)}` : ''}` : '';
  }
}

const dot = (s: GameState, side: Side) =>
  `<i class="dot${s.possession === side && s.status === 'live' ? ' ball' : ''}" style="background:#${esc(s.teams[side].color ?? '888888')}"></i>`;

function scoreHtml(s: GameState, withAbbr: boolean): string {
  const ab = (side: Side) => (withAbbr ? `<span class="abbr">${esc(s.teams[side].abbr)}</span>` : '');
  return `${dot(s, 'away')}${ab('away')}<b>${s.score.away}</b><span class="muted">–</span><b>${s.score.home}</b>${ab('home')}${dot(s, 'home')}`;
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
 * The play lines under the score, oldest first: the latest `count` plays, the run (when it is long
 * enough) after the newest. Two lines put a miss and its rebound, or a foul and its free throw, together.
 */
export function playLines(s: GameState, T: Strings, count: number): string[] {
  const lines = (s.recentPlays ?? []).slice(-count).map((p) => esc(playText(s, p, T)));
  if (s.run && s.run.points >= RUN_MIN && s.status !== 'final') {
    const run = esc(T.run(s.teams[s.run.side].abbr, s.run.points));
    if (lines.length) lines[lines.length - 1] += ` · ${run}`; else lines.push(run);
  }
  return lines;
}

/**
 * Dot tier: a pill with the score and the period. The team with the ball has a ring on its dot.
 * A replay is marked with "↺" (the word does not fit): a replay mistaken for a live game misleads.
 */
export function dotView(s: GameState, T: Strings, tag?: string): string {
  return `<div class="pill"><span class="sc">${scoreHtml(s, false)}</span><span class="when mono">${esc(whenText(s, T))}</span>${tag ? `<span class="tag" title="${esc(tag)}">↺</span>` : ''}</div>`;
}

/** Bar tier: score with team abbreviations and the period on top, the latest plays below. */
export function barView(s: GameState, T: Strings, lines: number, tag?: string): string {
  const plays = playLines(s, T, lines);
  return `<div class="bar">
      <div class="row"><span class="sc">${scoreHtml(s, true)}</span><span class="grow"></span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}<span class="when mono">${esc(whenText(s, T))}</span></div>
      ${Array.from({ length: lines }, (_, i) => `<div class="row last muted">${plays[i - (lines - plays.length)] ?? ''}</div>`).join('')}
    </div>`;
}

/** No game to show: a message, and when the next one tips off. */
export const messageView = (text: string, sub?: string) =>
  `<div class="msg"><span>${esc(text)}</span>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</div>`;
