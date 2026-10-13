// The court view in 3D: a half court seen from behind and above at 45 degrees, the basket at the
// far end, the latest shots on the floor, and a new shot's ball flying to the rim. Only basic
// geometry (CLAUDE.md rule 4): lines, a disc for the shooter, the ball and its shadow.
//
// Coordinates are ESPN's, in feet: x 0-50 across, y from the baseline, the basket at (25, 1)
// (docs/PROBE_REPORT.md §11); z is height. The static court is drawn as a string; flights are
// drawn every frame by `drawFlights` into the court's `.flights` group, from how long ago each
// shot first appeared, so the page can redraw at any time without restarting a flight.

import { BASKET, type GameState, type Shot, type Side } from '../model/types.ts';

export interface P3 { x: number; y: number; z: number }
export interface P2 { x: number; y: number }

// ---- Camera -------------------------------------------------------------------------------------

/** Behind the top of the key and up, looking down at about 45 degrees at the paint. */
const EYE: P3 = { x: 25, y: 37, z: 25 };
const TARGET: P3 = { x: 25, y: 9, z: 3 };
const FOCAL = 100;

const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: P3, b: P3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: P3): P3 => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

const FWD = unit(sub(TARGET, EYE));
// x grows to the right on screen, as on a shot chart with the basket at the top. (Physically a
// camera facing the basket would see x = 0 on its right; which side ESPN's x = 0 is on is not
// verified, docs/PROBE_REPORT.md §11.) UP keeps z pointing up on screen either way.
const RIGHT = unit(cross({ x: 0, y: 0, z: 1 }, FWD));
const UP = unit(cross(FWD, RIGHT));

/** Screen point of a court point: x to the right, y down. */
export function project(p: P3): P2 {
  const d = sub(p, EYE);
  const depth = dot(d, FWD);
  return { x: (dot(d, RIGHT) / depth) * FOCAL, y: (-dot(d, UP) / depth) * FOCAL };
}

/** Screen length of one foot at a court point: things shrink with distance. */
export const footAt = (p: P3) => FOCAL / dot(sub(p, EYE), FWD);

// ---- Court --------------------------------------------------------------------------------------

export const RIM_Z = 10;
const RIM_R = 0.75;
const RELEASE_Z = 7;
const BOARD_Y = BASKET.y - 1.25;
const BASELINE = BASKET.y - 5.25;
/** The floor drawn: sideline to sideline, from the baseline to past the top of the arc. */
const FAR = BASELINE, NEAR = 27;
const ARC = 23.75, CORNER_X = 22;
const arcY = BASKET.y + Math.sqrt(ARC * ARC - CORNER_X * CORNER_X);

const f = (n: number) => n.toFixed(2);
const path = (pts: P3[], close = false) => `M${pts.map(project).map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')}${close ? ' Z' : ''}`;
const ground = (x: number, y: number): P3 => ({ x, y, z: 0 });
const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number, z = 0, n = 28): P3[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z }; });

/** The view box: the floor, the backboard, and air above the rim for the ball's arc. */
export function viewBox(): string {
  const pts = [ground(0, FAR), ground(50, FAR), ground(0, NEAR), ground(50, NEAR), { x: 25, y: BOARD_Y, z: RIM_Z + 9 }].map(project);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const pad = 2;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return `${f(x0)} ${f(y0)} ${f(Math.max(...xs) + pad - x0)} ${f(Math.max(...ys) + pad - y0)}`;
}

/** The floor, its lines, and the basket standing on the far baseline. */
export function courtLines(): string {
  const floor = path([ground(0, FAR), ground(50, FAR), ground(50, NEAR), ground(0, NEAR)], true);
  const lane = path([ground(17, FAR), ground(17, FAR + 19), ground(33, FAR + 19), ground(33, FAR)]);
  const ftCircle = path(arcPts(25, FAR + 19, 6, 0, Math.PI));
  const a = Math.asin((arcY - BASKET.y) / ARC);
  const three = path([ground(BASKET.x - CORNER_X, FAR), ground(BASKET.x - CORNER_X, arcY),
    ...arcPts(BASKET.x, BASKET.y, ARC, Math.PI - a, a), ground(BASKET.x + CORNER_X, arcY), ground(BASKET.x + CORNER_X, FAR)]);
  const post = path([{ x: 25, y: FAR - 2, z: 0 }, { x: 25, y: FAR - 2, z: RIM_Z + 1.5 }, { x: 25, y: BOARD_Y, z: RIM_Z + 1.5 }]);
  const board = path([{ x: 22, y: BOARD_Y, z: RIM_Z - 0.5 }, { x: 28, y: BOARD_Y, z: RIM_Z - 0.5 }, { x: 28, y: BOARD_Y, z: RIM_Z + 3 }, { x: 22, y: BOARD_Y, z: RIM_Z + 3 }], true);
  const rim = path(arcPts(BASKET.x, BASKET.y, RIM_R, 0, 2 * Math.PI, RIM_Z), true);
  const rimShadow = path(arcPts(BASKET.x, BASKET.y, RIM_R, 0, 2 * Math.PI), true);
  return `<path class="floor" d="${floor}"/>
    <g class="lines"><path d="${lane}"/><path d="${ftCircle}"/><path d="${three}"/></g>
    <path class="rim-shadow" d="${rimShadow}"/><path class="post" d="${post}"/><path class="board" d="${board}"/><path class="rim" d="${rim}"/>`;
}

// ---- Flights ------------------------------------------------------------------------------------

/** A heave from past half court starts at the edge of the floor drawn. */
const spotOf = (s: Shot): P3 => ({ x: s.x, y: Math.min(NEAR - 1, Math.max(BASKET.y + 1, s.y)), z: 0 });

/** The shooter stands this long before the release, seconds. */
export const WINDUP_SECONDS = 0.25;
/** Seconds in the air, longer for a longer shot: about 0.9 s at the rim, 1.2 s from three. */
export const flightSeconds = (s: Shot) => 0.6 + 0.025 * Math.hypot(s.x - BASKET.x, s.y - BASKET.y);
/** After the rim: a make drops through the net, a miss bounces off to the floor. */
export const AFTER_SECONDS = { made: 0.35, miss: 0.6 } as const;
export const shotSeconds = (s: Shot) => WINDUP_SECONDS + flightSeconds(s) + (s.made ? AFTER_SECONDS.made : AFTER_SECONDS.miss);

/** Which way a miss bounces off the rim, from the play id: a replayed shot bounces the same way. */
function bounceAngle(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // Out toward the court (y grows away from the basket), never back into the backboard.
  return ((20 + (h % 141)) * Math.PI) / 180;
}
/** How far a miss bounces from the rim before it lands, feet. */
export const BOUNCE_FEET = 7;

export type Phase = 'windup' | 'flight' | 'through' | 'bounce' | 'done';

/** Where the ball is `t` seconds after the shot first appeared. Pure, for tests and for drawing. */
export function ballAt(s: Shot, t: number): { phase: Phase; ball?: P3 } {
  const spot = spotOf(s);
  const release = { ...spot, z: RELEASE_Z };
  const T = flightSeconds(s);
  if (t < WINDUP_SECONDS) return { phase: 'windup', ball: release };
  const u = (t - WINDUP_SECONDS) / T;
  if (u < 1) {
    // A parabola from the release to the rim, its top higher for a longer shot.
    const apex = RIM_Z + 3 + 0.22 * Math.hypot(s.x - BASKET.x, s.y - BASKET.y);
    const z = release.z + (RIM_Z - release.z) * u + 4 * (apex - (release.z + RIM_Z) / 2) * u * (1 - u);
    return { phase: 'flight', ball: { x: release.x + (BASKET.x - release.x) * u, y: release.y + (BASKET.y - release.y) * u, z } };
  }
  const v = (t - WINDUP_SECONDS - T) / (s.made ? AFTER_SECONDS.made : AFTER_SECONDS.miss);
  if (v >= 1) return { phase: 'done' };
  if (s.made) return { phase: 'through', ball: { x: BASKET.x, y: BASKET.y, z: RIM_Z - 6 * v } };
  const a = bounceAngle(s.id);
  const z = RIM_Z * (1 - v) + 12 * v * (1 - v);
  return { phase: 'bounce', ball: { x: BASKET.x + Math.cos(a) * BOUNCE_FEET * v, y: BASKET.y + Math.sin(a) * BOUNCE_FEET * v, z: Math.max(0, z) } };
}

/** An ellipse lying flat at height `p.z`, radius in feet. */
function disc(p: P3, r: number, attrs: string): string {
  const c = project(p);
  const rx = r * footAt(p);
  return `<ellipse cx="${f(c.x)}" cy="${f(c.y)}" rx="${f(rx)}" ry="${f(rx * 0.7)}" ${attrs}/>`;
}

/** The marks of the latest shots on the floor, oldest faintest; a shot still in the air has none yet. */
export function shotMarks(shots: readonly Shot[], colours: Record<Side, string>, landed: (id: string) => boolean): string {
  return shots.filter((s) => landed(s.id)).map((s, i, all) => {
    const fade = (0.35 + 0.65 * ((i + 1) / all.length)).toFixed(2);
    return s.made
      ? disc(spotOf(s), 1.2, `class="mark made" fill="#${colours[s.side]}" opacity="${fade}"`)
      : disc(spotOf(s), 1.1, `class="mark miss" fill="none" stroke="#${colours[s.side]}" opacity="${fade}"`);
  }).join('');
}

/** The shooter, the ball and its shadow for one shot, `t` seconds after it appeared. */
export function flightSvg(s: Shot, t: number, colour: string): string {
  const { phase, ball } = ballAt(s, t);
  if (phase === 'done' || !ball) return '';
  const spot = spotOf(s);
  // The shooter: a short team-coloured cylinder, gone soon after the release.
  const shooterOpacity = Math.max(0, 1 - Math.max(0, t - WINDUP_SECONDS) / 0.8);
  const head = { ...spot, z: 4.5 };
  const base = project(spot), top = project(head), w = 2.4 * footAt(spot);
  const shooter = shooterOpacity > 0
    ? `<g class="shooter" opacity="${f(shooterOpacity)}">${disc(spot, 1.2, `fill="#${colour}"`)}<rect x="${f(base.x - w / 2)}" y="${f(top.y)}" width="${f(w)}" height="${f(base.y - top.y)}" fill="#${colour}"/>${disc(head, 1.2, `fill="#${colour}" class="cap"`)}</g>`
    : '';
  // The shadow sits on the floor under the ball, smaller and fainter the higher the ball is.
  const shadow = disc({ ...ball, z: 0 }, Math.max(0.35, 0.85 - ball.z * 0.03), `class="shadow" opacity="${f(Math.max(0.12, 0.5 - ball.z * 0.022))}"`);
  const b = project(ball);
  // A make: a ring in the team's colour spreads from the rim as the ball drops through.
  const swish = phase === 'through'
    ? disc({ x: BASKET.x, y: BASKET.y, z: RIM_Z }, 0.8 + 2.2 * ((t - WINDUP_SECONDS - flightSeconds(s)) / AFTER_SECONDS.made), `class="swish" fill="none" stroke="#${colour}" opacity="${f(1 - (t - WINDUP_SECONDS - flightSeconds(s)) / AFTER_SECONDS.made)}"`)
    : '';
  // The ball is drawn larger than life (1.2 ft, not 0.4) so a glance finds it.
  return `${shooter}${shadow}${swish}<circle class="ball" cx="${f(b.x)}" cy="${f(b.y)}" r="${f(1.2 * footAt(ball))}"/>`;
}

/** The court for a state. Flights are drawn into `.flights` by `drawFlights`, every frame. */
export function courtSvg(s: GameState, colours: Record<Side, string>, landed: (id: string) => boolean): string {
  return `<svg class="court" viewBox="${viewBox()}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${courtLines()}<g class="marks">${shotMarks(s.recentShots ?? [], colours, landed)}</g><g class="flights"></g>
  </svg>`;
}

/** Draws every shot still in the air into `.flights`. Returns whether any is still in the air. */
export function drawFlights(root: ParentNode, shots: readonly Shot[], colours: Record<Side, string>, ageSeconds: (id: string) => number | undefined): boolean {
  const g = root.querySelector('.court .flights');
  if (!g) return false;
  let flying = false;
  g.innerHTML = shots.map((s) => {
    const t = ageSeconds(s.id);
    if (t === undefined || t >= shotSeconds(s)) return '';
    flying = true;
    return flightSvg(s, t, colours[s.side]);
  }).join('');
  return flying;
}
