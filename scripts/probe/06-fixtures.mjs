// Saves the test fixtures: for each game in tests/fixtures.ts, the site summary plus the core
// API's plays, as fixtures/nba/game-{id}.json. Not committed.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { get, CACHE_DIR } from './lib.mjs';
import { FIXTURES } from '../../tests/fixtures.ts';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
for (const { id, note } of FIXTURES) {
  const summary = (await get(`${SITE}/summary?event=${id}`)).json;
  const core = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${id}/competitions/${id}/plays?limit=1000`;
  const page = (await get(core)).json;
  if (page.pageCount !== 1) throw new Error(`${id}: ${page.count} plays need more than one page`);
  writeFileSync(join(CACHE_DIR, '..', `game-${id}.json`), JSON.stringify({ summary, plays: page.items }));
  console.log(`${id} ${note}: ${page.items.length} plays`);
}
