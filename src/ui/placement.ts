// Where the main window sits. It starts in the bottom-right corner of the screen (the part not
// under the Dock or the taskbar) and stays there: whenever it changes size, or the stats open
// beside it and the line score under it, it glides to where the whole group fits in the corner.
// Once the user drags it somewhere, it stays where they put it, until the app starts again.

export interface Rect { x: number; y: number; w: number; h: number }

/** The stats window's width (at the main window's right edge), the line score's height (under it), the gap. */
export const PLAYERS_W = 360;
export const LINE_H = 96;
export const SIDE_GAP = 6;
/** Room left between the group and the screen's edges. */
export const CORNER_MARGIN = 16;
/** How long a glide to the corner takes, ms. */
export const GLIDE_MS = 280;

/** The stats beside the main window and the line score under it, one rectangle together. */
export function sideRects(main: Rect): { players: Rect; linescore: Rect } {
  return {
    players: { x: main.x + main.w + SIDE_GAP, y: main.y, w: PLAYERS_W, h: main.h + SIDE_GAP + LINE_H },
    linescore: { x: main.x, y: main.y + main.h + SIDE_GAP, w: main.w, h: LINE_H },
  };
}

/** The main window of this size, placed so it, and the stats when open, end at the area's bottom-right corner. */
export function cornerRect(area: Rect, size: { w: number; h: number }, withStats: boolean): Rect {
  const w = size.w + (withStats ? SIDE_GAP + PLAYERS_W : 0);
  const h = size.h + (withStats ? SIDE_GAP + LINE_H : 0);
  return { x: area.x + area.w - CORNER_MARGIN - w, y: area.y + area.h - CORNER_MARGIN - h, w: size.w, h: size.h };
}

/** Fast at first, settling at the end. */
export const ease = (t: number): number => 1 - (1 - t) ** 3;

export const between = (a: Rect, b: Rect, t: number): Rect =>
  ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });
