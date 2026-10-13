// M0 step 3: one live game, polled every 10 s for a while. How often does ESPN update, how much does
// each poll cost, and does the light path (status + plays tail) keep up with the full summary?
// Usage: node 03-live-measure.mjs <eventId> [minutes]   Writes JSON lines to fixtures/nba/live-<id>.jsonl
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { get, CACHE_DIR } from './lib.mjs';

const [id, minutes = '20'] = process.argv.slice(2);
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const CORE = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}`;
const out = join(CACHE_DIR, '..', `live-${id}.jsonl`);
let n = 0;
const end = Date.now() + Number(minutes) * 60_000;

while (Date.now() < end) {
  const t = Date.now();
  const st = await get(`${CORE}/status`, { noCache: true });
  const tail = await get(`${CORE}/plays?limit=1&page=999999`, { noCache: true });
  const count = tail.json.count;
  const last = (await get(`${CORE}/plays?limit=1&page=${count}`, { noCache: true })).json.items?.[0];
  // The full summary is ~300-460 KB; fetch it every third poll only, to compare.
  const sum = n++ % 3 === 0 ? await get(`${SITE}/summary?event=${id}`, { noCache: true }) : { json: {}, headers: {} };
  const plays = sum.json.plays ?? [];
  const rec = {
    t: new Date(t).toISOString(),
    state: st.json.type?.name, period: st.json.period, clock: st.json.displayClock, statusBytes: st.bytes,
    coreCount: count, coreLast: last && { seq: last.sequenceNumber, wall: last.wallclock, modified: last.modified, score: `${last.awayScore}-${last.homeScore}` }, coreBytes: tail.bytes,
    summaryBytes: sum.bytes, summaryPlays: plays.length, summaryLast: plays.at(-1)?.sequenceNumber,
    age: sum.headers.age, cc: sum.headers['cache-control'],
  };
  appendFileSync(out, JSON.stringify(rec) + '\n');
  console.log(`${rec.t.slice(11, 19)} ${rec.state} Q${rec.period} ${rec.clock} core=${count}/${rec.coreLast?.seq} ${rec.coreLast?.score} summary=${rec.summaryPlays}/${rec.summaryLast} ${rec.summaryBytes}B`);
  if (st.json.type?.completed) break;
  const wait = t + 10_000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
