// When to tell the user something, for the game being followed. Pure: the state before and after
// one update in, the notices out. Each notice has a key so it is sent once per game.

import type { GameState, Side } from '../model/types.ts';
import type { Settings } from '../settings/store.ts';

export type NoticeKind = 'start' | 'clutch';

export interface Notice {
  kind: NoticeKind;
  /** Unique per game and moment: "start", "clutch:5" (the period). */
  key: string;
  state: GameState;
}

/** "Clutch": the last two minutes of the fourth quarter or an overtime, within five points. */
export const CLUTCH = { seconds: 120, margin: 5 } as const;

export const isClutch = (s: GameState) =>
  s.status === 'live' && s.period >= 4 && s.clock <= CLUTCH.seconds && Math.abs(s.score.away - s.score.home) <= CLUTCH.margin;

/**
 * Notices for one update. `before` is undefined for the first state seen: joining a game in
 * progress says nothing about a start that already happened.
 */
export function notices(before: GameState | undefined, after: GameState, settings: Settings['notify']): Notice[] {
  const out: Notice[] = [];
  if (settings.start && before?.status === 'scheduled' && (after.status === 'live' || after.status === 'break'))
    out.push({ kind: 'start', key: 'start', state: after });
  if (settings.clutch && isClutch(after) && !(before && isClutch(before) && before.period === after.period))
    out.push({ kind: 'clutch', key: `clutch:${after.period}`, state: after });
  return out;
}

/**
 * What to compare a game's first state with. The app starts following a game only once it is on
 * (before that it shows the countdown), so it never sees the game scheduled; if the schedule last
 * had it scheduled, it has just started and the tip-off is news. Otherwise, as when the app opens
 * in the third quarter, there is nothing to compare with and no start is announced.
 */
export const assumedBefore = (first: GameState, wasScheduled: boolean): GameState | undefined =>
  wasScheduled ? { ...first, status: 'scheduled' } : undefined;

export const leader = (s: GameState): Side | undefined =>
  s.score.away === s.score.home ? undefined : s.score.away > s.score.home ? 'away' : 'home';
