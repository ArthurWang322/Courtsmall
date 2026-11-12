// A JSON request that fails if it has not answered in time, for requests the user waits on (the player card, the
// standings): a stalled one becomes a failure they can ask again. Not cached by the web view (ESPN's
// `stale-while-revalidate` would answer with an old copy), and not queued behind the main window's polls.

import type { FetchJson } from '../data/espn/fetch.ts';

/** The timeout covers the body too: a request that answers its headers and then stalls fails as well. */
export function fetchWithin(ms: number, doFetch: typeof fetch = fetch): FetchJson {
  return async (url) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await doFetch(url, { cache: 'no-store', signal: ctl.signal });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await Promise.race([r.json() as Promise<unknown>, aborted(ctl.signal)]);
    } finally { clearTimeout(timer); }
  };
}

/** Rejects once `signal` aborts: a body read that the abort itself would not end (as a stub's) still fails. */
const aborted = (signal: AbortSignal) => new Promise<never>((_, fail) =>
  signal.addEventListener('abort', () => fail(new Error('timed out')), { once: true }));
