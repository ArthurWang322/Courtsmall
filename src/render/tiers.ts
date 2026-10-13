// Size tiers of the main window. The window's height picks the level of detail: dragging the
// border switches tier, there is no separate "mode" (as in Basesmall).

export type Tier = 'dot' | 'bar' | 'court';

/** Content heights at which the bar and the court start. */
const BAR_AT = 44;
const COURT_AT = 200;

/** The toolbar's row along the bottom of the bar and the court (src/ui/app.css .controls). */
export const TOOLBAR_H = 26;

export const TIER_PRESET: Record<Tier, { w: number; h: number }> = { dot: { w: 240, h: 28 }, bar: { w: 360, h: 104 + TOOLBAR_H }, court: { w: 360, h: 320 + TOOLBAR_H } };

/** How many play lines the bar has room for at a content height (the window less the toolbar). */
export const playLinesAt = (height: number): number => (height >= 96 ? 2 : 1);

export const tierOf = (height: number): Tier => (height < BAR_AT ? 'dot' : height < COURT_AT ? 'bar' : 'court');

