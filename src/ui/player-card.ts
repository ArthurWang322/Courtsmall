// The player card's state in the players window (src/ui/players.ts draws it): which player is open, whether his
// card is loading, failed or here, and a short-lived cache of the cards already read. No DOM and no timers, so the
// order of opening, closing and answers arriving can be tested.

import type { PlayerCard, TeamRef } from '../model/types.ts';

/** A card read is reused this long: reopening a player costs nothing, and a game just finished shows up soon. */
export const CARD_CACHE_MS = 60_000;
/** How long the card takes to leave (app.css `.pcard-layer.leaving`). */
export const CARD_LEAVE_MS = 180;
/** A request for a card that has not answered in this long has failed (src/ui/fetch-within.ts). */
export const CARD_TIMEOUT_MS = 10_000;

export type CardLoad = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; card: PlayerCard };
/** Who the card is for, from the box score: the colour is his side's in this game, "rrggbb". */
export interface CardWho { id: string; name: string; headshot?: string; team: TeamRef; colour: string }
export interface CardState { who: CardWho; load: CardLoad }

export interface CardController {
  open(who: CardWho): void;
  close(): void;
  retry(): void;
  state(): CardState | undefined;
}

export function createCardController(deps: {
  fetch: (id: string) => Promise<PlayerCard>;
  now: () => number;
  /** After every change; undefined once closed. */
  changed: (state: CardState | undefined) => void;
}): CardController {
  let current: CardState | undefined;
  /** Bumped on every open, close and retry: an answer started under an older one is not this card's any more. */
  let token = 0;
  const cache = new Map<string, { card: PlayerCard; at: number }>();

  const set = (next: CardState | undefined) => { current = next; deps.changed(next); };

  function load(who: CardWho): void {
    const mine = ++token;
    set({ who, load: { kind: 'loading' } });
    deps.fetch(who.id).then(
      (card) => {
        if (mine !== token) return;
        cache.set(who.id, { card, at: deps.now() });
        set({ who, load: { kind: 'ready', card } });
      },
      // A failure is not cached: the next open asks again.
      () => { if (mine === token) set({ who, load: { kind: 'error' } }); },
    );
  }

  return {
    open(who) {
      if (current) return;
      const hit = cache.get(who.id);
      if (hit && deps.now() - hit.at < CARD_CACHE_MS) { token++; set({ who, load: { kind: 'ready', card: hit.card } }); return; }
      load(who);
    },
    close() {
      if (!current) return;
      token++;
      set(undefined);
    },
    retry() {
      if (current?.load.kind === 'error') load(current.who);
    },
    state: () => current,
  };
}
