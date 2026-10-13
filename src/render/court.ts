// The court view: a half court in a few lines, and the latest shots on it. Pure: state in, SVG
// out. Coordinates are ESPN's, in feet, the basket at (25, 1) (src/model/types.ts Shot), so one
// SVG user unit is one foot. Only basic geometry (CLAUDE.md rule 4): no players, no particles.
//
// Animation is CSS (src/ui/app.css): a new shot's ball flies from the spot to the rim, then the
// mark appears. The page redraws on every state, so each shot carries how long ago it first
// appeared (`ages`), and a negative animation-delay resumes the animation where it was.

import { BASKET, type GameState, type Shot, type Side } from '../model/types.ts';

/** How long a shot counts as new, ms: the flight and the mark's entrance (app.css). */
export const SHOT_ANIMATION_MS = 900;
/** The ball's flight, ms; the mark appears when it lands. */
export const FLIGHT_MS = 550;

const BASELINE = BASKET.y - 5.25;
/** What the view shows: the sidelines, and from behind the baseline to past the arc. */
export const VIEW = { x: -1, y: BASELINE - 1.5, w: 52, h: 36.5 } as const;

const ARC = 23.75, CORNER_X = 22;
const arcY = BASKET.y + Math.sqrt(ARC * ARC - CORNER_X * CORNER_X);

/** The court's lines, drawn once per frame. */
export function courtLines(): string {
  const l = (d: string) => `<path d="${d}"/>`;
  return `<g class="lines">
    ${l(`M0 ${BASELINE} H50`)}
    ${l(`M17 ${BASELINE} V${BASELINE + 19} H33 V${BASELINE}`)}
    ${l(`M19 ${BASELINE + 19} A6 6 0 0 0 31 ${BASELINE + 19}`)}
    ${l(`M${BASKET.x - CORNER_X} ${BASELINE} V${arcY.toFixed(2)} A${ARC} ${ARC} 0 0 0 ${BASKET.x + CORNER_X} ${arcY.toFixed(2)} V${BASELINE}`)}
    ${l(`M22 ${BASKET.y - 1.25} H28`)}
    <circle class="rim" cx="${BASKET.x}" cy="${BASKET.y}" r="0.75"/>
  </g>`;
}

/** A shot keeps to the view: a heave from past half court sits on the edge. */
const clampY = (y: number) => Math.min(VIEW.y + VIEW.h - 1, Math.max(VIEW.y + 0.5, y));

/**
 * The shots, oldest faintest. `ages`: ms since each shot first appeared on screen; a shot with no
 * age, or older than SHOT_ANIMATION_MS, is drawn still.
 */
export function shotMarks(shots: readonly Shot[], colours: Record<Side, string>, ages: ReadonlyMap<string, number>): string {
  return shots.map((s, i) => {
    const x = s.x, y = clampY(s.y);
    const fade = (0.35 + 0.65 * ((i + 1) / shots.length)).toFixed(2);
    const age = ages.get(s.id);
    const fresh = age !== undefined && age < SHOT_ANIMATION_MS;
    const mark = s.made
      ? `<circle class="mark made${fresh ? ' fresh' : ''}" cx="${x}" cy="${y}" r="1.3" fill="#${colours[s.side]}" opacity="${fade}"${fresh ? ` style="animation-delay:${FLIGHT_MS - age}ms"` : ''}/>`
      : `<circle class="mark miss${fresh ? ' fresh' : ''}" cx="${x}" cy="${y}" r="1.1" fill="none" stroke="#${colours[s.side]}" opacity="${fade}"${fresh ? ` style="animation-delay:${FLIGHT_MS - age}ms"` : ''}/>`;
    const ball = fresh
      ? `<circle class="ball" cx="${x}" cy="${y}" r="0.9" style="--dx:${BASKET.x - x}px;--dy:${BASKET.y - y}px;animation-delay:${-age}ms"/>`
      : '';
    return mark + ball;
  }).join('');
}

export function courtSvg(s: GameState, colours: Record<Side, string>, ages: ReadonlyMap<string, number>): string {
  return `<svg class="court" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${courtLines()}${shotMarks(s.recentShots ?? [], colours, ages)}
  </svg>`;
}
