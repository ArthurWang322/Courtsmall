// Sends notices as system notifications, each notice key once per game. In the desktop shell on macOS
// through the app's own `notice` command (src-tauri/src/notice.rs, UNUserNotificationCenter): the
// Tauri notification plugin sends through NSUserNotificationCenter there, which macOS 26 drops while
// reporting success, so no notice ever showed (2026-10-22). Elsewhere in the shell through the plugin;
// under `npm run dev` in a browser through its Notification API. Under `tauri dev` the app is no app
// bundle, and macOS shows nothing: notices are seen in the bundled app.

import type { GameState } from '../model/types.ts';
import type { Strings } from '../i18n/index.ts';
import { whenText } from '../ui/views.ts';
import type { Notice } from './rules.ts';

const line = (s: GameState) => `${s.teams.away.abbr} ${s.score.away} – ${s.score.home} ${s.teams.home.abbr}`;

/** Title and body of a notice. */
export function noticeText(n: Notice, T: Strings): { title: string; body: string } {
  const title = `${n.state.teams.away.abbr} @ ${n.state.teams.home.abbr}`;
  switch (n.kind) {
    case 'start': return { title, body: T.tipOff };
    case 'clutch': return { title, body: T.clutchNotice(whenText(n.state, T), line(n.state)) };
  }
}

/** Which way a notice goes: the app's own command (the shell on macOS), the plugin (the shell
 *  elsewhere), or the browser's API (no shell). */
export function senderFor(shell: boolean, mac: boolean): 'app' | 'plugin' | 'browser' {
  return !shell ? 'browser' : mac ? 'app' : 'plugin';
}

async function show(title: string, body: string): Promise<void> {
  const by = senderFor('__TAURI_INTERNALS__' in window, navigator.userAgent.includes('Mac'));
  if (by === 'app') {
    // macOS asks once whether Courtsmall may notify; a refusal or no app bundle comes back as an error.
    await (await import('@tauri-apps/api/core')).invoke('notice', { title, body });
    return;
  }
  if (by === 'plugin') {
    const n = await import('@tauri-apps/plugin-notification');
    if (!(await n.isPermissionGranted()) && (await n.requestPermission()) !== 'granted') return;
    n.sendNotification({ title, body });
    return;
  }
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') new Notification(title, { body });
}

export class Notifier {
  private sent = new Set<string>();
  private readonly T: Strings;

  constructor(T: Strings) { this.T = T; }

  send(notices: readonly Notice[]): void {
    for (const n of notices) {
      const key = `${n.state.gameId}:${n.key}`;
      if (this.sent.has(key)) continue;
      this.sent.add(key);
      const { title, body } = noticeText(n, this.T);
      show(title, body).catch((e: unknown) => console.warn('notice not shown', e));
    }
  }
}
