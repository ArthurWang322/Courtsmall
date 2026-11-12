// The player card's state (src/ui/player-card.ts). A card must only ever show the player it is open for: an answer
// that comes after the card was closed, or after it was closed and opened again, must not land; a failure must be
// asked again, not remembered; and a player just read opens at once.

import { describe, expect, it } from 'vitest';
import { CARD_CACHE_MS, createCardController, type CardState, type CardWho } from '../src/ui/player-card.ts';
import type { PlayerCard } from '../src/model/types.ts';

const card = (gp: number): PlayerCard => ({ season: { gp }, games: [], stale: false });
const who = (id = '7'): CardWho => ({ id, name: 'A Player', team: { id: 'a', abbr: 'DEN', name: 'Nuggets' }, colour: '0e2240' });

/** A controller whose requests the test answers by hand, in any order. */
function setup() {
  let now = 0;
  const asks: { id: string; ok: (c: PlayerCard) => void; fail: (e: Error) => void }[] = [];
  const seen: (string | undefined)[] = [];
  const show = (s: CardState | undefined) => (s ? (s.load.kind === 'ready' ? `ready ${s.load.card.season?.gp}` : s.load.kind) : undefined);
  const c = createCardController({
    fetch: (id) => new Promise((ok, fail) => asks.push({ id, ok, fail })),
    now: () => now,
    changed: (s) => seen.push(show(s)),
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { c, asks, seen, settle, at: (t: number) => { now = t; } };
}

describe('player card state', () => {
  it('loads, then shows the card', async () => {
    const { c, asks, seen, settle } = setup();
    c.open(who());
    asks[0]!.ok(card(9));
    await settle();
    expect(seen).toEqual(['loading', 'ready 9']);
  });

  it('shows a failure, asks again on retry, and does not remember the failure', async () => {
    const { c, asks, seen, settle } = setup();
    c.open(who());
    asks[0]!.fail(new Error('offline'));
    await settle();
    c.retry();
    asks[1]!.ok(card(9));
    await settle();
    expect(seen).toEqual(['loading', 'error', 'loading', 'ready 9']);
    // A retry only from a failure.
    c.retry();
    expect(asks).toHaveLength(2);
    c.close();
    // The failure was not cached; the success was.
    const s2 = setup();
    s2.c.open(who());
    s2.asks[0]!.fail(new Error('offline'));
    await s2.settle();
    s2.c.close();
    s2.c.open(who());
    expect(s2.asks).toHaveLength(2);
  });

  it('opens a player read less than a minute ago at once, and asks again after', async () => {
    const { c, asks, seen, settle, at } = setup();
    c.open(who());
    asks[0]!.ok(card(9));
    await settle();
    c.close();
    at(CARD_CACHE_MS - 1);
    c.open(who());
    expect(asks).toHaveLength(1);
    expect(seen.at(-1)).toBe('ready 9');
    c.close();
    at(CARD_CACHE_MS + 1000);
    c.open(who());
    expect(asks).toHaveLength(2);
    expect(seen.at(-1)).toBe('loading');
  });

  it('ignores an answer that comes after the card was closed', async () => {
    const { c, asks, seen, settle } = setup();
    c.open(who());
    c.close();
    asks[0]!.ok(card(9));
    await settle();
    expect(seen).toEqual(['loading', undefined]);
    expect(c.state()).toBeUndefined();
  });

  // Closed and opened again for the same player: the first, slower answer must not replace the second.
  it('lets only the answer of the card open now land', async () => {
    const { c, asks, seen, settle } = setup();
    c.open(who());
    c.close();
    c.open(who());
    asks[1]!.ok(card(10));
    await settle();
    asks[0]!.ok(card(9));
    await settle();
    expect(seen).toEqual(['loading', undefined, 'loading', 'ready 10']);
  });

  it('does nothing on open while open, nor on close while closed', () => {
    const { c, asks, seen } = setup();
    c.close();
    c.open(who('1'));
    c.open(who('2'));
    expect(asks.map((a) => a.id)).toEqual(['1']);
    expect(c.state()?.who.id).toBe('1');
    c.close();
    c.close();
    expect(seen).toEqual(['loading', undefined]);
  });
});
