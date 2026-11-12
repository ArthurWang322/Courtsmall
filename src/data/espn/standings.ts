// The standings panel (src/ui/main.ts): this regular season's table for each conference. Stats are read by their
// exact names, never by position or by part of a name: the entries also carry `divisionWinPercent` and
// `leagueWinPercent` ahead of `winPercent`, and `overall` ("9-2") besides wins and losses.

import type { Conference, StandingRow, Standings } from '../../model/types.ts';
import type { StandingsFeed } from './feed-types.ts';
import type { FetchJson } from './fetch.ts';
import { teamRef } from './timeline.ts';

/** The regular season only: without `seasontype` ESPN serves the current part of the season, the preseason in October. */
export const STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?seasontype=2';

export async function loadStandings(get: FetchJson): Promise<Standings> {
  const standings = parseStandings(await get(STANDINGS_URL));
  // An answer with no conference in it (an error body, `{}`) is a failure the user can ask again, not an empty table.
  if (!standings) throw new Error('no standings');
  return standings;
}

type Child = NonNullable<StandingsFeed['children']>[number];
type Entry = NonNullable<NonNullable<Child['standings']>['entries']>[number];

const conferenceOf = (c: Child): Conference | undefined => {
  const of = (s: string | undefined) => (/east/i.test(s ?? '') ? 'east' : /west/i.test(s ?? '') ? 'west' : undefined);
  return of(c.abbreviation) ?? of(c.name);
};

const filled = (s: string | undefined) => (s !== undefined && s.trim() !== '' ? s : undefined);

function rowOf(e: Entry): (Omit<StandingRow, 'rank'> & { seed?: number; winPct: number }) | undefined {
  const t = e.team;
  if (!t?.id || !t.abbreviation) return undefined;
  const stats = e.stats ?? [];
  const named = (name: string) => stats.find((s) => s.name === name);
  const value = (name: string) => { const v = named(name)?.value; return typeof v === 'number' && Number.isFinite(v) ? v : undefined; };
  const shown = (name: string) => filled(named(name)?.displayValue);
  const wins = value('wins'), losses = value('losses'), seed = value('playoffSeed');
  const pct = shown('winPercent'), gb = shown('gamesBehind'), streak = shown('streak');
  return {
    team: teamRef({ id: t.id, abbreviation: t.abbreviation, displayName: t.displayName || t.abbreviation }),
    ...(wins !== undefined ? { wins } : {}), ...(losses !== undefined ? { losses } : {}),
    ...(pct ? { pct } : {}), ...(gb ? { gb } : {}), ...(streak ? { streak } : {}),
    ...(seed !== undefined ? { seed } : {}),
    // A missing win % sorts last.
    winPct: value('winPercent') ?? -1,
  };
}

/** Undefined when `raw` is not an object or has no East or West child; never throws. */
export function parseStandings(raw: unknown): Standings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const children = (raw as StandingsFeed).children;
  if (!Array.isArray(children)) return undefined;
  const out: Partial<Record<Conference, StandingRow[]>> = {};
  let season: string | undefined;
  for (const c of children) {
    const conf = conferenceOf(c ?? {});
    if (!conf || out[conf]) continue;
    season ??= filled(c.standings?.seasonDisplayName);
    const rows = (c.standings?.entries ?? []).map(rowOf).filter((r) => r !== undefined);
    rows.sort((a, b) =>
      (a.seed === undefined ? 1 : 0) - (b.seed === undefined ? 1 : 0)
      || (a.seed ?? 0) - (b.seed ?? 0)
      || b.winPct - a.winPct
      || a.team.abbr.localeCompare(b.team.abbr, 'en'));
    out[conf] = rows.map(({ seed: _seed, winPct: _winPct, ...row }, i) => ({ ...row, rank: i + 1 }));
  }
  if (!out.east && !out.west) return undefined;
  return { ...(season ? { season } : {}), east: out.east ?? [], west: out.west ?? [] };
}
