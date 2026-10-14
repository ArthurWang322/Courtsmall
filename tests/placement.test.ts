// The window lives in the screen's bottom-right corner: whatever it shows, the whole group (the
// stats and the line score included) must fit on the screen, against the corner.

import { describe, expect, it } from 'vitest';
import { between, CORNER_MARGIN, cornerRect, ease, sideRects } from '../src/ui/placement.ts';

// A 1440x900 screen with a 70-high Dock at the bottom: the area windows may use.
const area = { x: 0, y: 0, w: 1440, h: 830 };
const right = (r: { x: number; w: number }) => r.x + r.w;
const bottom = (r: { y: number; h: number }) => r.y + r.h;

describe('cornerRect', () => {
  it('puts the window alone against the bottom-right corner, above the Dock', () => {
    const r = cornerRect(area, { w: 360, h: 176 }, false);
    expect(right(r)).toBe(area.w - CORNER_MARGIN);
    expect(bottom(r)).toBe(area.h - CORNER_MARGIN);
  });

  // Opening the stats used to push them off the right edge and the line score below the screen.
  it('moves the window up and left so the stats and the line score fit too', () => {
    const r = cornerRect(area, { w: 360, h: 300 }, true);
    const { players, linescore } = sideRects(r);
    expect(right(players)).toBe(area.w - CORNER_MARGIN);
    expect(bottom(linescore)).toBe(area.h - CORNER_MARGIN);
    expect(bottom(players)).toBe(bottom(linescore));
  });

  it('works on a second screen, wherever it is', () => {
    const second = { x: -1920, y: 200, w: 1920, h: 1040 };
    const r = cornerRect(second, { w: 360, h: 176 }, false);
    expect(right(r)).toBe(-CORNER_MARGIN);
    expect(bottom(r)).toBe(1240 - CORNER_MARGIN);
  });
});

describe('glide', () => {
  it('starts where the window is and ends exactly at the target', () => {
    const a = { x: 0, y: 0, w: 360, h: 176 }, b = { x: 100, y: -124, w: 360, h: 300 };
    expect(between(a, b, ease(0))).toEqual(a);
    expect(between(a, b, ease(1))).toEqual(b);
    expect(ease(0.5)).toBeGreaterThan(0.5);
  });
});
