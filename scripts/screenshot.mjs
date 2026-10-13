// A screenshot of the dev server at an exact size, for checking layouts the way the desktop
// window shows them. Headless Chrome's window cannot be narrower than 500 px, so the size is set
// through the DevTools protocol instead. Output goes to fixtures/shots/ (not committed).
//
// Usage (with `npm run dev` or `npx tauri dev` running):
//   node scripts/screenshot.mjs "<path and query>" <width> <height> <waitMs> <name> [hover]
// `hover`: move the pointer over the window first (the toolbar shows on hover).
//   node scripts/screenshot.mjs "/?game=401810362&replay&fixture&lang=zh-TW" 360 96 5000 bar

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [path, w, h, wait, name, hover] = process.argv.slice(2);
if (!name) throw new Error('usage: node scripts/screenshot.mjs "<path>" <width> <height> <waitMs> <name>');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9335;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'courtsmall-shot-'))}`, 'about:blank'], { stdio: 'ignore' });
try {
  let targets;
  for (let i = 0; i < 40 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d.result); });
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: `http://localhost:1420${path}` });
  await new Promise((r) => setTimeout(r, Number(wait)));
  if (hover) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Number(w) / 2, y: Number(h) / 2 });
    await new Promise((r) => setTimeout(r, 400));
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  mkdirSync('fixtures/shots', { recursive: true });
  writeFileSync(`fixtures/shots/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`fixtures/shots/${name}.png`);
} finally {
  chrome.kill();
}
process.exit(0);
