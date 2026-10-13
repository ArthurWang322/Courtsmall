// Size tiers of the main window. The window's height picks the level of detail: dragging the
// border switches tier, there is no separate "mode" (as in Basesmall).

export type Tier = 'dot' | 'bar';

/** Content height at which the bar starts. */
const BAR_AT = 44;

export const TIER_PRESET: Record<Tier, { w: number; h: number }> = { dot: { w: 200, h: 28 }, bar: { w: 360, h: 96 } };

/** How many play lines the bar has room for at a content height. */
export const playLinesAt = (height: number): number => (height >= 88 ? 2 : 1);

export const tierOf = (height: number): Tier => (height < BAR_AT ? 'dot' : 'bar');
