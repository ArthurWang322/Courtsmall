// Size tiers of the main window. The window's height picks the level of detail: dragging the
// border switches tier, there is no separate "mode" (as in Basesmall).

export type Tier = 'dot' | 'bar' | 'court';

/** Content heights at which the bar and the court start. */
const BAR_AT = 44;
const COURT_AT = 200;

export const TIER_PRESET: Record<Tier, { w: number; h: number }> = { dot: { w: 200, h: 28 }, bar: { w: 360, h: 96 }, court: { w: 360, h: 280 } };

/** How many play lines the bar has room for at a content height. */
export const playLinesAt = (height: number): number => (height >= 88 ? 2 : 1);

export const tierOf = (height: number): Tier => (height < BAR_AT ? 'dot' : height < COURT_AT ? 'bar' : 'court');

/** The tier a double-click switches to: dot, bar, court, and round again. */
export const nextTier = (t: Tier): Tier => ({ dot: 'bar', bar: 'court', court: 'dot' } as const)[t];
