// The standings panel's state in the main window (src/ui/main.ts draws it): loading, failed or here. No DOM and no
// timers, so the order of asking, asking again and answers arriving can be tested.

import type { Standings } from '../model/types.ts';

export type StandingsLoad = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; standings: Standings };

export interface StandingsLoader {
  /** Asks again: the state is loading at once (without `changed`); the answer of this call, unless another load()
   *  came after it, makes it ready or failed and calls `changed`. Never rejects. */
  load(): Promise<void>;
  state(): StandingsLoad;
}

export function createStandingsLoader(deps: {
  fetch: () => Promise<Standings>;
  changed: (state: StandingsLoad) => void;
}): StandingsLoader {
  let current: StandingsLoad = { kind: 'loading' };
  /** Bumped on every load: an answer to an older one is not this panel's any more. */
  let token = 0;
  const settle = (mine: number, next: StandingsLoad) => {
    if (mine !== token) return;
    current = next;
    deps.changed(next);
  };
  return {
    async load() {
      const mine = ++token;
      current = { kind: 'loading' };
      try { settle(mine, { kind: 'ready', standings: await deps.fetch() }); } catch { settle(mine, { kind: 'error' }); }
    },
    state: () => current,
  };
}
