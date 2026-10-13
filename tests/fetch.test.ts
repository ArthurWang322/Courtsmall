// The team list comes from `groups` (conferences, divisions, teams): the site API's `teams` sends
// no CORS header, so in the app the drop-down came up empty (docs/PROBE_REPORT.md §12).

import { describe, expect, it } from 'vitest';
import { allTeams, teamColour } from '../src/data/espn/fetch.ts';

describe('allTeams', () => {
  it('reads every team from the conferences and divisions of groups, once each, by abbreviation', async () => {
    const groups = { groups: [
      { children: [{ teams: [{ id: '2', abbreviation: 'BOS', displayName: 'Boston Celtics' }] }, { teams: [{ id: '4', abbreviation: 'CHI', displayName: 'Chicago Bulls' }] }] },
      { children: [{ teams: [{ id: '7', abbreviation: 'DEN', displayName: 'Denver Nuggets' }, { id: '2', abbreviation: 'BOS', displayName: 'Boston Celtics' }] }] },
    ] };
    const urls: string[] = [];
    const teams = await allTeams(async (url) => { urls.push(url); return groups; });
    expect(urls).toEqual(['https://site.api.espn.com/apis/site/v2/sports/basketball/nba/groups']);
    expect(teams.map((t) => t.abbr)).toEqual(['BOS', 'CHI', 'DEN']);
  });

  it("takes a team's colour from its schedule, which a web view can read", async () => {
    expect(await teamColour(async (url) => (url.endsWith('/teams/7/schedule') ? { team: { id: '7', abbreviation: 'DEN', displayName: 'Denver Nuggets', color: '0e2240' }, events: [] } : {}), '7')).toBe('0e2240');
  });
});
