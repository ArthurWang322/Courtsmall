// The court view's promises: newest shots strongest, made and missed told apart at a glance, and
// a new shot's animation that survives the page redrawing mid-flight.

import { describe, expect, it } from 'vitest';
import { FLIGHT_MS, SHOT_ANIMATION_MS, shotMarks } from '../src/render/court.ts';
import type { Shot } from '../src/model/types.ts';

const colours = { away: 'c8102e', home: '008348' };
const shot = (id: string, made: boolean, side: 'away' | 'home' = 'away'): Shot => ({ id, side, made, points: 2, x: 20, y: 10 });

describe('shotMarks', () => {
  it('fills a made shot in its team colour and rings a miss', () => {
    const svg = shotMarks([shot('1', true), shot('2', false, 'home')], colours, new Map());
    expect(svg).toMatch(/class="mark made" [^>]*fill="#c8102e"/);
    expect(svg).toMatch(/class="mark miss" [^>]*fill="none" stroke="#008348"/);
  });

  it('draws older shots fainter', () => {
    const svg = shotMarks([shot('1', true), shot('2', true), shot('3', true)], colours, new Map());
    const op = [...svg.matchAll(/opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(op).toEqual([...op].sort((a, b) => a - b));
    expect(op.at(-1)).toBe(1);
  });

  // The page redraws on every play; a flight restarted by each redraw would fly forever.
  it("resumes a new shot's flight where it was after a redraw, and stops animating once it is done", () => {
    const at200 = shotMarks([shot('1', true)], colours, new Map([['1', 200]]));
    expect(at200).toContain('class="ball"');
    expect(at200).toContain('animation-delay:-200ms');
    expect(at200).toContain(`animation-delay:${FLIGHT_MS - 200}ms`);
    const done = shotMarks([shot('1', true)], colours, new Map([['1', SHOT_ANIMATION_MS]]));
    expect(done).not.toContain('class="ball"');
    expect(done).not.toContain('fresh');
  });

  it('keeps a heave from past half court inside the view', () => {
    const svg = shotMarks([{ ...shot('1', false), y: 66 }], colours, new Map());
    const cy = Number(svg.match(/cy="([\d.-]+)"/)![1]);
    expect(cy).toBeLessThan(32);
  });
});
