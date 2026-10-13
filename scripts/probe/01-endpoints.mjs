// M0 step 1: which NBA endpoints answer, how big, how cached, and with what top-level shape.
import { get, keyPaths } from './lib.mjs';

const LIVE = '/static/json/liveData';
const show = (label, r) => {
  const h = r.headers;
  console.log(`\n## ${label}\n${r.status} ${r.bytes}B ${r.ms}ms ${r.url}`);
  for (const k of ['content-type', 'cache-control', 'access-control-allow-origin', 'last-modified', 'etag', 'age'])
    if (h[k]) console.log(`  ${k}: ${h[k]}`);
};

const sb = await get(`${LIVE}/scoreboard/todaysScoreboard_00.json`, { noCache: true });
show('today scoreboard', sb);
const games = sb.json?.scoreboard?.games ?? [];
console.log(`  gameDate=${sb.json?.scoreboard?.gameDate} games=${games.length}`);
for (const g of games) console.log(`  ${g.gameId} ${g.awayTeam?.teamTricode}@${g.homeTeam?.teamTricode} status=${g.gameStatus} "${g.gameStatusText}"`);

const sched = await get('/static/json/staticData/scheduleLeagueV2.json');
show('season schedule', sched);
const dates = sched.json?.leagueSchedule?.gameDates ?? [];
console.log(`  season=${sched.json?.leagueSchedule?.seasonYear} dates=${dates.length}`);

// Pick the most recent finished game (gameStatus 3) from the schedule for the per-game endpoints.
const done = dates.flatMap((d) => d.games ?? []).filter((g) => g.gameStatus === 3);
const last = done.at(-1);
console.log(`  finished games so far=${done.length} latest=${last?.gameId} ${last?.awayTeam?.teamTricode}@${last?.homeTeam?.teamTricode} ${last?.gameDateTimeUTC}`);
if (!last) process.exit(0);

for (const [label, path] of [
  ['play-by-play', `${LIVE}/playbyplay/playbyplay_${last.gameId}.json`],
  ['boxscore', `${LIVE}/boxscore/boxscore_${last.gameId}.json`],
]) {
  const r = await get(path);
  show(label, r);
  const paths = [...keyPaths(r.json)].filter((p) => p.split('.').length <= 3);
  console.log('  keys: ' + paths.slice(0, 60).join(', '));
}
