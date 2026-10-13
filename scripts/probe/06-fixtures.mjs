// Saves the test fixtures: for each game in tests/fixtures.ts, the site summary plus the core
// API's plays, as fixtures/nba/game-{id}.json, the team list as fixtures/nba/teams.json and one
// day's scoreboard as fixtures/nba/scoreboard.json. Not committed.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { get, CACHE_DIR } from './lib.mjs';
import { FIXTURES } from '../../tests/fixtures.ts';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
// The team list, for the settings page under `npm run dev` with &fixture.
writeFileSync(join(CACHE_DIR, '..', 'teams.json'), JSON.stringify((await get(`${SITE}/teams`)).json));
// A day's scoreboard with overtime games in it, for the games list under `npm run dev` with &fixture.
writeFileSync(join(CACHE_DIR, '..', 'scoreboard.json'), JSON.stringify((await get(`${SITE}/scoreboard?dates=20260107`)).json));
for (const { id, note } of FIXTURES) {
  const summary = (await get(`${SITE}/summary?event=${id}`)).json;
  const core = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}/plays?limit=1000`;
  const page = (await get(core)).json;
  if (page.pageCount !== 1) throw new Error(`${id}: ${page.count} plays need more than one page`);
  writeFileSync(join(CACHE_DIR, '..', `game-${id}.json`), JSON.stringify({ summary, plays: page.items }));
  console.log(`${id} ${note}: ${page.items.length} plays`);
}
