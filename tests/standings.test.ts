// The standings (src/data/espn/standings.ts), from a trimmed real answer (2026-11-11, `?seasontype=2`). The table is
// only right if each team sits at ESPN's rank whatever order the entries come in (worst first, as seen), and each
// value is the stat it says — the entries also carry a division and a league win % ahead of the real one.

import { describe, expect, it } from 'vitest';
import { loadStandings, parseStandings, STANDINGS_URL } from '../src/data/espn/standings.ts';

type Stat = { name: string; type: string; value?: number; displayValue: string };
interface Line { id: string; abbr: string; name: string; seed?: number; w: number; l: number; wp: number; pct: string; div: string; gb: string; strk: string; l10: string }

/** An entry as ESPN sends it, decoys first, as in the real answer. */
const entry = (t: Line) => ({
  team: { id: t.id, abbreviation: t.abbr, displayName: t.name },
  stats: [
    { name: 'divisionWinPercent', type: 'divisionwinpercent', value: Number(t.div), displayValue: t.div },
    { name: 'gamesBehind', type: 'gamesbehind', value: t.gb === '-' ? 0 : Number(t.gb), displayValue: t.gb },
    { name: 'leagueWinPercent', type: 'leaguewinpercent', value: 0.111, displayValue: '0.111' },
    { name: 'losses', type: 'losses', value: t.l, displayValue: String(t.l) },
    ...(t.seed !== undefined ? [{ name: 'playoffSeed', type: 'playoffseed', value: t.seed, displayValue: String(t.seed) }] : []),
    { name: 'streak', type: 'streak', value: 0, displayValue: t.strk },
    { name: 'winPercent', type: 'winpercent', value: t.wp, displayValue: t.pct },
    { name: 'wins', type: 'wins', value: t.w, displayValue: String(t.w) },
    { name: 'gamesAhead', type: 'gamesahead', value: 0, displayValue: '-' },
    { name: 'overall', type: 'total', displayValue: `${t.w + 1}-${t.l}` },
    { name: 'Last Ten Games', type: 'lasttengames', displayValue: t.l10 },
  ] as Stat[],
});

const EAST: Line[] = [
  { id: '15', abbr: 'MIL', name: 'Milwaukee Bucks', seed: 15, w: 1, l: 10, wp: 0.0909, pct: '.091', div: '0.333', gb: '8', strk: 'L7', l10: '1-9' },
  { id: '20', abbr: 'PHI', name: 'Philadelphia 76ers', seed: 2, w: 9, l: 3, wp: 0.75, pct: '.750', div: '0.667', gb: '0.5', strk: 'L1', l10: '7-3' },
  { id: '2', abbr: 'BOS', name: 'Boston Celtics', seed: 1, w: 9, l: 2, wp: 0.8182, pct: '.818', div: '1.000', gb: '-', strk: 'W4', l10: '9-1' },
];
const WEST: Line[] = [
  { id: '26', abbr: 'UTAH', name: 'Utah Jazz', seed: 15, w: 1, l: 10, wp: 0.0909, pct: '.091', div: '0.000', gb: '8.5', strk: 'L9', l10: '1-9' },
  { id: '24', abbr: 'SA', name: 'San Antonio Spurs', seed: 2, w: 9, l: 2, wp: 0.8182, pct: '.818', div: '0.667', gb: '0.5', strk: 'W9', l10: '9-1' },
  { id: '13', abbr: 'LAL', name: 'Los Angeles Lakers', seed: 1, w: 10, l: 2, wp: 0.8333, pct: '.833', div: '0.800', gb: '-', strk: 'W6', l10: '8-2' },
];
const child = (name: string, abbreviation: string, lines: Line[]) =>
  ({ name, abbreviation, standings: { seasonDisplayName: '2026-27', entries: lines.map(entry) } });
const raw = () => ({ children: [child('Eastern Conference', 'East', EAST), child('Western Conference', 'West', WEST)] });

describe('standings', () => {
  it("ranks each conference by ESPN's seed, not by the order the entries come in", () => {
    const s = parseStandings(raw())!;
    expect(s.season).toBe('2026-27');
    expect(s.east.map((r) => `${r.rank} ${r.team.abbr}`)).toEqual(['1 BOS', '2 PHI', '3 MIL']);
    expect(s.west.map((r) => `${r.rank} ${r.team.abbr}`)).toEqual(['1 LAL', '2 SA', '3 UTAH']);
  });

  // The division win % (1.000) and `overall` (10-2) come first; a loose match would show them.
  it('reads each value from its own stat, not a look-alike', () => {
    expect(parseStandings(raw())!.east[0]).toEqual({
      team: { id: '2', abbr: 'BOS', name: 'Boston Celtics' }, rank: 1,
      wins: 9, losses: 2, pct: '.818', gb: '-', streak: 'W4',
    });
  });

  it('gives the same table whatever order the stats come in', () => {
    const shuffled = raw();
    for (const c of shuffled.children) for (const e of c.standings.entries) e.stats.reverse();
    expect(parseStandings(shuffled)).toEqual(parseStandings(raw()));
  });

  it('leaves out what is missing or blank, and drops a team it cannot name', () => {
    const r = raw();
    const bos = r.children[0]!.standings.entries[2]!;
    bos.stats = bos.stats.filter((s) => s.name !== 'streak').map((s) => (s.name === 'gamesBehind' ? { ...s, displayValue: ' ' } : s));
    r.children[0]!.standings.entries[0]!.team.abbreviation = '';
    const east = parseStandings(r)!.east;
    expect(east.map((x) => x.team.abbr)).toEqual(['BOS', 'PHI']);
    expect([east[0]!.streak, east[0]!.gb, east[0]!.pct]).toEqual([undefined, undefined, '.818']);
  });

  // Unseeded teams (not seen yet; perhaps before a season starts) go after the seeded ones, by win % then name;
  // equal seeds fall to win %, and a missing win % goes last.
  it('orders teams without a seed after those with one', () => {
    const lines: Line[] = [
      { ...EAST[0]!, seed: undefined, abbr: 'AAA', id: 'a', wp: 0.5 },
      { ...EAST[0]!, seed: undefined, abbr: 'ZZZ', id: 'z', wp: 0.9 },
      { ...EAST[0]!, seed: undefined, abbr: 'BBB', id: 'b', wp: 0.5 },
      { ...EAST[0]!, seed: 1, abbr: 'LOW', id: 'l', wp: 0.1 },
      { ...EAST[0]!, seed: 1, abbr: 'HIG', id: 'h', wp: 0.6 },
    ];
    const r = { children: [child('Eastern Conference', 'East', lines)] };
    const noPct = r.children[0]!.standings.entries[0]!;
    noPct.stats = noPct.stats.filter((s) => s.name !== 'winPercent');
    expect(parseStandings(r)!.east.map((x) => x.team.abbr)).toEqual(['HIG', 'LOW', 'ZZZ', 'BBB', 'AAA']);
  });

  it('keeps one conference when the other is missing, and gives nothing for an answer with neither', () => {
    const s = parseStandings({ children: [child('Eastern Conference', 'East', EAST), { name: 'Other', abbreviation: 'X' }] })!;
    expect([s.east.length, s.west]).toEqual([3, []]);
    // Found by name when the abbreviation is not East/West.
    expect(parseStandings({ children: [child('Western Conference', 'W', WEST)] })!.west).toHaveLength(3);
    for (const bad of [{}, null, [], 'x', { children: [] }, { children: [{ name: 'Other' }] }]) expect(parseStandings(bad)).toBeUndefined();
  });

  it('asks the regular season and fails on an answer without standings', async () => {
    const asked: string[] = [];
    const s = await loadStandings(async (url) => { asked.push(url); return raw(); });
    expect(asked).toEqual([STANDINGS_URL]);
    expect(STANDINGS_URL).toContain('seasontype=2');
    expect(s.east[0]!.team.abbr).toBe('BOS');
    await expect(loadStandings(async () => ({}))).rejects.toThrow('no standings');
    await expect(loadStandings(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  });
});
