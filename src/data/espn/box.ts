// A game's box score, from the summary: each side's players and their lines, starters first, as
// ESPN lists them. The official count, so the players' points add up to the score.

import type { BoxLine, Side } from '../../model/types.ts';
import type { Summary } from './feed-types.ts';

const COLUMNS = { min: 'MIN', pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', to: 'TO' } as const;

export function boxScore(summary: Summary): Record<Side, BoxLine[]> {
  const out: Record<Side, BoxLine[]> = { away: [], home: [] };
  const sideOf = new Map(summary.header.competitions[0]!.competitors.map((c) => [c.team.id, c.homeAway]));
  for (const team of summary.boxscore.players ?? []) {
    const side = sideOf.get(team.team.id);
    const g = team.statistics[0];
    if (!side || !g) continue;
    const at = (stats: string[], col: string) => Number(stats[g.names.indexOf(col)]) || 0;
    for (const a of g.athletes) {
      const line: BoxLine = {
        player: { id: a.athlete.id, name: a.athlete.displayName, short: a.athlete.shortName },
        starter: a.starter === true,
        dnp: a.didNotPlay === true || a.stats.length === 0,
        min: at(a.stats, COLUMNS.min), pts: at(a.stats, COLUMNS.pts), reb: at(a.stats, COLUMNS.reb), ast: at(a.stats, COLUMNS.ast),
        stl: at(a.stats, COLUMNS.stl), blk: at(a.stats, COLUMNS.blk), to: at(a.stats, COLUMNS.to),
      };
      if (line.dnp && a.reason) line.reason = a.reason;
      out[side].push(line);
    }
    // Starters, then the others who played, then those who did not; ESPN's order within each.
    out[side] = [...out[side].filter((l) => l.starter), ...out[side].filter((l) => !l.starter && !l.dnp), ...out[side].filter((l) => !l.starter && l.dnp)];
  }
  return out;
}
