// A screenshot of the dev server at an exact size, for checking layouts the way the desktop
// window shows them. Headless Chrome's window cannot be narrower than 500 px, so the size is set
// through the DevTools protocol instead. Output goes to fixtures/shots/ (not committed).
//
// Usage (with `npm run dev` or `npx tauri dev` running):
//   node scripts/screenshot.mjs "<path and query>" <width> <height> <waitMs> <name> [hover|click:<selector>]
// `hover`: move the pointer over the window first; `hover:<selector>`: over that element.
// `click:<selector>[ >> <selector>...]`: click those elements in turn, a second and a half apart.
// `flight[:skip]`: wait for a shot in the air on the court (after skipping `skip` of them), then
// take 18 frames 120 ms apart as <name>-00.png ... <name>-17.png.
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
  if (hover?.startsWith('click:')) {
    // Several clicks in turn: click:<a> >> <b>
    for (const sel of hover.slice(6).split('>>').map((x) => x.trim())) {
      await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})?.click()` });
      await new Promise((r) => setTimeout(r, 1500));
    }
  } else if (hover) {
    // `hover` alone: the middle of the window; `hover:<selector>`: the middle of that element.
    let x = Number(w) / 2, y = Number(h) / 2;
    if (hover.startsWith('hover:')) {
      const r = await send('Runtime.evaluate', { expression: `JSON.stringify(document.querySelector(${JSON.stringify(hover.slice(6))})?.getBoundingClientRect())`, returnByValue: true });
      const box = JSON.parse(r.result.value ?? 'null');
      if (box) { x = box.x + box.width / 2; y = box.y + box.height / 2; }
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await new Promise((r) => setTimeout(r, 400));
  }
  mkdirSync('fixtures/shots', { recursive: true });
  const shoot = async (file) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`fixtures/shots/${file}.png`, Buffer.from(data, 'base64'));
  };
  if (hover?.startsWith('flight')) {
    const skip = Number(hover.split(':')[1] ?? 0);
    let seen = 0, prev = false;
    const until = Date.now() + 120_000;
    while (Date.now() < until) {
      const r = await send('Runtime.evaluate', { expression: `!!document.querySelector('.court .flights .shooter')`, returnByValue: true });
      if (r.result.value && !prev && seen++ >= skip) break;
      prev = r.result.value;
      await new Promise((res) => setTimeout(res, 30));
    }
    for (let i = 0; i < 18; i++) { await shoot(`${name}-${String(i).padStart(2, '0')}`); await new Promise((res) => setTimeout(res, 120)); }
    console.log(`fixtures/shots/${name}-00..17.png`);
  } else {
    await shoot(name);
    console.log(`fixtures/shots/${name}.png`);
  }
} finally {
  chrome.kill();
}
process.exit(0);
