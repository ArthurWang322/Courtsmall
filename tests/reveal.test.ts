// A game switched to (the card stack, 2026-10-24): its lines rise in one after another, top to bottom.
// The view is drawn again with every play while they do, so each redraw has to know whether the
// lines are still coming in: until the last one is in, and not after.

import { describe, expect, it } from 'vitest';
import { REVEAL_MS, REVEAL_STAGGER_MS, revealSpan } from '../src/ui/reveal.ts';

describe('lines coming in', () => {
  // The last line starts a step after the one above it: cut off sooner, it would jump into place.
  it('lasts until the last line is in', () => {
    expect(revealSpan(1)).toBe(REVEAL_MS);
    expect(revealSpan(12)).toBe(11 * REVEAL_STAGGER_MS + REVEAL_MS);
  });

  // No lines (a game with nothing to show yet): nothing to wait for.
  it('is over at once with no lines', () => {
    expect(revealSpan(0)).toBe(0);
  });
});
