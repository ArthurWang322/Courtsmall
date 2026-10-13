// The requests for one game and for a day's schedule. `get` is injected: the live source counts
// its requests, the app passes a polite fetcher, the tests pass recorded responses.

import type { GameCard, Side, TeamRef } from '../../model/types.ts';
import type { CorePlay, CorePlayPage, GameFeed, Scoreboard, Summary, TeamList, TeamSchedule } from './feed-types.ts';
import { gameStatus, teamRef } from './timeline.ts';

export type FetchJson = (url: string) => Promise<unknown>;

export const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
export const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
export const competition = (id: string) => `${CORE}/events/${id}/competitions/${id}`;

/** Every play of a game, in ESPN's (game) order. */
export async function allPlays(get: FetchJson, id: string): Promise<CorePlay[]> {
  const out: CorePlay[] = [];
  for (let page = 1; ; page++) {
    const res = (await get(`${competition(id)}/plays?limit=1000&page=${page}`)) as CorePlayPage;
    out.push(...res.items);
    if (page >= res.pageCount) return out;
  }
}

export async function loadFeed(get: FetchJson, id: string): Promise<GameFeed> {
  const summary = (await get(`${SITE}/summary?event=${id}`)) as Summary;
  return { summary, plays: await allPlays(get, id) };
}

/** A day's games. `date` is "YYYYMMDD" as ESPN counts days (US time); omitted, ESPN's today. */
export async function dayGames(get: FetchJson, date?: string): Promise<GameCard[]> {
  const sb = (await get(`${SITE}/scoreboard${date ? `?dates=${date}` : ''}`)) as Scoreboard;
  return sb.events.map((e) => {
    const teams = {} as GameCard['teams'];
    const score = { away: 0, home: 0 };
    for (const c of e.competitions[0]?.competitors ?? []) {
      teams[c.homeAway as Side] = teamRef(c.team);
      score[c.homeAway as Side] = Number(c.score ?? 0);
    }
    return { id: e.id, status: gameStatus(e.status.type.name), teams, start: Date.parse(e.date), period: e.status.period, clock: e.status.clock, score };
  });
}

/** The league's teams, with their colours. */
export async function allTeams(get: FetchJson): Promise<TeamRef[]> {
  const list = (await get(`${SITE}/teams`)) as TeamList;
  return (list.sports[0]?.leagues[0]?.teams ?? []).map((t) => teamRef(t.team)).sort((a, b) => a.abbr.localeCompare(b.abbr));
}

/**
 * One team's games this season. Without `seasonType` ESPN returns the current part of the season
 * only (the preseason in October); 2 is the regular season, 3 the playoffs.
 */
export async function teamGames(get: FetchJson, teamId: string, seasonType?: 2 | 3): Promise<GameCard[]> {
  const sc = (await get(`${SITE}/teams/${teamId}/schedule${seasonType ? `?seasontype=${seasonType}` : ''}`)) as TeamSchedule;
  return sc.events.map((e) => {
    const comp = e.competitions[0]!;
    const teams = {} as GameCard['teams'];
    const score = { away: 0, home: 0 };
    for (const c of comp.competitors) {
      teams[c.homeAway as Side] = teamRef(c.team);
      score[c.homeAway as Side] = typeof c.score === 'object' ? c.score.value : Number(c.score ?? 0);
    }
    return { id: e.id, status: gameStatus(comp.status.type.name), teams, start: Date.parse(e.date), period: comp.status.period, clock: comp.status.clock, score };
  });
}

