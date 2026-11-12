// A player's card (src/ui/players.ts): this regular season's averages and the recent finished games, from the
// common API's athlete overview. Columns are read by their names, never by position (the order of `names` is not
// that of the labels); anything missing leaves its value out rather than failing.

import type { PlayerCard, RecentGame, SeasonAverages } from '../../model/types.ts';
import type { AthleteOverview } from './feed-types.ts';
import type { FetchJson } from './fetch.ts';

export const athleteUrl = (id: string) =>
  `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(id)}/overview`;

export async function loadPlayerCard(get: FetchJson, id: string, now: number): Promise<PlayerCard> {
  return parseOverview((await get(athleteUrl(id))) as AthleteOverview, now);
}

/** ESPN's numbers come as strings: blank or not a number is no value (Number('') would be 0). */
const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const SEASON = {
  min: 'avgMinutes', pts: 'avgPoints', reb: 'avgRebounds', ast: 'avgAssists', stl: 'avgSteals', blk: 'avgBlocks',
  to: 'avgTurnovers', fgPct: 'fieldGoalPct', threePct: 'threePointPct', ftPct: 'freeThrowPct',
} as const;
const GAME = {
  min: 'minutes', pts: 'points', reb: 'totalRebounds', ast: 'assists', stl: 'steals', blk: 'blocks',
  to: 'turnovers', fgPct: 'fieldGoalPct', threePct: 'threePointPct', ftPct: 'freeThrowPct',
} as const;
type Line = { [K in keyof typeof SEASON]?: number };

/** The values of `stats` under the model's keys, through `map` (model key → ESPN name). */
function lineOf(names: readonly string[], stats: readonly string[], map: Record<string, string>): Line {
  const out: Record<string, number> = {};
  for (const [key, name] of Object.entries(map)) {
    const i = names.indexOf(name);
    const v = i < 0 ? undefined : num(stats[i]);
    if (v !== undefined) out[key] = v;
  }
  return out as Line;
}

/** The NBA season a moment belongs to, by its local date: from September, that year's; before, the year before. */
const nbaSeason = (t: number) => { const d = new Date(t); return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; };

export function parseOverview(raw: AthleteOverview, now: number): PlayerCard {
  const games = recentGames(raw);
  // The overview gives no season year: games from an earlier season mean none finished in this one, and its
  // "Regular Season" split is then last season's.
  const stale = !!games[0] && nbaSeason(games[0].date) < nbaSeason(now);
  const season = stale ? undefined : seasonOf(raw);
  return { ...(season ? { season } : {}), games, stale };
}

function seasonOf(raw: AthleteOverview): SeasonAverages | undefined {
  const names = raw.statistics?.names ?? [];
  const split = raw.statistics?.splits?.find((s) => s.displayName === 'Regular Season');
  if (!split) return undefined;
  const stats = split.stats ?? [];
  const i = names.indexOf('gamesPlayed');
  const gp = i < 0 ? undefined : num(stats[i]);
  if (!gp) return undefined;
  return { gp, ...lineOf(names, stats, SEASON) };
}

function recentGames(raw: AthleteOverview): RecentGame[] {
  const events = raw.gameLog?.events ?? {};
  const seen = new Set<string>();
  const out: RecentGame[] = [];
  for (const block of raw.gameLog?.statistics ?? []) {
    const names = block.names ?? [];
    for (const row of block.events ?? []) {
      const id = row.eventId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const e = events[id];
      const date = e?.gameDate ? Date.parse(e.gameDate) : NaN;
      if (!e || Number.isNaN(date)) continue;
      // The player's side from the team ids, not from "@"/"vs": at a neutral site ESPN says "vs" with the
      // player's team listed as away.
      const home = e.team?.id ? e.team.id === e.homeTeamId : e.opponent?.id ? e.opponent.id === e.awayTeamId : undefined;
      const homePts = num(e.homeTeamScore), awayPts = num(e.awayTeamScore);
      const own = home === undefined ? undefined : home ? homePts : awayPts;
      const oppScore = home === undefined ? undefined : home ? awayPts : homePts;
      out.push({
        id, date, at: e.atVs === '@' ? '@' : 'vs', opp: e.opponent?.abbreviation ?? '',
        ...(e.gameResult === 'W' || e.gameResult === 'L' ? { result: e.gameResult } : {}),
        ...(own !== undefined ? { own } : {}), ...(oppScore !== undefined ? { oppScore } : {}),
        ...lineOf(names, row.stats ?? [], GAME),
      });
    }
  }
  return out.sort((a, b) => b.date - a.date).slice(0, 5);
}
