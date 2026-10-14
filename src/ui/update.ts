// Updating from the settings: the updater plugin reads latest.json from the newest GitHub release
// (src-tauri/tauri.conf.json), checks its signature, installs it and the app restarts. Nothing is
// checked until the button is pressed.

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'available'; version: string }
  | { kind: 'installing'; percent: number | undefined }
  | { kind: 'failed' };

type Found = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>;
let found: Found = null;

export async function checkForUpdate(set: (s: UpdateState) => void): Promise<void> {
  set({ kind: 'checking' });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    found = await check();
    set(found ? { kind: 'available', version: found.version } : { kind: 'latest' });
  } catch (e) {
    console.warn('update check:', e);
    set({ kind: 'failed' });
  }
}

export async function installUpdate(set: (s: UpdateState) => void): Promise<void> {
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
    set({ kind: 'failed' });
  }
}
