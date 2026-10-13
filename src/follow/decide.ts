// What to show now, and why. Pure: the day's games, the team's schedule, the time and the game
// on screen in; a decision out. The app turns the decision into subscriptions and views.
//
// Rules (docs/PLAN.md M4): never switch away from a game in progress; a game that ended stays up
// for a while; with a team, its game when it is on, otherwise its next game; without a team, the
// tensest game on, otherwise the next tip-off.

import type { GameCard, GameStatus } from '../model/types.ts';
import { tension } from './tension.ts';

/** How long a finished game stays on screen before the app moves on, ms. */
export const STAY_AFTER_FINAL_MS = 10 * 60_000;

export type Decision =
  | { kind: 'game'; id: string; why: 'current' | 'team' | 'tense' }
  /** The team's next game: later today, or another day. */
  | { kind: 'upcoming'; game: GameCard }
  /** Nothing to follow. `next`: the next tip-off of the day, when there is one. */
  | { kind: 'idle'; next?: GameCard };

export interface Situation {
  now: number;
  /** The chosen team's id, if any. */
  team?: string;
  today: readonly GameCard[];
  /** The team's games (the schedule request), when a team is chosen. */
  teamGames?: readonly GameCard[];
  /** The game on screen: its id, its status, and when it was first seen final. */
  current?: { id: string; status: GameStatus; finalAt?: number };
}

const ON = new Set<GameStatus>(['live', 'break', 'delayed']);
const plays = (g: GameCard, team: string) => g.teams.away.id === team || g.teams.home.id === team;

export function decide(s: Situation): Decision {
  const c = s.current;
  if (c && (ON.has(c.status) || (c.status === 'final' && c.finalAt !== undefined && s.now - c.finalAt < STAY_AFTER_FINAL_MS)))
    return { kind: 'game', id: c.id, why: 'current' };

  if (s.team) {
    const team = s.team;
    const on = s.today.find((g) => plays(g, team) && ON.has(g.status));
    if (on) return { kind: 'game', id: on.id, why: 'team' };
    const next = [...s.today, ...(s.teamGames ?? [])]
      .filter((g) => plays(g, team) && g.status === 'scheduled' && g.start > s.now - 3 * 3600_000)
      .sort((a, b) => a.start - b.start)[0];
    return next ? { kind: 'upcoming', game: next } : { kind: 'idle' };
  }

  const tense = s.today.filter((g) => ON.has(g.status)).sort((a, b) => tension(b) - tension(a))[0];
  if (tense) return { kind: 'game', id: tense.id, why: 'tense' };
  const next = s.today.filter((g) => g.status === 'scheduled').sort((a, b) => a.start - b.start)[0];
  return next ? { kind: 'idle', next } : { kind: 'idle' };
}
