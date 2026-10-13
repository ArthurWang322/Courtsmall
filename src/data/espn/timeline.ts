// ESPN plays -> normalized timeline. The score always comes from the plays' running
// `awayScore` / `homeScore`, never from adding up points ourselves.

import type { Basket, GameEvent, GameState, GameStatus, PlayerRef, Points, Side, TeamRef, TimelineEntry } from '../../model/types.ts';
import { refId, type GameFeed } from './feed-types.ts';

const END_PERIOD = '412';
const END_GAME = '402';
const SIDES: Side[] = ['away', 'home'];

const STATUS: Record<string, GameStatus> = {
  STATUS_SCHEDULED: 'scheduled',
  STATUS_IN_PROGRESS: 'live',
  STATUS_HALFTIME: 'break',
  STATUS_END_PERIOD: 'break',
  STATUS_DELAYED: 'delayed',
  STATUS_POSTPONED: 'postponed',
  STATUS_CANCELED: 'cancelled',
  STATUS_FINAL: 'final',
};

/** ESPN's status name, e.g. STATUS_HALFTIME, as a GameStatus. */
export const gameStatus = (name: string): GameStatus => STATUS[name] ?? 'unknown';

/** The state before the first play: teams and status from the summary, everything else zero. */
export function initialState(feed: GameFeed): GameState {
  const comp = feed.summary.header.competitions[0]!;
  const teams = {} as Record<Side, TeamRef>;
  for (const c of comp.competitors) teams[c.homeAway] = { id: c.team.id, abbr: c.team.abbreviation, name: c.team.displayName };
  return {
    gameId: feed.summary.header.id,
    season: feed.summary.header.season.year,
    postseason: feed.summary.header.season.type === 3,
    status: gameStatus(comp.status.type.name),
    teams,
    period: 0,
    clock: 0,
    score: { away: 0, home: 0 },
    periodScores: { away: [], home: [] },
  };
}

function players(feed: GameFeed): Map<string, PlayerRef> {
  const out = new Map<string, PlayerRef>();
  for (const team of feed.summary.boxscore.players ?? [])
    for (const group of team.statistics)
      for (const a of group.athletes) out.set(a.athlete.id, { id: a.athlete.id, name: a.athlete.displayName, short: a.athlete.shortName });
  return out;
}

export function buildTimeline(feed: GameFeed): TimelineEntry[] {
  let state = initialState(feed);
  const sideOf = new Map(SIDES.map((s) => [state.teams[s].id, s]));
  const roster = players(feed);
  const out: TimelineEntry[] = [];

  for (const play of feed.plays) {
    const events: GameEvent[] = [];
    const next: GameState = {
      ...state,
      status: 'live',
      clock: play.clock.value,
      score: { away: play.awayScore, home: play.homeScore },
      periodScores: { away: [...state.periodScores.away], home: [...state.periodScores.home] },
      at: Date.parse(play.wallclock),
    };

    if (play.period.number !== state.period) {
      next.period = play.period.number;
      events.push({ type: 'periodStart', period: next.period });
    }
    for (const s of SIDES) while (next.periodScores[s].length < next.period) next.periodScores[s].push(0);

    for (const s of SIDES) {
      const delta = next.score[s] - state.score[s];
      if (delta === 0) continue;
      next.periodScores[s][next.period - 1]! += delta;
      // ESPN's running score sometimes drops on one play and comes back on a later, non-scoring one
      // (a timeout, a turnover). Keep the score, but such a change is a correction, not a basket.
      if (!play.scoringPlay || delta < 1 || delta > 3) continue;
      const shooter = refId(play.participants?.find((p) => p.type === 'shooter')?.athlete ?? play.participants?.[0]?.athlete, 'athletes');
      const basket: Basket = { side: s, points: delta as Points, period: next.period, clock: next.clock };
      const player = shooter ? roster.get(shooter) : undefined;
      if (player) basket.player = player;
      next.lastBasket = basket;
      next.run = state.run?.side === s ? { side: s, points: state.run.points + delta } : { side: s, points: delta };
      events.push({ type: 'basket', basket, score: next.score });
    }

    const possession = sideOf.get(refId(play.possessionTeam, 'teams') ?? '');
    if (possession) next.possession = possession;
    else delete next.possession;

    if (play.type.id === END_PERIOD) {
      next.status = 'break';
      events.push({ type: 'periodEnd', period: next.period });
    } else if (play.type.id === END_GAME) {
      next.status = 'final';
      const { away, home } = next.score;
      events.push({ type: 'gameEnd', winner: away === home ? 'tie' : away > home ? 'away' : 'home', score: next.score });
    }

    state = next;
    out.push({ t: next.at!, id: play.id, events, state });
  }
  return out;
}
