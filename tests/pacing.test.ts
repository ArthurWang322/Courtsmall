import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../src/data/espn/timeline.ts';
import { COMPACT_CAPS, duration, schedule } from '../src/data/replay/pacing.ts';
import { hasFixture, loadFixture } from './fixtures.ts';

const ID = '401810362';

describe.skipIf(!hasFixture(ID))('pace modes on 401810362', () => {
  const timeline = hasFixture(ID) ? buildTimeline(loadFixture(ID)) : [];

  it('real pace spans the game from first to last play', () => {
    expect(duration(schedule(timeline, { kind: 'real' }))).toBe(timeline.at(-1)!.t - timeline[0]!.t);
  });

  // Compact exists so a replay does not sit through a 15-minute halftime or a long review.
  it('compact pace keeps every play and no gap is longer than the in-period cap', () => {
    const slots = schedule(timeline, { kind: 'compact' });
    expect(slots.map((s) => s.index)).toEqual(timeline.map((_, i) => i));
    for (let i = 1; i < slots.length; i++) {
      const gap = slots[i]!.at - slots[i - 1]!.at;
      expect(gap).toBeGreaterThanOrEqual(COMPACT_CAPS.floor * 1000);
      expect(gap).toBeLessThanOrEqual(Math.max(COMPACT_CAPS.withinPeriod, COMPACT_CAPS.betweenPeriods) * 1000);
    }
    expect(duration(slots)).toBeLessThan(duration(schedule(timeline, { kind: 'real' })) / 2);
  });

  it('results pace keeps only baskets, period ends and the game end', () => {
    const slots = schedule(timeline, { kind: 'results' });
    const kinds = new Set(slots.flatMap((s) => timeline[s.index]!.events.map((e) => e.type)));
    expect([...kinds].every((k) => ['basket', 'periodStart', 'periodEnd', 'gameEnd'].includes(k))).toBe(true);
    expect(timeline[slots.at(-1)!.index]!.events).toContainEqual(expect.objectContaining({ type: 'gameEnd' }));
  });

  it('fixed pace is evenly spaced', () => {
    const slots = schedule(timeline, { kind: 'fixed', seconds: 2 });
    expect(slots.every((s, i) => s.at === i * 2000)).toBe(true);
  });
});
