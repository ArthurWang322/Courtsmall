// The court view in 3D: a half court seen from behind and above at 45 degrees, the basket at the
// far end, the latest shots on the floor, and a new shot's ball flying to the rim. Only basic
// geometry: lines, a disc for the shooter, the ball and its shadow; the arena is lit with gradients.
//
// Coordinates are ESPN's, in feet: x 0-50 across, y from the baseline, the basket at (25, 1)
// (docs/PROBE_REPORT.md §11); z is height. The static court is drawn as a string; flights are
// drawn every frame by `drawFlights` into the court's `.flights` group, from how long ago each
// shot first appeared, so the page can redraw at any time without restarting a flight.

import { BASKET, type GameState, type Shot, type Side } from '../model/types.ts';
import { contrast } from './colour.ts';

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

/** The view box: the floor, the backboard, and a little air above it (the arc may rise past it; app.css lets it). */
export function viewBox(): string {
  const pts = [ground(0, FAR), ground(50, FAR), ground(0, NEAR), ground(50, NEAR), { x: 25, y: BOARD_Y, z: RIM_Z + 5 }].map(project);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const pad = 2;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return `${f(x0)} ${f(y0)} ${f(Math.max(...xs) + pad - x0)} ${f(Math.max(...ys) + pad - y0)}`;
}

/** The floor, its lines, and the basket standing on the far baseline, lit like an arena, dressed as
 *  NBA floors are in the home side's colour (`home`): pale maple inside the lines, the apron outside
 *  them and the lane in that colour, a white boundary between, the court's lines in that colour too
 *  (near black where it would not show on the wood), the lane's lines white or near black, whichever
 *  stands out on it. Then the overhead lights' glow and reflections, and a padded stanchion holding a
 *  glass backboard. Without a colour, all of it is wood with dark lines. */
export function courtLines(home?: string): string {
  const quad = (x0: number, x1: number, y0: number, y1: number) => path([ground(x0, y0), ground(x1, y0), ground(x1, y1), ground(x0, y1)], true);
  // The apron: a few feet past the lines on every side; the floor inside them.
  const apron = quad(-3, 53, FAR - 3, NEAR);
  const floor = quad(0, 50, FAR, NEAR);
  const bounds = path([ground(0, NEAR), ground(0, FAR), ground(50, FAR), ground(50, NEAR)]);
  const lane = path([ground(17, FAR), ground(17, FAR + 19), ground(33, FAR + 19), ground(33, FAR)]);
  // The free-throw circle: solid on the court side, dashed inside the lane.
  const ftNear = path(arcPts(25, FAR + 19, 6, 0, Math.PI));
  // Inside the lane the half circle is six long dashes, as painted, measured on the floor so they
  // shorten with distance like the rest.
  const DASHES = 6, step = Math.PI / DASHES;
  const ftFar = Array.from({ length: DASHES }, (_, i) => path(arcPts(25, FAR + 19, 6, Math.PI + step * (i + 0.2), Math.PI + step * (i + 0.8), 0, 6))).join(' ');
  // The lane-space marks along both sides, outside the lane: where players line up for a free throw,
  // 7, 8, 11 and 14 feet from the baseline, each a short line out from the lane.
  const marks = [7, 8, 11, 14].flatMap((d) => [path([ground(17, FAR + d), ground(16.3, FAR + d)]), path([ground(33, FAR + d), ground(33.7, FAR + d)])]).join(' ');
  const restricted = path(arcPts(BASKET.x, BASKET.y, 4, 0, Math.PI, 0, 20));
  const a = Math.asin((arcY - BASKET.y) / ARC);
  const three = path([ground(BASKET.x - CORNER_X, FAR), ground(BASKET.x - CORNER_X, arcY),
    ...arcPts(BASKET.x, BASKET.y, ARC, Math.PI - a, a), ground(BASKET.x + CORNER_X, arcY), ground(BASKET.x + CORNER_X, FAR)]);
  // The stanchion: a padded block behind the baseline, an arm up and over to the board.
  const baseY = FAR - 2, baseZ = 3;
  const baseFront = path([{ x: 23, y: baseY, z: 0 }, { x: 27, y: baseY, z: 0 }, { x: 27, y: baseY, z: baseZ }, { x: 23, y: baseY, z: baseZ }], true);
  const baseTop = path([{ x: 23, y: baseY, z: baseZ }, { x: 27, y: baseY, z: baseZ }, { x: 27, y: baseY - 2.5, z: baseZ }, { x: 23, y: baseY - 2.5, z: baseZ }], true);
  const post = path([{ x: 25, y: baseY - 1, z: baseZ }, { x: 25, y: baseY - 1, z: RIM_Z + 1.5 }, { x: 25, y: BOARD_Y, z: RIM_Z + 1.5 }]);
  const board = path([{ x: 22, y: BOARD_Y, z: RIM_Z - 0.5 }, { x: 28, y: BOARD_Y, z: RIM_Z - 0.5 }, { x: 28, y: BOARD_Y, z: RIM_Z + 3 }, { x: 22, y: BOARD_Y, z: RIM_Z + 3 }], true);
  const square = path([{ x: 24, y: BOARD_Y, z: RIM_Z }, { x: 26, y: BOARD_Y, z: RIM_Z }, { x: 26, y: BOARD_Y, z: RIM_Z + 1.5 }, { x: 24, y: BOARD_Y, z: RIM_Z + 1.5 }], true);
  const rim = path(arcPts(BASKET.x, BASKET.y, RIM_R, 0, 2 * Math.PI, RIM_Z), true);
  const rimShadow = path(arcPts(BASKET.x, BASKET.y, RIM_R, 0, 2 * Math.PI), true);
  // Board seams toward the basket every foot and a half.
  const planks = Array.from({ length: 33 }, (_, i) => `<path d="${path([ground(i * 1.5 + 1, FAR), ground(i * 1.5 + 1, NEAR)])}"/>`).join('');
  const fill = (cls: string) => (home ? `class="${cls}" style="fill:#${home}"` : `class="${cls} plain"`);
  // Where the overhead lights shine back off the boards.
  const glare = [[13, 12, 3.2], [37, 13, 3.2], [25, 21, 4]].map(([x, y, r]) => `<path d="${path(arcPts(x!, y!, r!, 0, 2 * Math.PI, 0, 24), true)}"/>`).join('');
  return `<defs>
      <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--wood)"/><stop offset="1" style="stop-color:var(--wood-hi)"/></linearGradient>
      <radialGradient id="light" cx=".5" cy=".55" r=".65"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>
      <radialGradient id="glare"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <path ${fill('apron')} d="${apron}"/><path class="floor" d="${floor}"/><g class="planks">${planks}</g>
    <path ${fill('paint')} d="${quad(17, 33, FAR, FAR + 19)}"/>
    <path class="light" d="${apron}"/><g class="glare">${glare}</g>
    <g class="lines"${home ? ` style="stroke:${woodLine(home)}"` : ''}><path d="${ftNear}"/><path d="${three}"/><path d="${marks}"/></g>
    <g class="lines on-paint"${home ? ` style="stroke:${laneLine(home)}"` : ''}><path d="${lane}"/><path d="${ftFar}"/><path d="${restricted}"/></g>
    <path class="bounds${home ? '' : ' plain'}" d="${bounds}"/>
    <path class="rim-shadow" d="${rimShadow}"/>
    <path class="stanchion" d="${baseFront}"/><path class="stanchion top" d="${baseTop}"/><path class="post" d="${post}"/>
    <path class="board" d="${board}"/><path class="square" d="${square}"/>${net(1.8, 0.9, '')}<path class="rim" d="${rim}"/>`;
}

/** The lane's lines on a painted lane: white on a dark colour, near black on a light one, whichever
 *  stands out more, so the lines never disappear into the paint. */
export const LANE_LINE_LIGHT = '#ffffff', LANE_LINE_DARK = '#140e0a';
/** The court's lines on the maple: the home colour, unless it is too pale to show there (a gold on
 *  the light boards), then near black. WOOD is about the boards' middle shade (app.css --wood-*). */
export const WOOD = 'e6c99a';
export const woodLine = (home: string) => (contrast(home, WOOD) >= 2 ? `#${home}` : LANE_LINE_DARK);
export const laneLine = (paint: string) => (contrast(paint, LANE_LINE_LIGHT.slice(1)) >= contrast(paint, LANE_LINE_DARK.slice(1)) ? LANE_LINE_LIGHT : LANE_LINE_DARK);

// ---- Flights ------------------------------------------------------------------------------------

/** Where a shot is drawn from. A heave from past half court starts at the edge of the floor drawn;
 *  a corner shot ESPN places on or by the sideline (its feet were inbounds, or it would not count)
 *  stays inside the line, its mark clear of it. */
const SIDELINE_CLEAR = 1.5;
export const spotOf = (s: Shot): P3 => ({ x: Math.min(50 - SIDELINE_CLEAR, Math.max(SIDELINE_CLEAR, s.x)), y: Math.min(NEAR - 1, Math.max(BASKET.y + 1, s.y)), z: 0 });

/** The shooter stands this long before the release, seconds. */
export const WINDUP_SECONDS = 0.25;
/** Seconds in the air, longer for a longer shot: about 0.9 s at the rim, 1.2 s from three. */
export const flightSeconds = (s: Shot) => 0.6 + 0.025 * Math.hypot(s.x - BASKET.x, s.y - BASKET.y);
/** After the rim: a make drops through the net, a miss bounces off to the floor. */
export const AFTER_SECONDS = { made: 0.35, miss: 0.6 } as const;
/** After a make has dropped through: the points rise from the spot and a ring spreads on the floor. */
export const SCORE_SECONDS = 0.9;
export const shotSeconds = (s: Shot) => WINDUP_SECONDS + flightSeconds(s) + (s.made ? AFTER_SECONDS.made + SCORE_SECONDS : AFTER_SECONDS.miss);

/** Which way a miss bounces off the rim, from the play id: a replayed shot bounces the same way. */
function bounceAngle(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // Out toward the court (y grows away from the basket), never back into the backboard.
  return ((20 + (h % 141)) * Math.PI) / 180;
}
/** How far a miss bounces from the rim before it lands, feet. */
export const BOUNCE_FEET = 7;

export type Phase = 'windup' | 'flight' | 'through' | 'score' | 'bounce' | 'done';

/** Where the ball is `t` seconds after the shot first appeared. Pure, for tests and for drawing. */
export function ballAt(s: Shot, t: number): { phase: Phase; ball?: P3; v?: number } {
  const spot = spotOf(s);
  const release = { ...spot, z: RELEASE_Z };
  const T = flightSeconds(s);
  if (t < WINDUP_SECONDS) return { phase: 'windup', ball: release };
  const u = (t - WINDUP_SECONDS) / T;
  if (u < 1) {
    // A parabola from the release to the rim, its top higher for a longer shot.
    const apex = RIM_Z + 2.5 + 0.15 * Math.hypot(s.x - BASKET.x, s.y - BASKET.y);
    const z = release.z + (RIM_Z - release.z) * u + 4 * (apex - (release.z + RIM_Z) / 2) * u * (1 - u);
    return { phase: 'flight', ball: { x: release.x + (BASKET.x - release.x) * u, y: release.y + (BASKET.y - release.y) * u, z }, v: u };
  }
  const after = t - WINDUP_SECONDS - T;
  if (s.made) {
    if (after < AFTER_SECONDS.made) { const v = after / AFTER_SECONDS.made; return { phase: 'through', ball: { x: BASKET.x, y: BASKET.y, z: RIM_Z - 6 * v }, v }; }
    const v = (after - AFTER_SECONDS.made) / SCORE_SECONDS;
    return v < 1 ? { phase: 'score', v } : { phase: 'done' };
  }
  const v = after / AFTER_SECONDS.miss;
  if (v >= 1) return { phase: 'done' };
  const a = bounceAngle(s.id);
  const z = RIM_Z * (1 - v) + 12 * v * (1 - v);
  return { phase: 'bounce', ball: { x: BASKET.x + Math.cos(a) * BOUNCE_FEET * v, y: BASKET.y + Math.sin(a) * BOUNCE_FEET * v, z: Math.max(0, z) }, v };
}

/** A start time far enough back that the flight is over: the shot lands at once. */
export const LANDED = -Infinity;

/** An ellipse lying flat at height `p.z`, radius in feet. */
function disc(p: P3, r: number, attrs: string): string {
  const c = project(p);
  const rx = r * footAt(p);
  return `<ellipse cx="${f(c.x)}" cy="${f(c.y)}" rx="${f(rx)}" ry="${f(rx * 0.7)}" ${attrs}/>`;
}

/** The net under the rim: `drop` feet long, its bottom ring `bottom` feet across. */
function net(drop: number, bottom: number, attrs: string): string {
  const top = arcPts(BASKET.x, BASKET.y, RIM_R, 0, 2 * Math.PI, RIM_Z, 10);
  const low = arcPts(BASKET.x, BASKET.y, bottom / 2, 0, 2 * Math.PI, RIM_Z - drop, 10);
  const strands = top.slice(0, -1).map((p, i) => path([p, low[(i + 1) % 10]!])).join(' ') + ' ' + top.slice(0, -1).map((p, i) => path([p, low[(i + 9) % 10]!])).join(' ');
  return `<path class="net" d="${strands} ${path(low, true)}" ${attrs}/>`;
}

/** The marks of the latest shots on the floor, oldest faintest; a shot still in the air has none yet. */
export function shotMarks(shots: readonly Shot[], colours: Record<Side, string>, landed: (id: string) => boolean): string {
  // Free throws all come from the same spot: they fly, but leave no mark.
  return shots.filter((s) => s.points !== 1 && landed(s.id)).map((s, i, all) => {
    const fade = (0.35 + 0.65 * ((i + 1) / all.length)).toFixed(2);
    return s.made
      ? disc(spotOf(s), 1.2, `class="mark made" fill="#${colours[s.side]}" opacity="${fade}"`)
      : disc(spotOf(s), 1.1, `class="mark miss" fill="none" stroke="#${colours[s.side]}" opacity="${fade}"`);
  }).join('');
}

/**
 * One shot, `t` seconds after it appeared: the shooter's dot, the ball with a dashed arc behind it and its
 * shadow, the net swishing on a make or the rim shaking on a miss, and on a make the points rising
 * from the spot with a ring spreading on the floor (bigger for three).
 */
export function flightSvg(s: Shot, t: number, colour: string): string {
  const { phase, ball, v = 0 } = ballAt(s, t);
  if (phase === 'done') return '';
  const spot = spotOf(s);
  const out: string[] = [];

  // The shooter: a dot in the team's colour on the spot, a ring going out from it at the release,
  // fading once the ball is away.
  const shooterOpacity = Math.max(0, 1 - Math.max(0, t - WINDUP_SECONDS) / 0.8);
  if (shooterOpacity > 0) {
    const k = Math.min(1, t / (WINDUP_SECONDS + 0.35));
    out.push(disc(spot, 1.2 + 2 * k, `class="burst" fill="none" stroke="#${colour}" opacity="${f((1 - k) * shooterOpacity)}"`),
      disc(spot, 1.2, `class="shooter" fill="#${colour}" opacity="${f(shooterOpacity)}"`));
  }

  // A make: the net stretches and lights up as the ball drops through; then the points rise.
  if (phase === 'through') out.push(net(1.8 + 1.2 * Math.sin(Math.PI * v), 0.9 + 0.3 * Math.sin(Math.PI * v), `stroke="#${colour}" opacity="${f(1 - v * 0.5)}"`));
  if (phase === 'score') {
    const big = s.points === 3;
    out.push(disc(spot, 1 + (big ? 5 : 3.5) * v, `class="burst" fill="#${colour}" fill-opacity="0.12" stroke="#${colour}" opacity="${f(1 - v)}"`));
    if (big) out.push(disc(spot, 1 + 3 * v, `class="burst" fill="none" stroke="#${colour}" opacity="${f((1 - v) * 0.6)}"`));
    const at = project({ ...spot, z: 3 + 5 * v });
    const size = (big ? 6.5 : 5.2) * footAt(spot);
    out.push(`<text class="points" x="${f(at.x)}" y="${f(at.y)}" font-size="${f(size)}" fill="#${colour}" opacity="${f(v < 0.7 ? 1 : (1 - v) / 0.3)}">+${s.points}</text>`);
  }
  // A miss: the rim shakes as the ball comes off it.
  if (phase === 'bounce' && v < 0.35) {
    const shake = Math.sin(v * 60) * 0.25 * (1 - v / 0.35);
    out.push(`<path class="rim hit" d="${path(arcPts(BASKET.x + shake, BASKET.y, RIM_R, 0, 2 * Math.PI, RIM_Z + shake * 0.5), true)}"/>`);
  }

  // The ball's path as a dashed arc in the team's colour: drawn out behind the ball while it flies,
  // then the whole arc, fading as the shot ends.
  const T = flightSeconds(s);
  const flown = Math.min(1, Math.max(0, (t - WINDUP_SECONDS) / T));
  if (flown > 0) {
    const pts: P3[] = [];
    for (let i = 0; i <= 24; i++) pts.push(ballAt(s, WINDUP_SECONDS + (T * flown * i) / 24).ball!);
    const fade = flown < 1 ? 0.75 : 0.75 * Math.max(0, 1 - (t - WINDUP_SECONDS - T) / (shotSeconds(s) - WINDUP_SECONDS - T));
    out.push(`<path class="arc" d="${path(pts)}" stroke="#${colour}" opacity="${f(fade)}"/>`);
  }

  if (ball) {
    // The shadow sits on the floor under the ball, smaller and fainter the higher the ball is.
    out.push(disc({ ...ball, z: 0 }, Math.max(0.35, 0.85 - ball.z * 0.03), `class="shadow" opacity="${f(Math.max(0.12, 0.5 - ball.z * 0.022))}"`));
    const b = project(ball);
    // The ball is drawn larger than life (1.2 ft, not 0.4) so a glance finds it.
    out.push(`<circle class="ball" cx="${f(b.x)}" cy="${f(b.y)}" r="${f(1.2 * footAt(ball))}"/>`);
  }
  return out.join('');
}

/** The court for a state. Flights are drawn into `.flights` by `drawFlights`, every frame. */
export function courtSvg(s: GameState, colours: Record<Side, string>, landed: (id: string) => boolean): string {
  return `<svg class="court" viewBox="${viewBox()}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${courtLines(s.teams.home.color)}<g class="marks">${shotMarks(s.recentShots ?? [], colours, landed)}</g><g class="flights"></g>
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
