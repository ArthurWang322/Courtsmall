// Sends notices as system notifications, each notice key once per game. In the desktop shell on macOS
// through the app's own `notice` command (src-tauri/src/notice.rs, UNUserNotificationCenter): the
// Tauri notification plugin sends through NSUserNotificationCenter there, which macOS 26 drops while
// reporting success, so no notice ever showed (2026-10-22). Elsewhere in the shell through the plugin;
// under `npm run dev` in a browser through its Notification API. Under `tauri dev` the app is no app
// bundle, and macOS shows nothing: notices are seen in the bundled app.

import type { GameCard, GameState, TeamRef } from '../model/types.ts';
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

/** Sends one notice now; rejects when it was not sent (macOS: refused, or no app bundle). */
export async function showNotice(n: Notice, T: Strings): Promise<void> {
  const { title, body } = noticeText(n, T);
  await show(title, body);
}

/**
 * The settings page's test notice: the favourite's tip-off, as the real notice reads (rules.ts
 * 'start'). Its next game when known, else the favourite with another team; with no favourite,
 * two of the league's teams.
 */
export function testNoticeFor(fav: TeamRef | undefined, teams: readonly TeamRef[], next?: GameCard): Notice {
  const others = teams.filter((t) => t.id !== fav?.id);
  const sample = { id: '0', abbr: 'NBA', name: 'NBA' };
  const pair = next ? next.teams : { away: others[0] ?? sample, home: fav ?? others[1] ?? sample };
  const state: GameState = { gameId: 'test', status: 'scheduled', teams: pair, period: 0, clock: 0, score: { away: 0, home: 0 }, periodScores: { away: [], home: [] } };
  return { kind: 'start', key: 'start', state };
}

export type NoticeTest = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'off' } | { kind: 'failed'; why: string };

/** What a test notice that failed says: notices off in the system (macOS refuses, and does not ask
 *  again), or whatever else went wrong. */
export function testOutcome(err: unknown): NoticeTest {
  const why = err instanceof Error ? err.message : String(err);
  return /not allowed|switched off/i.test(why) ? { kind: 'off' } : { kind: 'failed', why };
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
      showNotice(n, this.T).catch((e: unknown) => console.warn('notice not shown', e));
    }
  }
}
