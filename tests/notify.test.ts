// Notices interrupt someone at work, so each one has to be earned and sent once.

import { describe, expect, it } from 'vitest';
import { notices } from '../src/notify/rules.ts';
import { DEFAULTS, normalize } from '../src/settings/store.ts';
import type { GameState } from '../src/model/types.ts';

const s = (o: Partial<GameState>): GameState => ({
  gameId: '1', status: 'live', period: 1, clock: 720,
  teams: { away: { id: 'a', abbr: 'SA', name: 'Spurs' }, home: { id: 'h', abbr: 'UTAH', name: 'Jazz' } },
  score: { away: 0, home: 0 }, periodScores: { away: [], home: [] }, ...o,
});
const all = DEFAULTS.notify;
const kinds = (b: GameState | undefined, a: GameState, n = all) => notices(b, a, n).map((x) => x.key);

describe('notices', () => {
  it('announces the tip-off and the final once, on the change', () => {
    expect(kinds(s({ status: 'scheduled' }), s({ status: 'live' }))).toEqual(['start']);
    expect(kinds(s({ status: 'live' }), s({ status: 'live' }))).toEqual([]);
    expect(kinds(s({ status: 'live', period: 4 }), s({ status: 'final', period: 4, score: { away: 100, home: 90 } }))).toEqual(['final']);
  });

  // Opening the app in the third quarter must not claim the game just started.
  it('says nothing about a start or an end that happened before the app saw the game', () => {
    expect(kinds(undefined, s({ status: 'live', period: 3 }))).toEqual([]);
    expect(kinds(undefined, s({ status: 'final' }))).toEqual([]);
  });

  it('calls a close finish once per period, in the fourth and in overtime', () => {
    const close = (period: number, clock: number) => s({ period, clock, score: { away: 100, home: 97 } });
    expect(kinds(close(4, 130), close(4, 119))).toEqual(['clutch:4']);
    expect(kinds(close(4, 119), close(4, 100))).toEqual([]);
    expect(kinds(close(4, 0), close(5, 110))).toEqual(['clutch:5']);
    expect(kinds(close(3, 130), close(3, 100))).toEqual([]);
    expect(kinds(close(4, 130), s({ period: 4, clock: 100, score: { away: 110, home: 97 } }))).toEqual([]);
  });

  it('respects each switch', () => {
    expect(kinds(s({ status: 'scheduled' }), s({ status: 'live' }), { ...all, start: false })).toEqual([]);
  });
});

describe('settings', () => {
  it('falls back to the defaults for anything missing or malformed', () => {
    expect(normalize(null)).toEqual(DEFAULTS);
    expect(normalize({ team: 7, notify: { start: 'yes', final: false } })).toEqual({ notify: { start: true, final: false, clutch: true }, theme: 'system' });
    expect(normalize({ team: '7' }).team).toBe('7');
    expect(normalize({ theme: 'light' }).theme).toBe('light');
    expect(normalize({ theme: 'sepia' }).theme).toBe('system');
  });
});
