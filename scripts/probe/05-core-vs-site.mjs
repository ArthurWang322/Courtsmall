// M0 step 5: are the core API's plays the same as the site summary's, play by play?
// And how late were plays modified after they happened (the `modified` field)?
// Usage: node 05-core-vs-site.mjs <eventId>
import { get } from './lib.mjs';

const id = process.argv[2];
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const CORE = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}`;

const site = (await get(`${SITE}/summary?event=${id}`)).json.plays;
const first = (await get(`${CORE}/plays?limit=1000`)).json;
console.log(`site=${site.length} core count=${first.count} pageSize=${first.pageSize} pageCount=${first.pageCount}`);
const core = [...first.items];
for (let p = 2; p <= first.pageCount; p++) core.push(...(await get(`${CORE}/plays?limit=1000&page=${p}`)).json.items);

const bySeq = new Map(core.map((c) => [c.sequenceNumber, c]));
const fields = ['awayScore', 'homeScore', 'scoringPlay', 'scoreValue', 'wallclock', 'text'];
const diffs = {};
let missing = 0;
for (const s of site) {
  const c = bySeq.get(s.sequenceNumber);
  if (!c) { missing++; continue; }
  const pairs = { ...Object.fromEntries(fields.map((f) => [f, [s[f], c[f]]])), type: [s.type.id, c.type.id], period: [s.period.number, c.period.number], clock: [s.clock.displayValue, c.clock.displayValue], team: [s.team?.id, c.team?.$ref?.match(/teams\/(\d+)/)?.[1]] };
  for (const [f, [a, b]] of Object.entries(pairs)) if (a !== b) (diffs[f] ??= []).push(`${s.sequenceNumber}: ${a} | ${b}`);
}
console.log(`core-only=${core.filter((c) => !site.some((s) => s.sequenceNumber === c.sequenceNumber)).length} site-only=${missing}`);
for (const [f, l] of Object.entries(diffs)) console.log(`  diff ${f}: ${l.length}  e.g. ${l.slice(0, 2).join(' ;; ')}`);

// Order and sequence numbers.
const seqs = core.map((c) => Number(c.sequenceNumber));
console.log(`core in seq order=${seqs.every((v, i) => !i || v > seqs[i - 1])} seq range=${seqs[0]}..${seqs.at(-1)} gaps=${seqs.at(-1) - seqs[0] + 1 - seqs.length}`);

// `modified` is minute precision; lateness = modified - wallclock.
const late = core.map((c) => (Date.parse(c.modified) - Date.parse(c.wallclock)) / 60000).sort((a, b) => a - b);
const q = (f) => late[Math.floor(f * (late.length - 1))].toFixed(1);
console.log(`modified - wallclock (min): p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} max=${q(1)}  over 5 min: ${late.filter((m) => m > 5).length}`);
