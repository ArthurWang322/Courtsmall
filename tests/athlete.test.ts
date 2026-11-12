// The player card's data (src/data/espn/athlete.ts), from a trimmed real overview (Jokić, 2026-11-11). The card is
// only right if each number lands under its own label whatever order ESPN sends the columns in, the games come
// newest first, and a score reads from the player's side — at a neutral site too.

import { describe, expect, it } from 'vitest';
import { athleteUrl, loadPlayerCard, parseOverview } from '../src/data/espn/athlete.ts';
import type { AthleteOverview } from '../src/data/espn/feed-types.ts';

const NOW = Date.parse('2026-11-11T02:00:00Z');

const jokic = (): AthleteOverview => ({
  statistics: {
    names: ['gamesPlayed', 'avgMinutes', 'fieldGoalPct', 'threePointPct', 'freeThrowPct', 'avgRebounds', 'avgAssists', 'avgBlocks', 'avgSteals', 'avgFouls', 'avgTurnovers', 'avgPoints'],
    splits: [
      { displayName: 'Regular Season', stats: ['9', '36.2', '48.8', '22.5', '89.7', '10.8', '9.1', '1.2', '1.9', '2.9', '3.2', '23.1'] },
      { displayName: 'Career', stats: ['819', '32.0', '56.0', '36.0', '82.5', '11.1', '7.5', '0.7', '1.3', '2.7', '3.0', '22.2'] },
    ],
  },
  gameLog: {
    statistics: [{
      names: ['minutes', 'fieldGoalPct', 'threePointPct', 'freeThrowPct', 'totalRebounds', 'assists', 'blocks', 'steals', 'fouls', 'turnovers', 'points'],
      // Not in date order, so the order has to come from the dates.
      events: [
        { eventId: '401909931', stats: ['30', '68.4', '0.0', '85.7', '10', '11', '0', '3', '3', '2', '32'] },
        { eventId: '401909286', stats: ['37', '61.5', '0.0', '100.0', '7', '10', '0', '3', '2', '5', '18'] },
        { eventId: '401909957', stats: ['39', '52.4', '20.0', '100.0', '16', '9', '2', '1', '4', '3', '25'] },
        { eventId: '401909918', stats: ['36', '45.5', '28.6', '100.0', '9', '8', '1', '4', '3', '2', '26'] },
        { eventId: '401909938', stats: ['36', '35.0', '33.3', '100.0', '13', '8', '1', '1', '1', '1', '19'] },
      ],
    }],
    events: {
      401909286: { id: '401909286', gameDate: '2026-10-31T02:00:00.000+00:00', atVs: '@', gameResult: 'W', opponent: { id: '21', abbreviation: 'PHX' }, team: { id: '7' }, homeTeamId: '21', awayTeamId: '7', homeTeamScore: '120', awayTeamScore: '127' },
      401909918: { id: '401909918', gameDate: '2026-11-03T02:00:00.000+00:00', atVs: 'vs', gameResult: 'L', opponent: { id: '22', abbreviation: 'POR' }, team: { id: '7' }, homeTeamId: '7', awayTeamId: '22', homeTeamScore: '110', awayTeamScore: '118' },
      401909931: { id: '401909931', gameDate: '2026-11-05T02:00:00.000+00:00', atVs: 'vs', gameResult: 'W', opponent: { id: '28', abbreviation: 'TOR' }, team: { id: '7' }, homeTeamId: '7', awayTeamId: '28', homeTeamScore: '128', awayTeamScore: '109' },
      // The NBA Mexico City Game: "vs", yet Denver is the away side.
      401909938: { id: '401909938', gameDate: '2026-11-07T22:00:00.000+00:00', atVs: 'vs', gameResult: 'W', opponent: { id: '11', abbreviation: 'IND' }, team: { id: '7' }, homeTeamId: '11', awayTeamId: '7', homeTeamScore: '102', awayTeamScore: '114' },
      401909957: { id: '401909957', gameDate: '2026-11-10T01:30:00.000+00:00', atVs: '@', gameResult: 'L', opponent: { id: '10', abbreviation: 'HOU' }, team: { id: '7' }, homeTeamId: '10', awayTeamId: '7', homeTeamScore: '110', awayTeamScore: '100' },
    },
  },
});

/** A game log of `n` games, one a day back from `last`, for the cases where only the count and dates matter. */
function log(n: number, last: Date): AthleteOverview['gameLog'] {
  const ids = Array.from({ length: n }, (_, i) => String(100 + i));
  return {
    statistics: [{ names: ['points'], events: ids.map((id) => ({ eventId: id, stats: ['10'] })) }],
    events: Object.fromEntries(ids.map((id, i) => [id, { id, gameDate: new Date(last.getTime() - i * 86_400_000).toISOString(), atVs: 'vs', team: { id: '1' }, homeTeamId: '1', awayTeamId: '2' }])),
  };
}

describe('player card: season', () => {
  it("reads this regular season's averages under their own names", () => {
    expect(parseOverview(jokic(), NOW).season).toEqual({
      gp: 9, min: 36.2, pts: 23.1, reb: 10.8, ast: 9.1, stl: 1.9, blk: 1.2, to: 3.2, fgPct: 48.8, threePct: 22.5, ftPct: 89.7,
    });
  });

  // ESPN's names are not in the order of its labels; a column moved must not move a number under another label.
  it('gives the same card whatever order the columns come in', () => {
    const raw = jokic();
    const order = [11, 3, 0, 7, 5, 1, 9, 2, 10, 4, 8, 6];
    const s = raw.statistics!;
    raw.statistics = { names: order.map((i) => s.names![i]!), splits: s.splits!.map((sp) => ({ ...sp, stats: order.map((i) => sp.stats![i]!) })) };
    const g = raw.gameLog!.statistics![0]!;
    const gOrder = [10, 0, 4, 1, 5, 2, 6, 3, 7, 9, 8];
    raw.gameLog!.statistics = [{ names: gOrder.map((i) => g.names![i]!), events: g.events!.map((e) => ({ ...e, stats: gOrder.map((i) => e.stats![i]!) })) }];
    expect(parseOverview(raw, NOW)).toEqual(parseOverview(jokic(), NOW));
  });

  // Seen live (2026-11-11): a player with two games this season whose overview has only the Career split.
  it('keeps this season\'s games when ESPN has no regular-season split yet', () => {
    const raw = jokic();
    raw.statistics!.splits = raw.statistics!.splits!.filter((s) => s.displayName === 'Career');
    const card = parseOverview(raw, NOW);
    expect([card.season, card.stale, card.games.length]).toEqual([undefined, false, 5]);
  });

  it('has no season without a regular-season split or with no game played', () => {
    const raw = jokic();
    raw.statistics!.splits = raw.statistics!.splits!.filter((s) => s.displayName !== 'Regular Season');
    expect(parseOverview(raw, NOW).season).toBeUndefined();
    const none = jokic();
    none.statistics!.splits![0]!.stats![0] = '0';
    expect(parseOverview(none, NOW).season).toBeUndefined();
  });

  // Number('') is 0: a blank cell would show 0.0 where ESPN has nothing.
  it('leaves blank and non-numeric values out instead of reading them as 0', () => {
    const raw = jokic();
    raw.statistics!.splits![0]!.stats![1] = '';
    raw.statistics!.splits![0]!.stats![11] = ' ';
    raw.statistics!.splits![0]!.stats![5] = '--';
    const season = parseOverview(raw, NOW).season!;
    expect([season.min, season.pts, season.reb]).toEqual([undefined, undefined, undefined]);
    expect(season.ast).toBe(9.1);
  });
});

describe('player card: recent games', () => {
  it('lists the games newest first, each from the side of the player', () => {
    const { games } = parseOverview(jokic(), NOW);
    expect(games.map((g) => `${g.at} ${g.opp} ${g.result} ${g.own}-${g.oppScore}`)).toEqual([
      '@ HOU L 100-110', 'vs IND W 114-102', 'vs TOR W 128-109', 'vs POR L 110-118', '@ PHX W 127-120',
    ]);
    expect(games[0]).toEqual({
      id: '401909957', date: Date.parse('2026-11-10T01:30:00Z'), at: '@', opp: 'HOU', result: 'L', own: 100, oppScore: 110,
      min: 39, pts: 25, reb: 16, ast: 9, stl: 1, blk: 2, to: 3, fgPct: 52.4, threePct: 20, ftPct: 100,
    });
  });

  // At a neutral site ESPN says "vs" while listing the player's team as away: "vs" must not make it the home score.
  it("takes the player's score at a neutral site from the team ids, keeping ESPN's \"vs\"", () => {
    const ind = parseOverview(jokic(), NOW).games.find((g) => g.opp === 'IND')!;
    expect([ind.at, ind.own, ind.oppScore]).toEqual(['vs', 114, 102]);
  });

  it('finds the side from the opponent when the team is missing, and gives no score when neither is there', () => {
    const raw = jokic();
    delete raw.gameLog!.events!['401909957']!.team;
    expect(parseOverview(raw, NOW).games[0]).toMatchObject({ own: 100, oppScore: 110 });
    delete raw.gameLog!.events!['401909957']!.opponent;
    const g = parseOverview(raw, NOW).games[0]!;
    expect([g.own, g.oppScore, g.opp]).toEqual([undefined, undefined, '']);
  });

  it('keeps five, drops games it cannot place, and counts a game listed twice once', () => {
    expect(parseOverview({ gameLog: log(7, new Date(2026, 10, 10)) }, NOW).games).toHaveLength(5);
    const raw = jokic();
    const block = raw.gameLog!.statistics![0]!;
    block.events!.push({ eventId: '999', stats: block.events![0]!.stats! });
    raw.gameLog!.statistics!.push({ names: block.names!, events: [block.events![0]!] });
    raw.gameLog!.events!['401909286']!.gameDate = 'not a date';
    expect(parseOverview(raw, NOW).games.map((g) => g.id)).toEqual(['401909957', '401909938', '401909931', '401909918']);
  });

  it('never throws on missing blocks', () => {
    expect(parseOverview({}, NOW)).toEqual({ games: [], stale: false });
    expect(parseOverview({ statistics: {} }, NOW).season).toBeUndefined();
    expect(parseOverview({ gameLog: { events: jokic().gameLog!.events! } }, NOW).games).toEqual([]);
    const short = jokic();
    short.gameLog!.statistics![0]!.events![2]!.stats = ['39'];
    const g = parseOverview(short, NOW).games[0]!;
    expect([g.min, g.pts, g.ftPct]).toEqual([39, undefined, undefined]);
  });
});

describe('player card: an earlier season', () => {
  // The overview has no season year: a player with no game this season has last season's split and games.
  it("drops the season and marks the games stale when the newest is from last season", () => {
    const raw = jokic();
    raw.gameLog = log(3, new Date(2026, 4, 12));
    const card = parseOverview(raw, NOW);
    expect([card.season, card.stale]).toEqual([undefined, true]);
    raw.gameLog = log(3, new Date(2026, 10, 10));
    expect(parseOverview(raw, NOW)).toMatchObject({ stale: false, season: { gp: 9 } });
  });

  it('starts a season in September', () => {
    const now = new Date(2026, 9, 1).getTime();
    expect(parseOverview({ gameLog: log(1, new Date(2026, 8, 1)) }, now).stale).toBe(false);
    expect(parseOverview({ gameLog: log(1, new Date(2026, 7, 31)) }, now).stale).toBe(true);
  });
});

describe('player card: request', () => {
  it('asks the overview of that athlete and fails when the request fails', async () => {
    const asked: string[] = [];
    const card = await loadPlayerCard(async (url) => { asked.push(url); return jokic(); }, '3112335', NOW);
    expect(asked).toEqual([athleteUrl('3112335')]);
    expect(athleteUrl('3112335')).toBe('https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/3112335/overview');
    expect(card.season?.gp).toBe(9);
    await expect(loadPlayerCard(async () => { throw new Error('404'); }, '1', NOW)).rejects.toThrow('404');
  });
});
