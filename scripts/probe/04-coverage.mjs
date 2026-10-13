// M0 step 4: the score check on the games probe 02 did not cover: overtime and the postseason.
// Scans a few dates' scoreboards, picks finished games that went to overtime or were playoffs.
import { get } from './lib.mjs';
import { checkScore } from './check.mjs';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const DATES = process.argv.slice(2).length ? process.argv.slice(2) : [
  '20251105', '20251203', '20260114', '20260211', '20260318', // regular season
  '20260420', '20260503', '20260520', '20260605', '20260614', // postseason
];
const PER_KIND = 4;

const picked = { overtime: [], postseason: [] };
for (const d of DATES) {
  const sb = await get(`${SITE}/scoreboard?dates=${d}`);
  for (const e of sb.json.events ?? []) {
    if (!e.status.type.completed) continue;
    const ot = e.competitions[0].competitors.some((c) => (c.linescores ?? []).length > 4);
    if (ot && picked.overtime.length < PER_KIND) picked.overtime.push([d, e]);
    else if (e.season.type === 3 && picked.postseason.length < PER_KIND) picked.postseason.push([d, e]);
  }
}

let failed = 0;
for (const [kind, list] of Object.entries(picked)) {
  console.log(`\n## ${kind}: ${list.length} games`);
  for (const [d, e] of list) {
    const sum = await get(`${SITE}/summary?event=${e.id}`);
    const r = checkScore(sum.json);
    if (!r.ok) failed++;
    console.log(`${d} ${e.id} ${e.shortName} periods=${r.periods} ${r.ok ? 'OK' : 'MISMATCH'}`);
    if (!r.ok) for (const l of r.lines) console.log('   ' + l);
  }
}
console.log(`\nfailed=${failed}`);
