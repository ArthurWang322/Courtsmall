// The user's settings. Kept in the web view's localStorage: the desktop shell keeps it in the app's
// data folder. Reads and writes never throw; a broken or missing store gives the defaults.

export interface Settings {
  /**
   * ESPN id of the favourite team, in a list of at most MAX_FAVOURITES: followed, and starred
   * wherever it appears. Empty: follow the closest game.
   */
  favourites: string[];
  /** Each notice is its own switch (CLAUDE.md: every feature is a switch). */
  notify: { start: boolean; final: boolean; clutch: boolean };
  /** Dark or light, or whatever the system uses. */
  theme: ThemeChoice;
}

export type ThemeChoice = 'system' | 'dark' | 'light';
/** One favourite team (the maintainer's call, 2026-10-13); kept as a list should that change. */
export const MAX_FAVOURITES = 1;
const THEMES: readonly ThemeChoice[] = ['system', 'dark', 'light'];

export const DEFAULTS: Settings = { favourites: [], notify: { start: true, final: true, clutch: true }, theme: 'system' };
const KEY = 'courtsmall.settings';

/** Fill in what a stored object lacks, drop what it should not have. */
export function normalize(raw: unknown): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings> & { team?: unknown };
  const n = (o.notify && typeof o.notify === 'object' ? o.notify : {}) as Partial<Settings['notify']>;
  const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    // Before favourites there was one team to follow (`team`); it becomes the first favourite.
    favourites: (Array.isArray(o.favourites) ? [...new Set(o.favourites.filter((t): t is string => typeof t === 'string' && t !== ''))]
      : typeof o.team === 'string' && o.team ? [o.team] : []).slice(0, MAX_FAVOURITES),
    notify: { start: flag(n.start, DEFAULTS.notify.start), final: flag(n.final, DEFAULTS.notify.final), clutch: flag(n.clutch, DEFAULTS.notify.clutch) },
    theme: THEMES.includes(o.theme as ThemeChoice) ? (o.theme as ThemeChoice) : DEFAULTS.theme,
  };
}

export function loadSettings(): Settings {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return normalize(null); }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or blocked storage: keep it for this session only */ }
}
