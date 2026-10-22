// The user's settings. Kept in the web view's localStorage: the desktop shell keeps it in the app's
// data folder. Reads and writes never throw; a broken or missing store gives the defaults.

export interface Settings {
  /**
   * ESPN id of the favourite team, in a list of at most MAX_FAVOURITES: followed, and starred
   * wherever it appears. Empty: follow the closest game.
   */
  favourites: string[];
  /** Each notice is its own switch (CLAUDE.md: every feature is a switch). */
  notify: { start: boolean; clutch: boolean };
  /** The global shortcuts (src/ui/shortcuts.ts), on or off. */
  shortcuts: boolean;
  /** The card stack behind the main window (src/ui/stack.ts), on or off. */
  stack: boolean;
}

/** One favourite team (the maintainer's call, 2026-10-13); kept as a list should that change. */
export const MAX_FAVOURITES = 1;

export const DEFAULTS: Settings = { favourites: [], notify: { start: true, clutch: true }, shortcuts: true, stack: true };
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
    notify: { start: flag(n.start, DEFAULTS.notify.start), clutch: flag(n.clutch, DEFAULTS.notify.clutch) },
    shortcuts: flag(o.shortcuts, DEFAULTS.shortcuts),
    stack: flag(o.stack, DEFAULTS.stack),
  };
}

export function loadSettings(): Settings {
  try { return normalize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return normalize(null); }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or blocked storage: keep it for this session only */ }
}
