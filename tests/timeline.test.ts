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
});
