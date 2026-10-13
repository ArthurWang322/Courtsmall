// Copied from Basesmall's tests/replay.test.ts (same author, Apache-2.0); the player is league-free.
import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../src/data/espn/timeline.ts';
import { duration, schedule } from '../src/data/replay/pacing.ts';
import { EspnReplaySource } from '../src/data/replay/espn-replay-source.ts';
import { ReplayPlayer } from '../src/data/replay/player.ts';
import type { GameEvent, GameState } from '../src/model/types.ts';
import { FakeClock } from './fake-clock.ts';
import { hasFixture, loadFixture } from './fixtures.ts';

const ID = '401810362';
const flush = () => new Promise((r) => setTimeout(r, 0));

describe.skipIf(!hasFixture(ID))('ReplayPlayer on 401810362', () => {
  const timeline = hasFixture(ID) ? buildTimeline(loadFixture(ID)) : [];

  it('plays every entry in order and finishes exactly when the schedule says', () => {
    const clock = new FakeClock();
    const player = new ReplayPlayer(timeline, { clock });
    const seen: number[] = [];
    let ended = -1;
    player.onEntry((_, info) => seen.push(info.index));
    player.onEnd(() => { ended = clock.now(); });
    player.play();
    clock.advance(10 * 60 * 60 * 1000);
    expect(seen).toEqual(timeline.map((_, i) => i));
    expect(ended).toBe(duration(schedule(timeline, { kind: 'compact' })));
  });

  it('pause stops delivery and play resumes where it left off', () => {
    const clock = new FakeClock();
    const player = new ReplayPlayer(timeline, { clock, pace: { kind: 'fixed', seconds: 1 } });
    const seen: number[] = [];
    player.onEntry((_, info) => seen.push(info.index));
    player.play();
    clock.advance(10_500); // entries 0..10
    player.pause();
    clock.advance(60_000);
    expect(seen).toEqual([...Array(11).keys()]);
    player.play();
    clock.advance(1_000);
    expect(seen.at(-1)).toBe(11);
  });

  it('seek delivers a snap and continues from there', () => {
    const clock = new FakeClock();
    const player = new ReplayPlayer(timeline, { clock, pace: { kind: 'fixed', seconds: 1 } });
    const seen: [number, boolean][] = [];
    player.onEntry((_, info) => seen.push([info.index, info.snap]));
    player.play();
    player.seek(200);
    clock.advance(1_000);
    expect(seen).toEqual([[200, true], [201, false]]);
  });

  it('a seek from inside an entry callback does not schedule the next entry twice', () => {
    const clock = new FakeClock();
    const player = new ReplayPlayer(timeline, { clock, pace: { kind: 'fixed', seconds: 1 } });
    const seen: [number, boolean][] = [];
    let jumped = false;
    player.onEntry((_, info) => {
      seen.push([info.index, info.snap]);
      if (!jumped) { jumped = true; player.seek(100); } // what the app's --seek does
    });
    player.play();
    clock.advance(3_500);
    expect(seen).toEqual([[0, false], [100, true], [101, false], [102, false], [103, false]]);
  });

  it('a pause from inside an entry callback holds', () => {
    const clock = new FakeClock();
    const player = new ReplayPlayer(timeline, { clock, pace: { kind: 'fixed', seconds: 1 } });
    const seen: number[] = [];
    player.onEntry((_, info) => { seen.push(info.index); if (info.index === 2) player.pause(); });
    player.play();
    clock.advance(10_000);
    expect(seen).toEqual([0, 1, 2]);
    expect(player.playing).toBe(false);
  });

  it('speed 4x plays a fixed 4 s pace one entry per second', () => {
    const clock = new FakeClock();
    const player = new ReplayPlayer(timeline, { clock, pace: { kind: 'fixed', seconds: 4 }, speed: 4 });
    let count = 0;
    player.onEntry(() => count++);
    player.play();
    clock.advance(5_000);
    expect(count).toBe(6); // t = 0,1,2,3,4,5
  });
});

describe.skipIf(!hasFixture(ID))('EspnReplaySource', () => {
  it('delivers every event of the game and ends on the final state', async () => {
    const clock = new FakeClock();
    const src = new EspnReplaySource(async (id) => loadFixture(id), { clock, pace: { kind: 'fixed', seconds: 0 } });
    const events: GameEvent[] = [];
    let last: GameState | undefined;
    src.subscribe(ID, { onEvent: (e) => events.push(e), onState: (s) => { last = s; } });
    await flush();
    clock.advance(1);
    expect(events).toEqual(buildTimeline(loadFixture(ID)).flatMap((e) => e.events));
    expect(last!.status).toBe('final');
  });

  it('a snap after seeking updates state without replaying its events', async () => {
    const clock = new FakeClock();
    const src = new EspnReplaySource(async (id) => loadFixture(id), { clock, pace: { kind: 'fixed', seconds: 1 } });
    const events: GameEvent[] = [];
    src.subscribe(ID, { onEvent: (e) => events.push(e), onState: () => {} });
    await flush();
    const before = events.length;
    src.player(ID)!.seek(300);
    expect(events.length).toBe(before);
  });

  it('reports a load failure instead of throwing', async () => {
    const errors: unknown[] = [];
    new EspnReplaySource(async () => { throw new Error('offline'); }).subscribe(ID, { onEvent: () => {}, onState: () => {}, onError: (e) => errors.push(e) });
    await flush();
    expect(errors).toHaveLength(1);
  });
});
