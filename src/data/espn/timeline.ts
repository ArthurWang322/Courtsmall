// ESPN plays -> normalized timeline. The score always comes from the plays' running
// `awayScore` / `homeScore`, never from adding up points ourselves.

import { RECENT_PLAYS, type Basket, type FoulKind, type GameEvent, type GameState, type GameStatus, type PlayerRef, type PlayLine, type Points, type Side, type StoppageKind, type TeamRef, type TimelineEntry } from '../../model/types.ts';
import { refId, type CorePlay, type GameFeed } from './feed-types.ts';

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

export const teamRef = (t: { id: string; abbreviation: string; displayName: string; color?: string; alternateColor?: string }): TeamRef =>
  ({ id: t.id, abbr: t.abbreviation, name: t.displayName, ...(t.color ? { color: t.color } : {}), ...(t.alternateColor ? { alternateColor: t.alternateColor } : {}) });

/** ESPN's status name, e.g. STATUS_HALFTIME, as a GameStatus. */
export const gameStatus = (name: string): GameStatus => STATUS[name] ?? 'unknown';

/** The state before the first play: teams and status from the summary, everything else zero. */
export function initialState(feed: GameFeed): GameState {
  const comp = feed.summary.header.competitions[0]!;
  const teams = {} as Record<Side, TeamRef>;
  for (const c of comp.competitors) teams[c.homeAway] = teamRef(c.team);
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

interface Rostered { player: PlayerRef; teamId: string }

function players(feed: GameFeed): Map<string, Rostered> {
  const out = new Map<string, Rostered>();
  for (const team of feed.summary.boxscore.players ?? [])
    for (const group of team.statistics)
      for (const a of group.athletes)
        out.set(a.athlete.id, { player: { id: a.athlete.id, name: a.athlete.displayName, short: a.athlete.shortName }, teamId: team.team.id });
  return out;
}

/**
 * What kind of play this is, from ESPN's type name (e.g. "Out of Bounds - Bad Pass Turnover").
 * The names are categories, not the play's description; matching them covers the ~80 type ids
 * seen so far (docs/PROBE_REPORT.md §10) and ids not seen yet. Order matters: "Offensive Foul
 * Turnover" is a turnover, "Free Throw - Flagrant 1 of 2" is a shot.
 */
export function playKind(typeText: string):
  | { kind: 'turnover' } | { kind: 'foul'; foul: FoulKind } | { kind: 'rebound'; offensive: boolean }
  | { kind: 'substitution' } | { kind: 'stoppage'; stoppage: StoppageKind } | undefined {
  const t = typeText.toLowerCase();
  if (t.startsWith('free throw')) return undefined;
  if (/turnover|traveling/.test(t)) return { kind: 'turnover' };
  if (/rebound/.test(t)) return { kind: 'rebound', offensive: t.includes('offensive') };
  if (t === 'substitution') return { kind: 'substitution' };
  if (/timeout/.test(t)) return { kind: 'stoppage', stoppage: 'timeout' };
  if (/challenge|review/.test(t)) return { kind: 'stoppage', stoppage: 'review' };
  if (/technical/.test(t)) return { kind: 'foul', foul: 'technical' };
  if (/flagrant/.test(t)) return { kind: 'foul', foul: 'flagrant' };
  if (/shooting foul/.test(t)) return { kind: 'foul', foul: 'shooting' };
  if (/offensive (foul|charge)/.test(t)) return { kind: 'foul', foul: 'offensive' };
  if (/foul/.test(t)) return { kind: 'foul', foul: 'personal' };
  return undefined;
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
    // A stoppage lasts until play resumes; the substitutions made during a timeout do not end it.
    if (playKind(play.type.text)?.kind !== 'substitution') delete next.stoppage;

    /** The participant with this role, or the n-th one when ESPN gives no roles. */
    const parts = (play.participants ?? []).filter((x) => x !== null);
    const who = (role: string, n = 0): Rostered | undefined => {
      const p = parts.find((x) => x.type === role) ?? (parts.some((x) => x.type) ? undefined : parts[n]);
      return roster.get(refId(p?.athlete, 'athletes') ?? '');
    };
    const remember = (ev: PlayLine) => { next.recentPlays = [...(next.recentPlays ?? []), ev].slice(-RECENT_PLAYS); };
    const sideFor = (r?: Rostered) => sideOf.get(r?.teamId ?? '') ?? sideOf.get(refId(play.team, 'teams') ?? '');

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
      const basket: Basket = { side: s, points: delta as Points, period: next.period, clock: next.clock };
      const shooter = who('shooter')?.player;
      if (shooter) basket.player = shooter;
      next.lastBasket = basket;
      next.run = state.run?.side === s ? { side: s, points: state.run.points + delta } : { side: s, points: delta };
      const ev = { type: 'basket', basket, score: next.score } as const;
      remember(ev);
      events.push(ev);
    }

    for (const ev of playEvents(play, who, sideFor)) {
      if (ev.type === 'stoppage') next.stoppage = ev.kind;
      else remember(ev);
      events.push(ev);
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

type Who = (role: string, n?: number) => Rostered | undefined;

type PlayEvent = Extract<GameEvent, { type: 'miss' | 'foul' | 'turnover' | 'rebound' | 'substitution' | 'stoppage' }>;

/** The misses, fouls, turnovers, rebounds, substitutions and stoppages in one play. */
function playEvents(play: CorePlay, who: Who, sideFor: (r?: Rostered) => Side | undefined): PlayEvent[] {
  const opt = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  const pts = play.pointsAttempted;
  if (play.shootingPlay && !play.scoringPlay && (pts === 1 || pts === 2 || pts === 3)) {
    const r = who('shooter');
    return [opt({ type: 'miss' as const, points: pts as Points, side: sideFor(r), player: r?.player, blockedBy: who('blocker')?.player, heave: /heave/i.test(play.type.text) ? true as const : undefined })];
  }
  const k = playKind(play.type.text);
  if (!k) return [];
  switch (k.kind) {
    case 'foul': {
      // A double foul names both players, one from each side: one foul each.
      const parts = (play.participants ?? []).filter((x) => x !== null);
      const fouls = parts.length > 1 && !parts.some((x) => x.type)
        ? [who('', 0), who('', 1)] : [who('fouler')];
      return fouls.map((r) => opt({ type: 'foul' as const, kind: k.foul, side: sideFor(r), player: r?.player }));
    }
    case 'turnover': {
      const r = who('offense');
      return [opt({ type: 'turnover' as const, side: sideFor(r), player: r?.player, stolenBy: who('defender')?.player })];
    }
    case 'rebound': {
      const r = who('rebounder');
      return [opt({ type: 'rebound' as const, offensive: k.offensive, side: sideFor(r), player: r?.player })];
    }
    case 'substitution': {
      const r = who('subin');
      return [opt({ type: 'substitution' as const, side: sideFor(r), in: r?.player, out: who('subout')?.player })];
    }
    case 'stoppage':
      return [opt({ type: 'stoppage' as const, kind: k.stoppage, side: sideFor() })];
  }
}

