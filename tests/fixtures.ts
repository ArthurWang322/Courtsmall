// Recorded ESPN games used by the tests. They are not committed (fixtures/ is in .gitignore);
// create them with `node scripts/probe/06-fixtures.mjs`. Missing fixtures skip their tests.

import { existsSync, readFileSync } from 'node:fs';
import type { GameFeed } from '../src/data/espn/feed-types.ts';

// The games docs/PROBE_REPORT.md §3 and §5 checked by hand.
export const FIXTURES: { id: string; note: string }[] = [
  { id: '401914130', note: '2026 preseason, LON @ POR, international team' },
  { id: '401898400', note: '2026 preseason, DAL @ HOU' },
  { id: '401811026', note: '2025-26 regular season, DET @ CHA' },
  { id: '401810723', note: '2025-26 regular season, SA @ NY' },
  { id: '401810362', note: '2025-26 regular season, DEN @ PHI, overtime' },
  { id: '401810376', note: '2025-26 regular season, ORL @ BKN, overtime' },
  { id: '401810380', note: '2025-26 regular season, UTAH @ OKC, overtime' },
  { id: '401810405', note: '2025-26 regular season, PHI @ TOR, overtime' },
  { id: '401810492', note: '2025-26 regular season, BOS @ BKN, double overtime' },
  { id: '401869369', note: '2026 playoffs, TOR @ CLE' },
  { id: '401869387', note: '2026 playoffs, ATL @ NY' },
  { id: '401869395', note: '2026 playoffs, MIN @ DEN' },
  { id: '401869418', note: '2026 playoffs, ORL @ DET' },
  { id: '401859964', note: '2026 playoffs (June 5), NY @ SA' },
];

export const fixturePath = (id: string) => `fixtures/nba/game-${id}.json`;
export const hasFixture = (id: string) => existsSync(fixturePath(id));
export const loadFixture = (id: string): GameFeed => JSON.parse(readFileSync(fixturePath(id), 'utf8')) as GameFeed;
