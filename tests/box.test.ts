// The players' panel reads the box score. It is only right if every point is on a player: per side,
// the players' points must add up to the official score, starters first, those who did not play last.

import { describe, expect, it } from 'vitest';
import { boxScore, teamStats } from '../src/data/espn/box.ts';
import { FIXTURES, hasFixture, loadFixture } from './fixtures.ts';

for (const fx of FIXTURES) {
  describe.skipIf(!hasFixture(fx.id))(`${fx.id}: ${fx.note}`, () => {
    const feed = hasFixture(fx.id) ? loadFixture(fx.id) : undefined;
    const box = feed ? boxScore(feed.summary) : { away: [], home: [] };

    it("each side's players' points add up to its official score", () => {
      for (const c of feed!.summary.header.competitions[0]!.competitors)
        expect({ side: c.homeAway, pts: box[c.homeAway].reduce((n, l) => n + l.pts, 0) }).toEqual({ side: c.homeAway, pts: Number(c.score) });
    });

    // Two-pointers are field goals less threes, worked out here: they are only right if, with the
    // threes and free throws, they add up to the official score.
    it("each side's twos, threes and free throws add up to its official score", () => {
      const teams = teamStats(feed!.summary);
      for (const c of feed!.summary.header.competitions[0]!.competitors) {
        const t = teams[c.homeAway]!;
        expect({ side: c.homeAway, pts: 2 * t.two.made + 3 * t.three.made + t.ft.made }).toEqual({ side: c.homeAway, pts: Number(c.score) });
        expect(t.reb).toBe(t.oreb + t.dreb);
      }
    });

    it('lists five starters first and those who did not play last', () => {
      for (const side of ['away', 'home'] as const) {
        const lines = box[side];
        expect(lines.slice(0, 5).every((l) => l.starter)).toBe(true);
        const firstDnp = lines.findIndex((l) => l.dnp);
        if (firstDnp >= 0) expect(lines.slice(firstDnp).every((l) => l.dnp && l.min === 0)).toBe(true);
      }
    });
  });
}
