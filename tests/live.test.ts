// The live source against a fake ESPN that releases a recorded game a few plays at a time.
// What matters: joining mid-game does not replay the past, every new event arrives exactly once,
// quiet polls stay small, and late insertions and corrections are picked up without replaying.

import { describe, expect, it } from 'vitest';
import { EspnLiveSource, mergeTail, type FetchJson } from '../src/data/espn/live-source.ts';
import { buildTimeline } from '../src/data/espn/timeline.ts';
import type { CorePlay } from '../src/data/espn/feed-types.ts';
import type { GameEvent, GameState } from '../src/model/types.ts';
import { FakeClock } from './fake-clock.ts';
import { hasFixture, loadFixture } from './fixtures.ts';

const ID = '401810362'; // overtime, 467 plays
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

/** Serves the first `shown` plays of the fixture the way ESPN's endpoints do. */
function fakeEspn(plays: CorePlay[], summary: unknown) {
  const server = { shown: 0, plays, urls: [] as string[], inFlight: 0, maxInFlight: 0, fail: 0 };
  const fetchJson: FetchJson = async (url) => {
    server.urls.push(url);
    server.inFlight++;
    server.maxInFlight = Math.max(server.maxInFlight, server.inFlight);
    await Promise.resolve();
    server.inFlight--;
    if (server.fail > 0) { server.fail--; throw new Error('503'); }
    const list = server.plays.slice(0, server.shown);
    if (url.includes('/summary?')) return summary;
    if (url.endsWith('/status')) {
      const last = list.at(-1);
      const name = !last ? 'STATUS_SCHEDULED' : last.type.id === '402' ? 'STATUS_FINAL' : last.type.id === '412' ? 'STATUS_END_PERIOD' : 'STATUS_IN_PROGRESS';
      return { clock: last?.clock.value ?? 720, period: last?.period.number ?? 0, type: { name } };
    }
    const m = url.match(/plays\?limit=(\d+)&page=(\d+)/)!;
    const limit = Number(m[1]), page = Number(m[2]);
    return { count: list.length, pageIndex: page, pageSize: limit, pageCount: Math.ceil(list.length / limit), items: list.slice((page - 1) * limit, page * limit) };
  };
  return { server, fetchJson };
}

describe('mergeTail', () => {
  const p = (id: string) => ({ id }) as CorePlay;
  it('replaces the tail and drops an earlier copy of a play that shifted into the window', () => {
    // Position 3 onward was fetched again; "c" moved there because a play was inserted before it.
    expect(mergeTail([p('a'), p('b'), p('c'), p('d')], [p('c'), p('d'), p('e')], 3).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe.skipIf(!hasFixture(ID))('EspnLiveSource on 401810362', () => {
  const feed = hasFixture(ID) ? loadFixture(ID) : undefined!;
  const full = feed ? buildTimeline(feed) : [];

  function run(opts: { joinAt: number; step: number; fullRefreshMs?: number }) {
    const { server, fetchJson } = fakeEspn([...feed.plays], feed.summary);
    server.shown = opts.joinAt;
    const clock = new FakeClock();
    const events: GameEvent[] = [];
    const states: GameState[] = [];
    const source = new EspnLiveSource(fetchJson, { clock, random: () => 0.5, fullRefreshMs: opts.fullRefreshMs ?? 120_000 });
    source.subscribe(ID, { onEvent: (e) => events.push(e), onState: (s) => states.push(s) });
    const poll = async () => { clock.advance(10_000); await flush(); };
    return { server, clock, events, states, source, poll };
  }

  it('joining mid-game shows the current state and replays nothing', async () => {
    const r = run({ joinAt: 200, step: 0 });
    await r.poll();
    expect(r.events).toEqual([]);
    expect(r.states.at(-1)!.score).toEqual(full[199]!.state.score);
  });

  it('delivers every later event exactly once, in order, and stops at the final', async () => {
    const r = run({ joinAt: 200, step: 3 });
    await flush();
    while (!r.source.status(ID)!.stopped) { r.server.shown = Math.min(feed.plays.length, r.server.shown + 3); await r.poll(); }
    const expected = full.slice(200).flatMap((e) => e.events);
    expect(r.events).toEqual(expected);
    expect(r.states.at(-1)!.status).toBe('final');
    expect(r.states.at(-1)!.score).toEqual(full.at(-1)!.state.score);
    expect(r.server.maxInFlight).toBe(1);
  });

  it('a quiet poll is just the status and the play count', async () => {
    const r = run({ joinAt: 200, step: 0 });
    await flush();
    const before = r.server.urls.length;
    await r.poll();
    expect(r.server.urls.slice(before).map((u) => u.replace(/^.*competitions\/\d+/, ''))).toEqual(['/status', '/plays?limit=1&page=999999']);
  });

  it('a play inserted before the tail window arrives with the next full refresh, as a correction', async () => {
    const r = run({ joinAt: 300, step: 0, fullRefreshMs: 60_000 });
    await flush();
    // ESPN inserts a play at position 100 and corrects the score of nothing else.
    const late = { ...feed.plays[100]!, id: 'late', type: { id: '584', text: 'Substitution' } };
    r.server.plays.splice(100, 0, late);
    r.server.shown++;
    for (let i = 0; i < 6; i++) await r.poll(); // 60 s: one full refresh
    expect(r.source.status(ID)!.corrections).toBeGreaterThan(0);
    expect(r.events).toEqual([]);
  });

  // Seen live on 401898721: a made free throw at 8:53 was published 50 s after two substitutions at
  // 8:53, yet listed before them. Same moment of the game, so it is news, not a correction.
  it('a basket listed before plays at the same game clock is still delivered', async () => {
    const j = feed.plays.findIndex((p, i) => i > 250 && p.scoringPlay && p.scoreValue === 1
      && feed.plays[i + 1]!.clock.value === p.clock.value && feed.plays[i + 1]!.period.number === p.period.number);
    const ft = feed.plays[j]!;
    const withheld = feed.plays.filter((_, i) => i !== j);
    const r = run({ joinAt: j, step: 0 });
    r.server.plays = withheld;
    await flush();
    r.server.shown = j + 1; // the play after the free throw, at the same clock, arrives first
    await r.poll();
    r.server.plays = [...feed.plays];
    r.server.shown = j + 2; // now the free throw, listed before it
    await r.poll();
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'basket', basket: expect.objectContaining({ points: 1, clock: ft.clock.value }) }));
  });

  it('backs off after failures, then returns to the normal pace', async () => {
    const r = run({ joinAt: 200, step: 0 });
    await flush();
    r.server.fail = 2;
    await r.poll();
    expect(r.source.status(ID)!.connected).toBe(false);
    expect(r.clock.nextIn).toBe(20_000); // 10 s × 2^1, jitter at its midpoint
    r.clock.advance(20_000); await flush();
    expect(r.clock.nextIn).toBe(40_000); // 10 s × 2^2
    r.clock.advance(40_000); await flush();
    expect(r.source.status(ID)!.connected).toBe(true);
    expect(r.clock.nextIn).toBe(10_000);
  });
});
