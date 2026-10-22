// The card stack's geometry: where each card behind the main window sits, how much the window grows
// to show them, and how far a card drawn out rises. The numbers are the prototype the maintainer
// approved (2026-10-22); the window's growth is what makes the stack fit on the screen at all.

import { describe, expect, it } from 'vitest';
import { cardPlace, pickRise, stackRoom } from '../src/ui/stack-layout.ts';

describe('card stack layout', () => {
  it('places a card behind higher, smaller and dimmer the further back it is, and higher still under the pointer', () => {
    expect(cardPlace(0)).toEqual({ y: 0, scale: 1, brightness: 1 });
    const third = cardPlace(3);
    expect(third.y).toBe(-39);
    expect(third.scale).toBeCloseTo(0.958);
    expect(third.brightness).toBeCloseTo(0.85);
    expect(cardPlace(3, true).y).toBe(-69);
  });

  it('grows the window by what the stack needs, or what the card drawn out needs, whichever is more', () => {
    // Ten cards need 160 px, but a card drawn out of a 176 px bar needs 188 px to clear the front one.
    expect(stackRoom(10, 176, 2000)).toEqual({ room: 188, shown: 10 });
    // Fourteen cards need more than that.
    expect(stackRoom(14, 176, 2000)).toEqual({ room: 212, shown: 14 });
  });

  it('shows only the cards there is room for above the window, and none when there is no room', () => {
    expect(stackRoom(10, 176, 100)).toEqual({ room: 100, shown: 5 });
    expect(stackRoom(10, 176, 0)).toEqual({ room: 0, shown: 0 });
  });

  it('draws a card out until it clears the card in front', () => {
    expect(pickRise(2, 176)).toBe(-188);
    // A card already further up than that does not come down to be drawn out.
    expect(pickRise(20, 176)).toBe(cardPlace(20).y);
  });
});
