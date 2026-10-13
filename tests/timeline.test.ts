// M1 acceptance: replaying a recorded game through the adapter reproduces what actually
// happened, checked against ESPN's own box score rather than numbers we computed ourselves.

import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../src/data/espn/timeline.ts';
import type { CorePlay, GameFeed } from '../src/data/espn/feed-types.ts';
import type { Side } from '../src/model/types.ts';
import { FIXTURES, hasFixture, loadFixture } from './fixtures.ts';

const SIDES: Side[] = ['away', 'home'];

for (const fx of FIXTURES) {
  describe.skipIf(!hasFixture(fx.id))(`${fx.id}: ${fx.note}`, () => {
    const feed = hasFixture(fx.id) ? loadFixture(fx.id) : undefined;
    const timeline = feed ? buildTimeline(feed) : [];
    const final = timeline.at(-1)?.state;
    const competitors = feed?.summary.header.competitions[0]!.competitors ?? [];
    const official = (s: Side) => competitors.find((c) => c.homeAway === s)!;

    it('ends with gameEnd and a final status', () => {
      expect(timeline.at(-1)!.events).toContainEqual(expect.objectContaining({ type: 'gameEnd' }));
      expect(final!.status).toBe('final');
    });

    it('the final score matches the official score', () => {
      for (const s of SIDES) expect({ side: s, score: final!.score[s] }).toEqual({ side: s, score: Number(official(s).score) });
    });

    // Overtime periods count too: a glance at "OT" must show the overtime's own points.
    it('points per period, overtime included, match the official line score', () => {
      for (const s of SIDES)
        expect({ side: s, periods: final!.periodScores[s] })
          .toEqual({ side: s, periods: (official(s).linescores ?? []).map((l) => Number(l.displayValue)) });
    });

    // "Last basket: who, how many" names the right player only if every basket goes to its shooter.
    it("each player's points from basket events match the box score", () => {
      const mine = new Map<string, number>();
      for (const e of timeline) for (const ev of e.events)
        if (ev.type === 'basket' && ev.basket.player) mine.set(ev.basket.player.id, (mine.get(ev.basket.player.id) ?? 0) + ev.basket.points);
      const box = new Map<string, number>();
      for (const team of feed!.summary.boxscore.players ?? []) for (const g of team.statistics) {
        const col = g.names.indexOf('PTS');
        for (const a of g.athletes) { const pts = Number(a.stats[col]); if (pts > 0) box.set(a.athlete.id, pts); }
      }
      expect(Object.fromEntries(mine)).toEqual(Object.fromEntries(box));
    });

    // The bar names who fouled, turned it over or rebounded; per player, those must add up to the
    // box score's PF, TO, OREB and DREB. Technical fouls are not personal fouls, so they do not count.
    it("each player's fouls, turnovers and rebounds from events match the box score", () => {
      const mine: Record<string, Record<string, number>> = { PF: {}, TO: {}, OREB: {}, DREB: {} };
      const add = (col: string, id?: string) => { if (id) mine[col]![id] = (mine[col]![id] ?? 0) + 1; };
      for (const e of timeline) for (const ev of e.events) {
        if (ev.type === 'foul' && ev.kind !== 'technical') add('PF', ev.player?.id);
        if (ev.type === 'turnover') add('TO', ev.player?.id);
        if (ev.type === 'rebound') add(ev.offensive ? 'OREB' : 'DREB', ev.player?.id);
      }
      const box: Record<string, Record<string, number>> = { PF: {}, TO: {}, OREB: {}, DREB: {} };
      for (const team of feed!.summary.boxscore.players ?? []) for (const g of team.statistics)
        for (const col of Object.keys(box)) {
          const i = g.names.indexOf(col);
          for (const a of g.athletes) { const n = Number(a.stats[i]); if (n > 0) box[col]![a.athlete.id] = n; }
        }
      for (const col of Object.keys(box)) expect({ col, counts: mine[col] }).toEqual({ col, counts: box[col] });
    });

    // "Who missed" is only right if every shot, made or missed, lands on its shooter: per player,
    // baskets plus misses must give the box score's attempts, and blocked misses its blocks.
    // Last-second heaves are not attempts in the box score.
    it("each player's shot attempts and blocks from events match the box score", () => {
      const cols = ['FGA', '3PA', 'FTA', 'BLK'];
      const mine: Record<string, Record<string, number>> = Object.fromEntries(cols.map((c) => [c, {}]));
      const add = (col: string, id?: string) => { if (id) mine[col]![id] = (mine[col]![id] ?? 0) + 1; };
      for (const e of timeline) for (const ev of e.events) {
        const shot = ev.type === 'basket' ? { points: ev.basket.points, id: ev.basket.player?.id } : ev.type === 'miss' && !ev.heave ? { points: ev.points, id: ev.player?.id } : undefined;
        if (shot) { add(shot.points === 1 ? 'FTA' : 'FGA', shot.id); if (shot.points === 3) add('3PA', shot.id); }
        if (ev.type === 'miss') add('BLK', ev.blockedBy?.id);
      }
      const box: Record<string, Record<string, number>> = Object.fromEntries(cols.map((c) => [c, {}]));
      for (const team of feed!.summary.boxscore.players ?? []) for (const g of team.statistics) for (const a of g.athletes) {
        const stat = (name: string) => a.stats[g.names.indexOf(name)] ?? '';
        const attempts = (name: string) => Number(stat(name).split('-')[1]);
        const put = (col: string, n: number) => { if (n > 0) box[col]![a.athlete.id] = n; };
        put('FGA', attempts('FG')); put('3PA', attempts('3PT')); put('FTA', attempts('FT')); put('BLK', Number(stat('BLK')));
      }
      for (const col of cols) expect({ col, counts: mine[col] }).toEqual({ col, counts: box[col] });
    });

    it('every basket event agrees with the score change it came from', () => {
      let prev = { away: 0, home: 0 };
      for (const e of timeline) {
        for (const ev of e.events) if (ev.type === 'basket') expect(ev.score[ev.basket.side] - prev[ev.basket.side]).toBe(ev.basket.points);
        prev = e.state.score;
      }
    });
  });
}

// A run is "unanswered points": any basket by the other side ends it, even one free throw.
describe('run', () => {
  const team = (id: string) => ({ $ref: `http://x/teams/${id}?lang=en` });
  let n = 0;
  const play = (away: number, home: number, by?: string): CorePlay => ({
    id: String(++n), sequenceNumber: String(n), type: { id: '92', text: 'Jump Shot' }, awayScore: away, homeScore: home,
    period: { number: 1 }, clock: { value: 600 - n, displayValue: '' }, scoringPlay: !!by, scoreValue: 0,
    wallclock: new Date(n * 1000).toISOString(), ...(by ? { team: team(by), possessionTeam: team(by) } : {}),
  });
  const feed = (plays: CorePlay[]): GameFeed => ({
    summary: {
      header: { id: '1', season: { year: 2026, type: 2 }, competitions: [{ status: { type: { name: 'STATUS_IN_PROGRESS', completed: false } }, competitors: [
        { homeAway: 'away', team: { id: 'A', abbreviation: 'AAA', displayName: 'Away' } },
        { homeAway: 'home', team: { id: 'H', abbreviation: 'HHH', displayName: 'Home' } },
      ] }] },
      boxscore: {},
    },
    plays,
  });

  it('adds up while one side keeps scoring, through misses in between', () => {
    const t = buildTimeline(feed([play(3, 0, 'A'), play(3, 0), play(5, 0, 'A'), play(8, 0, 'A'), play(10, 0, 'A')]));
    expect(t.at(-1)!.state.run).toEqual({ side: 'away', points: 10 });
  });

  it("restarts with the other side's first point", () => {
    const t = buildTimeline(feed([play(10, 0, 'A'), play(10, 1, 'H')]));
    expect(t.at(-1)!.state.run).toEqual({ side: 'home', points: 1 });
  });

  // Seen in real games (docs/PROBE_REPORT.md §7): the score drops on a timeout and comes back on a
  // turnover. Crediting that turnover as a basket would name the wrong player and break the run.
  it('a score that comes back on a non-scoring play is a correction, not a basket', () => {
    const t = buildTimeline(feed([play(0, 2, 'H'), play(2, 2, 'A'), play(2, 0), play(2, 2)]));
    expect(t.at(-1)!.state.score).toEqual({ away: 2, home: 2 });
    expect(t.at(-1)!.events).toEqual([]);
    expect(t.at(-1)!.state.run).toEqual({ side: 'away', points: 2 });
  });

  // Teams substitute during a timeout; "Timeout" must stay up until play resumes.
  it('a timeout lasts through the substitutions made during it, and ends with the next play', () => {
    const typed = (text: string, away: number, home: number): CorePlay => ({ ...play(away, home), type: { id: '0', text } });
    const t = buildTimeline(feed([typed('Full Timeout', 0, 0), typed('Substitution', 0, 0), typed('Substitution', 0, 0), typed('Jump Shot', 0, 0)]));
    expect(t.map((e) => e.state.stoppage)).toEqual(['timeout', 'timeout', 'timeout', undefined]);
  });
});

