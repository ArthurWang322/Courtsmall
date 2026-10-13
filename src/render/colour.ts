// Team colours that can be seen: against the window's background, and against each other.
// ESPN gives each team a colour and a second one; some first colours (BKN black, NO navy) vanish
// on the dark background, some (GS, IND gold) on the light one, and some pairs (ATL and CHI reds)
// cannot be told apart.

import type { Side, TeamRef } from '../model/types.ts';

/** The window backgrounds, `--background` in src/ui/app.css for each theme. */
export const BACKGROUNDS = { dark: '141317', light: 'f4f1ea' } as const;
export type Theme = keyof typeof BACKGROUNDS;
/** The dark background, the default. */
export const BACKGROUND = BACKGROUNDS.dark;

/** The background the colours are checked against: the theme on screen (src/ui/main.ts sets it). */
let current: string = BACKGROUND;
export function useTheme(theme: Theme): void { current = BACKGROUNDS[theme]; }
/** Least contrast a team dot needs against the background (WCAG ratio; 3 is "large text"). */
export const MIN_CONTRAST = 2.2;
/** Below this OKLab distance two team colours read as the same. */
export const CLASH_DISTANCE = 0.12;
const isDark = (background: string) => luminance(background) < 0.5;
const fallback = (side: Side, background: string) =>
  isDark(background) ? { away: '9aa3b2', home: 'e8b04a' }[side] : { away: '6d6873', home: 'b07408' }[side];

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: [number, number, number]) => c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const linear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Perceptual distance (OKLab): about 0.1 is a just-clear difference between two swatches. */
export function oklabDistance(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = rgb(hex).map(linear) as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
}

/** Mix away from the background (toward white on dark, black on light) until the colour stands out. */
function separate(hex: string, background: string): string {
  const c = rgb(hex), to = isDark(background) ? 255 : 0;
  for (let t = 0.1; t <= 1; t += 0.1) {
    const mixed = toHex(c.map((v) => v + (to - v) * t) as [number, number, number]);
    if (contrast(mixed, background) >= MIN_CONTRAST) return mixed;
  }
  return isDark(background) ? 'ffffff' : '000000';
}

/** A team's colour that shows on the background: its first colour, its second, or the first moved away from it. */
export function visibleColour(t: Pick<TeamRef, 'color' | 'alternateColor'>, background = current, side: Side = 'home'): string {
  for (const c of [t.color, t.alternateColor]) if (c && contrast(c, background) >= MIN_CONTRAST) return c;
  return separate(t.color ?? fallback(side, background), background);
}

/**
 * Both sides' colours for one game. When they clash, one side changes to the other of its own
 * colours: the favourite keeps its look; otherwise the home team does.
 */
export function gameColours(teams: Record<Side, TeamRef>, favourite?: string, background = current): Record<Side, string> {
  const own = { away: visibleColour(teams.away, background, 'away'), home: visibleColour(teams.home, background, 'home') };
  if (oklabDistance(own.away, own.home) >= CLASH_DISTANCE) return own;
  const changes: Side = favourite === teams.away.id ? 'home' : 'away';
  const keeps: Side = changes === 'away' ? 'home' : 'away';
  const t = teams[changes];
  const other = [t.alternateColor, t.color].find((c) => c && c !== own[changes] && contrast(c, background) >= MIN_CONTRAST && oklabDistance(c, own[keeps]) >= CLASH_DISTANCE);
  const spare = fallback(changes, background);
  return { ...own, [changes]: other ?? (oklabDistance(spare, own[keeps]) >= CLASH_DISTANCE ? spare : isDark(background) ? 'ffffff' : '000000') };
}
