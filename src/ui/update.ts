// Updating: the updater plugin reads latest.json from the newest GitHub release (src-tauri/tauri.conf.json),
// checks its signature, installs it and the app restarts. Checked at start (src/ui/main.ts: a newer
// version is the update screen) and from the settings. latest.json's notes carry the changelog
// (scripts/updater-notes.ts), so the screen can say what changed.

import type { Release } from '../changelog.ts';

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  /** `notes`: the release's, the changelog as JSON (parseNotes). */
  | { kind: 'available'; version: string; notes?: string }
  | { kind: 'installing'; percent: number | undefined }
  /** The check could not reach the release (offline, or GitHub down), or the install failed. */
  | { kind: 'failed'; during: 'check' | 'install' };

type Found = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>;
let found: Found = null;
/** Under `npm run dev` only (src/ui/main.ts &fakeupdate): an update that is not there, to see the screens. */
let fake = false;

/** Under `npm run dev` only: as if `version` were out, with this build's changelog as its notes. */
export async function fakeCheck(set: (s: UpdateState) => void, version: string): Promise<void> {
  const { CHANGELOG } = await import('../changelog.ts');
  // As long as a check over the network takes, so the screen before it is seen too.
  await new Promise((r) => setTimeout(r, 1200));
  fake = true;
  set({ kind: 'available', version, notes: JSON.stringify(CHANGELOG) });
}

export async function checkForUpdate(set: (s: UpdateState) => void): Promise<void> {
  set({ kind: 'checking' });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    found = await check();
    set(found ? { kind: 'available', version: found.version, ...(found.body ? { notes: found.body } : {}) } : { kind: 'latest' });
  } catch (e) {
    console.warn('update check:', e);
    set({ kind: 'failed', during: 'check' });
  }
}

export async function installUpdate(set: (s: UpdateState) => void): Promise<void> {
  if (fake) {
    // Under `npm run dev`: a download that runs and then fails, to see both.
    for (let p = 0; p <= 100; p += 20) { set({ kind: 'installing', percent: p }); await new Promise((r) => setTimeout(r, 300)); }
    set({ kind: 'failed', during: 'install' });
    return;
  }
  if (!found) return;
  let total = 0, got = 0;
  set({ kind: 'installing', percent: undefined });
  try {
    await found.downloadAndInstall((e) => {
      if (e.event === 'Started') total = e.data.contentLength ?? 0;
      if (e.event === 'Progress') { got += e.data.chunkLength; set({ kind: 'installing', percent: total ? Math.min(100, Math.round((got / total) * 100)) : undefined }); }
    });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    console.warn('update install:', e);
    set({ kind: 'failed', during: 'install' });
  }
}

/** The changelog a release's notes carry, or none: notes from before they carried it are plain text. */
export function parseNotes(notes: string | undefined): Release[] {
  try {
    const list: unknown = JSON.parse(notes ?? '');
    const ok = (r: unknown): r is Release => {
      const x = r as Release;
      return typeof x?.version === 'string' && typeof x.date === 'string' && typeof x.title?.en === 'string' && typeof x.title['zh-TW'] === 'string'
        && Array.isArray(x.items?.en) && Array.isArray(x.items['zh-TW']);
    };
    return Array.isArray(list) && list.every(ok) ? list : [];
  } catch { return []; }
}

/** -1, 0 or 1 as `a` is older than, the same as, or newer than `b`: "0.4.10" is newer than "0.4.9". */
function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return Math.sign(d); }
  return 0;
}

/** The releases newer than `current`, newest first: what an update brings, every version skipped included. */
export function newerReleases(releases: readonly Release[], current: string): Release[] {
  return releases.filter((r) => compareVersions(r.version, current) > 0).sort((a, b) => compareVersions(b.version, a.version));
}
