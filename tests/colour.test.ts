// A team dot nobody can see, or two dots nobody can tell apart, defeat the glance. Colours are
// ESPN's (fixtures/nba/teams.json); these values are copied from that list.

import { describe, expect, it } from 'vitest';
import { BACKGROUND, CLASH_DISTANCE, contrast, gameColours, MIN_CONTRAST, oklabDistance, visibleColour } from '../src/render/colour.ts';

const BKN = { id: '17', abbr: 'BKN', name: 'Brooklyn Nets', color: '000000', alternateColor: 'ffffff' };
const NO = { id: '3', abbr: 'NO', name: 'New Orleans Pelicans', color: '0a2240', alternateColor: 'b4975a' };
const ATL = { id: '1', abbr: 'ATL', name: 'Atlanta Hawks', color: 'c8102e', alternateColor: 'fdb927' };
const CHI = { id: '4', abbr: 'CHI', name: 'Chicago Bulls', color: 'ce1141', alternateColor: '000000' };
const BOS = { id: '2', abbr: 'BOS', name: 'Boston Celtics', color: '008348', alternateColor: 'ffffff' };

describe('visibleColour', () => {
  it('keeps a first colour that shows', () => {
    expect(visibleColour(ATL)).toBe('c8102e');
  });

  it('switches a first colour that vanishes on the dark background to the second', () => {
    expect(visibleColour(BKN)).toBe('ffffff');
    expect(visibleColour(NO)).toBe('b4975a');
  });

  it('lightens when neither colour shows, and the result does show', () => {
    const c = visibleColour({ color: '0a0a20', alternateColor: '101010' });
    expect(contrast(c, BACKGROUND)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});

describe('gameColours', () => {
  const GS = { id: '9', abbr: 'GS', name: 'Golden State Warriors', color: 'fdb927', alternateColor: '1d428a' };
  const LAL = { id: '13', abbr: 'LAL', name: 'Los Angeles Lakers', color: '552583', alternateColor: 'fdb927' };
  const DET = { id: '8', abbr: 'DET', name: 'Detroit Pistons', color: '1d428a', alternateColor: 'c8102e' };

  // Each team in the colour people know it by (the maintainer, 2026-11-12: Boston green, not its white).
  it('gives both sides their first colour when those can be told apart', () => {
    expect(gameColours({ away: BOS, home: ATL })).toEqual({ away: '008348', home: 'c8102e' });
    expect(gameColours({ away: ATL, home: BOS })).toEqual({ away: 'c8102e', home: '008348' });
  });

  // A colour too dark for the background is lightened, keeping its hue: the Lakers stay purple.
  it('lightens a dark colour rather than giving it up', () => {
    const c = gameColours({ away: GS, home: LAL });
    expect(contrast(c.home, BACKGROUND)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(oklabDistance(c.home, '552583')).toBeLessThan(0.2);
    // The Warriors keep their gold: far enough from that purple.
    expect(c.away).toBe('fdb927');
  });

  // Two reds: the visitors change to their second colour, unless they are the favourite.
  it('changes one side of a clash to its second colour, and never the favourite', () => {
    expect(oklabDistance('c8102e', 'ce1141')).toBeLessThan(CLASH_DISTANCE);
    expect(gameColours({ away: ATL, home: CHI })).toEqual({ away: 'fdb927', home: 'ce1141' });
    const fav = gameColours({ away: ATL, home: CHI }, '1');
    expect(fav.away).toBe('c8102e');
    expect(oklabDistance(fav.away, fav.home)).toBeGreaterThanOrEqual(CLASH_DISTANCE);
    // A navy favourite against Memphis: Memphis's second colour (navy too) clashes as well, so it takes the spare.
    const MEM = { id: '29', abbr: 'MEM', name: 'Memphis Grizzlies', color: '5d76a9', alternateColor: '12173f' };
    const DEN = { id: '7', abbr: 'DEN', name: 'Denver Nuggets', color: '0e2240', alternateColor: 'fec524' };
    expect(gameColours({ away: MEM, home: DEN }, '7').away).toBe('9aa3b2');
    // Blue and red: no clash, so Detroit keeps its blue (lightened to show), not its red.
    expect(oklabDistance(gameColours({ away: DET, home: CHI }).away, '1d428a')).toBeLessThan(0.2);
  });
});

describe('on a light background', () => {
  const light = 'f4f5f7';
  const GS = { id: '9', abbr: 'GS', name: 'Golden State Warriors', color: 'fdb927', alternateColor: '1d428a' };

  // The checks take any background: what vanishes flips with it, black shows on light, gold does not.
  it('keeps a dark first colour and moves a pale one off a light background', () => {
    expect(visibleColour(BKN, light)).toBe('000000');
    expect(visibleColour(GS, light)).toBe('1d428a');
    const c = visibleColour({ color: 'f0f0e0', alternateColor: 'fafafa' }, light);
    expect(contrast(c, light)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});
