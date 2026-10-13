// Sends notices as system notifications: the Tauri notification plugin in the desktop shell, the
// browser's Notification API under `npm run dev`. Each notice key is sent once per game.

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
    case 'final': return { title, body: T.finalNotice(line(n.state)) };
    case 'clutch': return { title, body: T.clutchNotice(whenText(n.state, T), line(n.state)) };
  }
}

const inShell = () => '__TAURI_INTERNALS__' in window;

async function show(title: string, body: string): Promise<void> {
  if (inShell()) {
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
