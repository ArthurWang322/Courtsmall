// The card stack's main-window side (src/ui/stack.ts) with a fake host, page and bus: the order in which
// it places the cards' window and shows them, which a misplaced stack in the app comes down to.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameCard } from '../src/model/types.ts';

const sent: { type: string; payload: unknown }[] = [];
vi.mock('../src/ui/stack-bus.ts', () => ({
  bus: async () => ({ send: (_to: string, type: string, payload: unknown) => void sent.push({ type, payload }), on: () => {} }),
}));

/** Just enough of a page: elements that keep their listeners, so the strip's pointerenter can be fired. */
function fakeEl() {
  const on = new Map<string, () => void>();
  return { on, classList: { toggle: () => {}, contains: () => false }, addEventListener: (t: string, f: () => void) => void on.set(t, f) };
}
const edge = fakeEl();
vi.stubGlobal('window', {});
vi.stubGlobal('document', {
  documentElement: fakeEl(), getElementById: () => fakeEl(), createElement: () => edge,
  body: { append: () => {} }, addEventListener: () => {},
});
const { createStack } = await import('../src/ui/stack.ts');

const card = (id: string): GameCard => ({
  id, status: 'live', start: 0, period: 1, clock: 0, score: { away: 0, home: 0 },
  teams: { away: { id: 'a', abbr: 'A', name: 'a' }, home: { id: 'h', abbr: 'H', name: 'h' } },
});
const tick = () => new Promise((r) => setTimeout(r, 0));

function host(place: () => Promise<void>) {
  return {
    games: async () => [card('1'), card('2')], lastGames: () => [card('1'), card('2')], currentId: () => '1',
    favourites: () => [], lang: () => 'en', allowed: () => true, roomAbove: async () => 1000, cardHeight: () => 100,
    place, landing: () => {}, picked: () => {},
  };
}
const shows = () => sent.filter((m) => m.type === 'stack-show');

describe('card stack coming up', () => {
  beforeEach(() => { sent.length = 0; edge.on.clear(); });

  // Fixed for 0.5.1: the cards came up where the main window had been a moment before. They are
  // placed over where it is now first, and only then shown.
  it('places the cards over the main window before showing them', async () => {
    let placed: () => void = () => {};
    createStack(host(() => new Promise<void>((r) => { placed = r; })));
    edge.on.get('pointerenter')!();
    await tick();
    expect(shows()).toHaveLength(0);
    placed();
    await tick();
    expect(shows()).toHaveLength(1);
  });

  // Placing is best effort: a failed placing must not leave the user with no cards at all.
  it('still shows the cards when they could not be placed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    createStack(host(() => Promise.reject(new Error('no window'))));
    edge.on.get('pointerenter')!();
    await tick(); await tick();
    expect(shows()).toHaveLength(1);
  });

  // Closed while being placed (a panel, a size, the stats, the corner): the cards must not come up
  // afterwards over what closed them, with nothing left to take them down.
  it('does not show the cards when closed while they were being placed', async () => {
    let placed: () => void = () => {};
    const stack = createStack(host(() => new Promise<void>((r) => { placed = r; })));
    edge.on.get('pointerenter')!();
    await tick();
    stack.closeNow();
    placed();
    await tick();
    expect(shows()).toHaveLength(0);
    expect(sent.some((m) => m.type === 'stack-close')).toBe(true);
  });
});
