// A game's box score, from the summary: each side's players and their lines, starters first, as
// ESPN lists them. The official count, so the players' points add up to the score.

import type { BoxLine, MadeOf, Side, TeamStats } from '../../model/types.ts';
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

/** Each side's team stats from the box score, or undefined for a side ESPN gives none for. */
export function teamStats(summary: Summary): Partial<Record<Side, TeamStats>> {
  const out: Partial<Record<Side, TeamStats>> = {};
  const sideOf = new Map(summary.header.competitions[0]!.competitors.map((c) => [c.team.id, c.homeAway]));
  for (const team of summary.boxscore.teams ?? []) {
    const side = sideOf.get(team.team.id);
    if (!side) continue;
    const v = (name: string) => team.statistics.find((x) => x.name === name)?.displayValue ?? '';
    const n = (name: string) => Number(v(name)) || 0;
    const of = (name: string): MadeOf => { const [m, a] = v(name).split('-').map(Number); return { made: m || 0, att: a || 0 }; };
    const fg = of('fieldGoalsMade-fieldGoalsAttempted'), three = of('threePointFieldGoalsMade-threePointFieldGoalsAttempted');
    out[side] = {
      fg, three, two: { made: fg.made - three.made, att: fg.att - three.att }, ft: of('freeThrowsMade-freeThrowsAttempted'),
      reb: n('totalRebounds'), oreb: n('offensiveRebounds'), dreb: n('defensiveRebounds'),
      ast: n('assists'), stl: n('steals'), blk: n('blocks'), to: n('totalTurnovers'), fouls: n('fouls'),
      fastBreak: n('fastBreakPoints'), paint: n('pointsInPaint'), largestLead: n('largestLead'),
    };
  }
  return out;
}

