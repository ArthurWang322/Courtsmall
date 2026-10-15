// The court view's promises: it reads as 3D (the far end smaller, the rim up in the air), a shot
// looks like a shot (an arc over the rim, longer from three), a make drops through and a miss
// bounces out onto the court, and the floor keeps the latest shots, newest strongest.

import { describe, expect, it } from 'vitest';
import { AFTER_SECONDS, ballAt, BOUNCE_FEET, courtLines, flightSeconds, flightSvg, LANE_LINE_DARK, LANE_LINE_LIGHT, laneLine, project, woodLine, RIM_Z, SCORE_SECONDS, shotMarks, spotOf, WINDUP_SECONDS } from '../src/render/court.ts';
import { BASKET, type Shot } from '../src/model/types.ts';

const colours = { away: 'c8102e', home: '008348' };
const shot = (o: Partial<Shot> = {}): Shot => ({ id: '4018103627', side: 'away', made: true, points: 3, x: 25, y: 25, ...o });
const always = () => true;

describe('camera', () => {
  it('draws the far baseline narrower than the near end: perspective, not a flat chart', () => {
    const far = project({ x: 50, y: -4, z: 0 }).x - project({ x: 0, y: -4, z: 0 }).x;
    const near = project({ x: 50, y: 30, z: 0 }).x - project({ x: 0, y: 30, z: 0 }).x;
    expect(near).toBeGreaterThan(far * 1.2);
  });

  it('puts the basket at the far end, up in the air above its spot on the floor', () => {
    const rim = project({ x: BASKET.x, y: BASKET.y, z: RIM_Z });
    const floor = project({ x: BASKET.x, y: BASKET.y, z: 0 });
    const shooter = project({ x: 25, y: 25, z: 0 });
    expect(rim.y).toBeLessThan(floor.y);
    expect(floor.y).toBeLessThan(shooter.y);
  });
});

describe('ballAt', () => {
  it('holds the ball at the release while the shooter sets, then arcs above the rim', () => {
    const s = shot();
    expect(ballAt(s, 0).phase).toBe('windup');
    const T = flightSeconds(s);
    const zs = Array.from({ length: 20 }, (_, i) => ballAt(s, WINDUP_SECONDS + (T * i) / 20).ball!.z);
    expect(Math.max(...zs)).toBeGreaterThan(RIM_Z + 3);
    const atRim = ballAt(s, WINDUP_SECONDS + T * 0.999).ball!;
    expect(Math.hypot(atRim.x - BASKET.x, atRim.y - BASKET.y)).toBeLessThan(0.2);
    expect(atRim.z).toBeCloseTo(RIM_Z, 0);
  });

  it('flies longer and higher from three than at the rim', () => {
    const three = shot(), layup = shot({ points: 2, y: 4 });
    expect(flightSeconds(three)).toBeGreaterThan(flightSeconds(layup));
    const peak = (s: Shot) => Math.max(...Array.from({ length: 20 }, (_, i) => ballAt(s, WINDUP_SECONDS + (flightSeconds(s) * i) / 20).ball!.z));
    expect(peak(three)).toBeGreaterThan(peak(layup));
  });

  it('drops a make through the net, under the rim', () => {
    const s = shot();
    const end = WINDUP_SECONDS + flightSeconds(s);
    const b = ballAt(s, end + AFTER_SECONDS.made * 0.9);
    expect(b.phase).toBe('through');
    expect(b.ball!.z).toBeLessThan(RIM_Z - 3);
    expect([b.ball!.x, b.ball!.y]).toEqual([BASKET.x, BASKET.y]);
    // Then the points rise from the spot, and only after that is the shot over.
    expect(ballAt(s, end + AFTER_SECONDS.made + 0.1).phase).toBe('score');
    expect(ballAt(s, end + AFTER_SECONDS.made + SCORE_SECONDS).phase).toBe('done');
  });

  // A make should feel like one: the points it was worth, in the team's colour, a ring on the floor.
  it('shows the points rising in the team colour after a make, and nothing of the kind after a miss', () => {
    const made = shot(), miss = shot({ made: false });
    const at = (s: Shot) => WINDUP_SECONDS + flightSeconds(s) + AFTER_SECONDS.made + SCORE_SECONDS / 3;
    const svg = flightSvg(made, at(made), 'c8102e');
    expect(svg).toMatch(/<text class="points"[^>]*fill="#c8102e"[^>]*>\+3<\/text>/);
    expect(svg).toContain('class="burst"');
    expect(flightSvg(miss, at(miss), 'c8102e')).not.toContain('points');
  });

  // A miss that flew back into the backboard would look wrong; it comes off toward the court.
  it('bounces a miss off the rim onto the court, the same way every time', () => {
    const s = shot({ made: false });
    const late = WINDUP_SECONDS + flightSeconds(s) + AFTER_SECONDS.miss * 0.98;
    const b = ballAt(s, late).ball!;
    expect(b.y).toBeGreaterThan(BASKET.y);
    expect(Math.hypot(b.x - BASKET.x, b.y - BASKET.y)).toBeGreaterThan(BOUNCE_FEET * 0.9);
    expect(b.z).toBeLessThan(1);
    expect(ballAt(s, late)).toEqual(ballAt({ ...s }, late));
  });
});

describe('shotMarks', () => {
  it('fills a made shot in its team colour and rings a miss', () => {
    const svg = shotMarks([shot({ id: '1' }), shot({ id: '2', made: false, side: 'home' })], colours, always);
    expect(svg).toMatch(/class="mark made" fill="#c8102e"/);
    expect(svg).toMatch(/class="mark miss" fill="none" stroke="#008348"/);
  });

  it('draws older shots fainter', () => {
    const svg = shotMarks([shot({ id: '1' }), shot({ id: '2' }), shot({ id: '3' })], colours, always);
    const op = [...svg.matchAll(/opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(op).toEqual([...op].sort((a, b) => a - b));
    expect(op.at(-1)).toBe(1);
  });

  // The shot's path stays visible as a dashed arc, drawn out as the ball flies.
  it('draws the path flown so far as a dashed arc in the team colour', () => {
    const s = shot();
    const mid = flightSvg(s, WINDUP_SECONDS + flightSeconds(s) / 2, 'c8102e');
    expect(mid).toMatch(/<path class="arc" d="M[^"]+" stroke="#c8102e"/);
    expect(flightSvg(s, WINDUP_SECONDS / 2, 'c8102e')).not.toContain('class="arc"');
  });

  // Every free throw comes from the same spot; marks there would pile up and push real shots off.
  it('leaves no mark for a free throw', () => {
    expect(shotMarks([shot({ id: '1', points: 1, x: 25, y: 14.75 })], colours, always)).toBe('');
  });

  // The mark is the shot's result: it must not be on the floor before the ball has landed.
  it('leaves a shot still in the air off the floor', () => {
    expect(shotMarks([shot({ id: '1' })], colours, (id) => id !== '1')).toBe('');
  });
});

describe('where a shot is drawn', () => {
  // The floor now shows its sidelines and the apron past them: a corner shot ESPN puts on the line
  // must not look out of bounds (its feet were in, or it would not count), so its mark stays clear.
  it('keeps a corner shot inside the sideline, and leaves the rest where ESPN put them', () => {
    expect(spotOf(shot({ x: 0.2, y: 3 })).x).toBe(1.5);
    expect(spotOf(shot({ x: 49.9, y: 3 })).x).toBe(48.5);
    expect(spotOf(shot({ x: 3, y: 3 })).x).toBe(3);
    expect(spotOf(shot({ x: 25, y: 25 }))).toEqual({ x: 25, y: 25, z: 0 });
  });
});

describe('the painted lane', () => {
  // The lane takes the home side's colour; its lines must stay visible on it, whatever the colour.
  it('draws the lane\'s lines white on a dark paint and near black on a light one', () => {
    expect(laneLine('4e008e')).toBe(LANE_LINE_LIGHT); // Jazz purple
    expect(laneLine('000000')).toBe(LANE_LINE_LIGHT); // Nets black
    expect(laneLine('fec524')).toBe(LANE_LINE_DARK); // Nuggets gold
    expect(laneLine('ffffff')).toBe(LANE_LINE_DARK);
  });

  // NBA floors wear the home colour: the apron and the lane in it, the court's lines in it on the
  // maple unless it is too pale to show there, the boundary white between apron and floor.
  it('dresses the floor in the home colour, and leaves it wood without one', () => {
    const html = courtLines('4e008e');
    expect(html).toContain('class="apron" style="fill:#4e008e"');
    expect(html).toContain('class="paint" style="fill:#4e008e"');
    expect(html).toContain('<g class="lines" style="stroke:#4e008e">');
    expect(html).toContain(`<g class="lines on-paint" style="stroke:${LANE_LINE_LIGHT}">`);
    expect(html).toContain('<path class="bounds"');
    expect(courtLines()).not.toContain('fill:#');
  });

  it('draws the court\'s lines near black where the home colour would not show on the maple', () => {
    expect(woodLine('4e008e')).toBe('#4e008e');
    expect(woodLine('fec524')).toBe(LANE_LINE_DARK);
  });
});
