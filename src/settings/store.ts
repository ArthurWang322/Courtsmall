// The user's settings. Kept in the web view's localStorage: the desktop shell keeps it in the app's
// data folder. Reads and writes never throw; a broken or missing store gives the defaults.

export interface Settings {
  /** ESPN team id of the team to follow; absent: follow the closest game. */
  team?: string;
  /** Each notice is its own switch (CLAUDE.md: every feature is a switch). */
  notify: { start: boolean; final: boolean; clutch: boolean };
  /** Dark or light, or whatever the system uses. */
  theme: ThemeChoice;
}

export type ThemeChoice = 'system' | 'dark' | 'light';
const THEMES: readonly ThemeChoice[] = ['system', 'dark', 'light'];

export const DEFAULTS: Settings = { notify: { start: true, final: true, clutch: true }, theme: 'system' };
const KEY = 'courtsmall.settings';

/** Fill in what a stored object lacks, drop what it should not have. */
export function normalize(raw: unknown): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const n = (o.notify && typeof o.notify === 'object' ? o.notify : {}) as Partial<Settings['notify']>;
  const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    ...(typeof o.team === 'string' && o.team ? { team: o.team } : {}),
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
