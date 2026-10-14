// Size tiers of the main window. The window's height picks the level of detail: dragging the
// border switches tier, there is no separate "mode" (as in Basesmall).

export type Tier = 'bar' | 'court';

/** Window height at which the court starts; below it, the bar. (A smaller "dot" without the plays
 *  was dropped: the maintainer found it meaningless, 2026-10-13.) */
const COURT_AT = 200;

/** The toolbar's row along the bottom of the bar and the court (src/ui/app.css .controls). */
export const TOOLBAR_H = 26;

export const TIER_PRESET: Record<Tier, { w: number; h: number }> = { bar: { w: 360, h: 150 + TOOLBAR_H }, court: { w: 360, h: 274 + TOOLBAR_H } };

/** How many play lines the bar has room for at a content height (the window less the toolbar): the
 *  newest and three before it at the preset size (the maintainer's call, 2026-10-14), fewer when
 *  the window is dragged shorter. The court has room for two (src/ui/views.ts courtView). */
export const playLinesAt = (height: number): number => (height >= 146 ? 4 : height >= 96 ? 2 : 1);

export const tierOf = (height: number): Tier => (height < COURT_AT ? 'bar' : 'court');

