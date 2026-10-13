// Normalized game model. Everything downstream of the adapter (store, animation, renderers,
// notifications) sees only these types, never ESPN's raw JSON.
// The fields are what a one-second glance needs (docs/PLAN.md Q3): score, period, clock,
// possession, the last basket, and the current run.

export type Side = 'away' | 'home';

export type GameStatus =
  | 'scheduled'
  | 'live'
  /** Between periods, halftime included. */
  | 'break'
  | 'delayed'
  | 'postponed'
  | 'cancelled'
  | 'final'
  | 'unknown';

export interface PlayerRef {
  id: string;
  /** Full name as the league spells it. Player names are not translated. */
  name: string;
  /** Short form for tight layouts, e.g. "D. Holmes II". */
  short: string;
}

export interface TeamRef {
  id: string;
  abbr: string;
  name: string;
  /** The league's team colour, "rrggbb". */
  color?: string;
  /** The league's second colour, used when the first one does not stand out (src/render/colour.ts). */
  alternateColor?: string;
}

/** 1 free throw, 2 two-pointer (goaltending included), 3 three-pointer. */
export type Points = 1 | 2 | 3;

export interface Basket {
  side: Side;
  points: Points;
  /** The shooter, when the league names one. */
  player?: PlayerRef;
  period: number;
  /** Seconds left in the period when it happened. */
  clock: number;
}

/**
 * One field-goal attempt on the half court, for the court view. ESPN's coordinates in feet:
 * x 0-50 across, y away from the baseline, the basket at (25, 1) (docs/PROBE_REPORT.md §11).
 * Both teams' shots are drawn on the same basket.
 */
export interface Shot {
  /** ESPN play id. */
  id: string;
  side: Side;
  made: boolean;
  points: 2 | 3;
  x: number;
  y: number;
}

/** Where the basket is in shot coordinates. */
export const BASKET = { x: 25, y: 1 } as const;

/** How many shots the state keeps for the court view. */
export const RECENT_SHOTS = 8;

/** Points one side has scored since the other side last scored. */
export interface Run {
  side: Side;
  points: number;
}

export type FoulKind = 'personal' | 'shooting' | 'offensive' | 'technical' | 'flagrant';
export type StoppageKind = 'timeout' | 'review';

export type GameEvent =
  | { type: 'periodStart'; period: number }
  | { type: 'basket'; basket: Basket; score: Record<Side, number> }
  /** `side` and `player` are absent when the league does not name them (a team foul, a shot-clock turnover). */
  | { type: 'foul'; kind: FoulKind; side?: Side; player?: PlayerRef }
  | { type: 'turnover'; side?: Side; player?: PlayerRef; stolenBy?: PlayerRef }
  /**
   * A missed shot or free throw; `points` is what it was worth (1 free throw, 2, 3). `heave`: a
   * last-second heave, which the box score does not count as an attempt (docs/PROBE_REPORT.md §10).
   */
  | { type: 'miss'; points: Points; side?: Side; player?: PlayerRef; blockedBy?: PlayerRef; heave?: true }
  /** No `player`: a team rebound. */
  | { type: 'rebound'; offensive: boolean; side?: Side; player?: PlayerRef }
  | { type: 'substitution'; side?: Side; in?: PlayerRef; out?: PlayerRef }
  /** A timeout, or a coach's challenge or referee review. */
  | { type: 'stoppage'; kind: StoppageKind; side?: Side }
  | { type: 'periodEnd'; period: number }
  | { type: 'gameEnd'; winner: Side | 'tie'; score: Record<Side, number> };

/** A play the bar gives a line to. */
export type PlayLine = Extract<GameEvent, { type: 'basket' | 'miss' | 'foul' | 'turnover' | 'rebound' | 'substitution' }>;

/** How many recent plays the state keeps for the bar. */
export const RECENT_PLAYS = 2;

export interface GameState {
  gameId: string;
  /** "2026" for the 2025-26 season, as ESPN numbers it. */
  season?: number;
  postseason?: boolean;
  status: GameStatus;
  teams: Record<Side, TeamRef>;
  /** 1-4, then 5 for the first overtime and so on. 0 before tip-off. */
  period: number;
  /** Seconds left in the period. */
  clock: number;
  score: Record<Side, number>;
  /** Points per period, index 0 = first quarter. */
  periodScores: Record<Side, number[]>;
  /** The side the league says has the ball in the latest play. Absent when it does not say. */
  possession?: Side;
  lastBasket?: Basket;
  /**
   * The latest plays worth a line on the bar (a basket, miss, foul, turnover, rebound or
   * substitution), oldest first, at most `RECENT_PLAYS`: a miss and its rebound read together.
   */
  recentPlays?: readonly PlayLine[];
  /** A timeout or review is the latest play: the clock is stopped for it. Cleared by the next play. */
  stoppage?: StoppageKind;
  /** The latest field-goal attempts, oldest first, at most `RECENT_SHOTS`. Free throws have no spot. */
  recentShots?: readonly Shot[];
  run?: Run;
  /** Epoch ms of the moment this state describes. */
  at?: number;
}

/**
 * One step of a game: the events of one play, in order, and the state after them.
 * Plays that change nothing the glance shows (a missed shot, a rebound) still get an entry,
 * with no events, because clock and possession move.
 */
export interface TimelineEntry {
  /** Epoch ms of the play (ESPN `wallclock`). */
  t: number;
  /** ESPN play id. */
  id: string;
  events: GameEvent[];
  state: GameState;
}

/** One game on a day's schedule, for choosing what to follow. */
export interface GameCard {
  id: string;
  status: GameStatus;
  teams: Record<Side, TeamRef>;
  /** Epoch ms of the scheduled tip-off. */
  start: number;
  period: number;
  clock: number;
  score: Record<Side, number>;
}

export type Unsubscribe = () => void;

export interface GameHandlers {
  onEvent(event: GameEvent, entry: TimelineEntry): void;
  onState(state: GameState, entry: TimelineEntry): void;
  onError?(error: unknown): void;
}

/** A source of one game's events: the live feed, or a replay of a finished game. */
export interface GameSource {
  subscribe(gameId: string, handlers: GameHandlers): Unsubscribe;
}
