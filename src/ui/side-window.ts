// What the stats and line score windows share: they animate in (app.css), and on 'side-close' from
// the main window they animate out, then close themselves.

/** How long the leaving animation takes, ms (app.css .leaving). */
export const LEAVE_MS = 380;

export async function closeOnRequest(app: HTMLElement): Promise<void> {
  if (!('__TAURI_INTERNALS__' in window)) return;
  const { listen } = await import('@tauri-apps/api/event');
  await listen('side-close', async () => {
    app.classList.add('leaving');
    await new Promise((r) => setTimeout(r, LEAVE_MS));
    await (await import('@tauri-apps/api/window')).getCurrentWindow().close();
  });
}
