// A request the user waits on (src/ui/fetch-within.ts) must end: answered, refused, or failed once its time is up —
// also when the headers came and the body never does — and it must not be answered from the web view's cache.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithin } from '../src/ui/fetch-within.ts';

afterEach(() => { vi.useRealTimers(); });

/** A fetch that answers `body` (or never, for undefined), and fails when its signal aborts, as the real one does. */
function stub(status: number, body?: () => Promise<unknown>) {
  const calls: RequestInit[] = [];
  const f = ((_url: string, init: RequestInit) => {
    calls.push(init);
    return new Promise<Response>((ok, fail) => {
      init.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')));
      if (body) ok({ ok: status < 300, status, json: body } as unknown as Response);
    });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('fetchWithin', () => {
  it('answers the JSON, asked past the cache', async () => {
    const { f, calls } = stub(200, async () => ({ a: 1 }));
    await expect(fetchWithin(1000, f)('u')).resolves.toEqual({ a: 1 });
    expect(calls[0]!.cache).toBe('no-store');
  });

  it('fails on a status that is not 2xx', async () => {
    await expect(fetchWithin(1000, stub(404, async () => ({})).f)('u')).rejects.toThrow('404 u');
  });

  it('fails once the time is up when nothing answers', async () => {
    vi.useFakeTimers();
    const p = fetchWithin(10_000, stub(200).f)('u');
    const seen = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(9_999);
    await vi.advanceTimersByTimeAsync(1);
    await seen;
  });

  it('fails once the time is up when the body never comes', async () => {
    vi.useFakeTimers();
    const p = fetchWithin(10_000, stub(200, () => new Promise(() => {})).f)('u');
    const seen = expect(p).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await seen;
  });

  // An answer in time must not be cut off later by a timer left running.
  it('stops its timer once answered', async () => {
    vi.useFakeTimers();
    const { f, calls } = stub(200, async () => 1);
    await fetchWithin(10_000, f)('u');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls[0]!.signal!.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
