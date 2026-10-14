// Global shortcuts: they work from any app, since the window sits in a corner and is rarely the one
// in focus. Control+Alt with a letter is rare enough not to take another app's keys. A switch in the
// settings turns them all off (CLAUDE.md: every feature is a switch).

export type ShortcutAction = 'mode' | 'stats' | 'hide';

/** Each action's keys, in the global-shortcut plugin's spelling. */
export const SHORTCUTS: Record<ShortcutAction, string> = { mode: 'Control+Alt+M', stats: 'Control+Alt+S', hide: 'Control+Alt+H' };

/** The keys as each system writes them: ⌃⌥M on macOS, Ctrl+Alt+M elsewhere. */
export function keyLabel(keys: string, mac: boolean): string {
  const parts = keys.split('+');
  return mac
    ? parts.map((p) => ({ Control: '⌃', Alt: '⌥', Shift: '⇧', Super: '⌘' })[p] ?? p).join('')
    : parts.map((p) => (p === 'Control' ? 'Ctrl' : p)).join('+');
}
