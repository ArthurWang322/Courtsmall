// M0 step 2: ESPN's site API. Does one finished game carry enough play-by-play to rebuild the
// official score? Checks the plays' running score against the header's final and per-quarter lines.
import { get, keyPaths } from './lib.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const date = process.argv[2] ?? '20261012';

const sb = await get(`${ESPN}/scoreboard?dates=${date}`);
console.log(`scoreboard ${date}: ${sb.status} ${sb.bytes}B cache-control=${sb.headers['cache-control']}`);
const events = sb.json.events ?? [];
for (const e of events) console.log(`  ${e.id} ${e.shortName} ${e.status.type.name} ${e.status.type.detail}`);
const ev = events.find((e) => e.status.type.completed);
if (!ev) { console.log('no finished game on this date'); process.exit(0); }

const sum = await get(`${ESPN}/summary?event=${ev.id}`);
const j = sum.json;
console.log(`\nsummary ${ev.id}: ${sum.status} ${sum.bytes}B cache-control=${sum.headers['cache-control']}`);
console.log('top-level: ' + Object.keys(j).join(', '));
console.log('play keys: ' + [...keyPaths(j.plays ?? [])].join(', '));

const plays = j.plays ?? [];
console.log(`\nplays=${plays.length}`);
const types = {};
for (const p of plays) types[p.type?.text] = (types[p.type?.text] ?? 0) + 1;
console.log('play types: ' + Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', '));
for (const p of plays.slice(0, 3).concat(plays.slice(-2))) console.log('  ' + JSON.stringify(p).slice(0, 400));

// The check: running score in plays vs the official header.
const comps = j.header.competitions[0].competitors;
const byHA = Object.fromEntries(comps.map((c) => [c.homeAway, c]));
const last = plays.at(-1);
const official = { away: Number(byHA.away.score), home: Number(byHA.home.score) };
const fromPlays = { away: last?.awayScore, home: last?.homeScore };
console.log(`\nfinal official=${JSON.stringify(official)} last play=${JSON.stringify(fromPlays)}`);

// Per-quarter: score at the last play of each period, differenced.
const atEnd = {};
for (const p of plays) atEnd[p.period.number] = { away: p.awayScore, home: p.homeScore };
let prev = { away: 0, home: 0 };
for (const side of ['away', 'home']) {
  const lines = (byHA[side].linescores ?? []).map((l) => Number(l.displayValue ?? l.value));
  prev = { away: 0, home: 0 };
  const mine = Object.keys(atEnd).sort((a, b) => a - b).map((q) => { const d = atEnd[q][side] - prev[side]; prev = atEnd[q]; return d; });
  console.log(`  ${side} ${byHA[side].team.abbreviation} official=${lines.join(',')} from plays=${mine.join(',')} ${lines.join() === mine.join() ? 'OK' : 'MISMATCH'}`);
}

// Scoring plays: does scoreValue sum to the final?
const sumScore = { away: 0, home: 0 };
for (const p of plays) if (p.scoringPlay) sumScore[p.team?.id === byHA.home.team.id ? 'home' : 'away'] += p.scoreValue ?? 0;
console.log(`  sum of scoreValue=${JSON.stringify(sumScore)}`);
console.log(`  plays with wallclock=${plays.filter((p) => p.wallclock).length} with coordinate=${plays.filter((p) => p.coordinate).length}`);
