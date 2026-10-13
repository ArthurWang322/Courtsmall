// Text parts of the main window for each size tier. Pure string builders: state in, HTML out.
// What a glance needs (docs/PLAN.md Q3): score, period and clock, possession, the last basket,
// and a run once it is worth noticing.

import type { GameState, Side } from '../model/types.ts';
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
    default: return s.period > 0 ? `${T.period(s.period)} ${clockText(s.clock)}` : '';
  }
}

const dot = (s: GameState, side: Side) =>
  `<i class="dot${s.possession === side && s.status === 'live' ? ' ball' : ''}" style="background:#${esc(s.teams[side].color ?? '888888')}"></i>`;

function scoreHtml(s: GameState, withAbbr: boolean): string {
  const ab = (side: Side) => (withAbbr ? `<span class="abbr">${esc(s.teams[side].abbr)}</span>` : '');
  return `${dot(s, 'away')}${ab('away')}<b>${s.score.away}</b><span class="muted">–</span><b>${s.score.home}</b>${ab('home')}${dot(s, 'home')}`;
}

/** The second line of the bar: the last basket, and the run when it is long enough. */
export function lastLine(s: GameState, T: Strings): string {
  const parts: string[] = [];
  const b = s.lastBasket;
  if (b) parts.push(`${b.player ? esc(b.player.short) : esc(s.teams[b.side].abbr)} +${b.points}`);
  if (s.run && s.run.points >= RUN_MIN && s.status !== 'final') parts.push(esc(T.run(s.teams[s.run.side].abbr, s.run.points)));
  return parts.join(' · ');
}

/**
 * Dot tier: a pill with the score and the period. The team with the ball has a ring on its dot.
 * A replay is marked with "↺" (the word does not fit): a replay mistaken for a live game misleads.
 */
export function dotView(s: GameState, T: Strings, tag?: string): string {
  return `<div class="pill"><span class="sc">${scoreHtml(s, false)}</span><span class="when mono">${esc(whenText(s, T))}</span>${tag ? `<span class="tag" title="${esc(tag)}">↺</span>` : ''}</div>`;
}

/** Bar tier: score with team abbreviations and the period on top, the last basket below. */
export function barView(s: GameState, T: Strings, tag?: string): string {
  return `<div class="bar">
      <div class="row"><span class="sc">${scoreHtml(s, true)}</span><span class="grow"></span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}<span class="when mono">${esc(whenText(s, T))}</span></div>
      <div class="row last muted">${lastLine(s, T)}</div>
    </div>`;
}

/** No game to show: a message, and when the next one tips off. */
export const messageView = (text: string, sub?: string) =>
  `<div class="msg"><span>${esc(text)}</span>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</div>`;
