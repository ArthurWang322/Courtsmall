// Switching tabs (src/ui/tab-slide.ts): the underline has to start where the old one was, or it jumps
// before it glides; and the content comes in from the side of the tab picked, so the motion says which way
// along the row you went (the maintainer asked for it, 2026-11-12).

import { describe, expect, it } from 'vitest';
import { tabMove } from '../src/ui/tab-slide.ts';

describe('tabMove', () => {
  it('starts the underline on the old tab, at its width', () => {
    // BOS (wide, with a star) to TOR on its right.
    expect(tabMove({ left: 20, width: 60 }, { left: 100, width: 40 })).toEqual({ dx: -80, scale: 1.5, from: 'right' });
  });

  it('brings the content in from the side of the tab picked', () => {
    expect(tabMove({ left: 100, width: 40 }, { left: 20, width: 60 })?.from).toBe('left');
    expect(tabMove({ left: 20, width: 40 }, { left: 90, width: 40 })?.from).toBe('right');
  });

  // Clicking the tab already on redraws in place: no glide from nowhere.
  it('does nothing for the same tab, or a tab with no width', () => {
    expect(tabMove({ left: 20, width: 40 }, { left: 20, width: 40 })).toBeUndefined();
    expect(tabMove({ left: 20, width: 40 }, { left: 90, width: 0 })).toBeUndefined();
  });
});
