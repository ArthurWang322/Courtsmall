// How tense a game is right now, for following "the closest game" when no team is chosen.
// Late, close and in the playoffs is tense. Pure: a GameCard in, a number from 0 up out.

import type { GameCard } from '../model/types.ts';

const REGULATION = 4 * 12 * 60;

/** 0 at tip-off, 1 at the end of regulation and through overtime. */
export function progress(g: Pick<GameCard, 'period' | 'clock'>): number {
  if (g.period > 4) return 1;
  const elapsed = (g.period - 1) * 720 + (720 - g.clock);
  return Math.max(0, Math.min(1, elapsed / REGULATION));
}

/** 1 for a tie, 0.5 at a three-point game, falling off from there. */
export const closeness = (g: Pick<GameCard, 'score'>) => 1 / (1 + Math.abs(g.score.away - g.score.home) / 3);

export function tension(g: GameCard, postseason = false): number {
  if (g.status !== 'live' && g.status !== 'break') return 0;
  // Progress counts for more as the game goes on: a tie in the first quarter is not a tie in the fourth.
  return (0.2 + progress(g) ** 2) * closeness(g) * (postseason ? 1.5 : 1);
}
