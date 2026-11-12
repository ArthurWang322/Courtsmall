// The standings panel's state (src/ui/standings-load.ts). The panel must show the answer to the latest ask only: an
// older, slower answer must not replace it, and asking again after a failure must work.

import { describe, expect, it } from 'vitest';
import { createStandingsLoader, type StandingsLoad } from '../src/ui/standings-load.ts';
import type { Standings } from '../src/model/types.ts';

const table = (season: string): Standings => ({ season, east: [], west: [] });

function setup() {
  const asks: { ok: (s: Standings) => void; fail: (e: Error) => void }[] = [];
  const seen: string[] = [];
  const show = (s: StandingsLoad) => (s.kind === 'ready' ? `ready ${s.standings.season}` : s.kind);
  const l = createStandingsLoader({
    fetch: () => new Promise((ok, fail) => asks.push({ ok, fail })),
    changed: (s) => seen.push(show(s)),
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { l, asks, seen, settle, show };
}

describe('standings state', () => {
  it('is loading until the answer, then shows it', async () => {
    const { l, asks, seen, settle, show } = setup();
    expect(show(l.state())).toBe('loading');
    const done = l.load();
    expect(show(l.state())).toBe('loading');
    asks[0]!.ok(table('2026-27'));
    await done;
    await settle();
    expect(seen).toEqual(['ready 2026-27']);
    expect(show(l.state())).toBe('ready 2026-27');
  });

  it('fails, and asks again when told to, without ever rejecting', async () => {
    const { l, asks, seen, show } = setup();
    const first = l.load();
    asks[0]!.fail(new Error('offline'));
    await expect(first).resolves.toBeUndefined();
    expect(show(l.state())).toBe('error');
    const again = l.load();
    expect(show(l.state())).toBe('loading');
    asks[1]!.ok(table('2026-27'));
    await again;
    expect(seen).toEqual(['error', 'ready 2026-27']);
  });

  // Opened, closed and opened again: the first, slower answer must not land over the second.
  it('keeps the answer to the latest ask when an older one comes after it', async () => {
    const { l, asks, seen, show } = setup();
    const a = l.load(), b = l.load();
    asks[1]!.ok(table('new'));
    await b;
    asks[0]!.ok(table('old'));
    await a;
    expect(seen).toEqual(['ready new']);
    expect(show(l.state())).toBe('ready new');
  });

  it('lets only the retry land when asked again while a request is out', async () => {
    const { l, asks, seen } = setup();
    const a = l.load();
    const b = l.load();
    asks[0]!.fail(new Error('late failure'));
    await a;
    asks[1]!.ok(table('2026-27'));
    await b;
    expect(seen).toEqual(['ready 2026-27']);
  });
});
