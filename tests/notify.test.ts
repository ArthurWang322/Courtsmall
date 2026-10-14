// Notices interrupt someone at work, so each one has to be earned and sent once.

import { describe, expect, it } from 'vitest';
import { assumedBefore, notices } from '../src/notify/rules.ts';
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

  // The app follows a game only once it is on, so it never sees it scheduled: the schedule saying
  // it was is what makes its first live state a tip-off, and opening mid-game is still no tip-off.
  it('announces the tip-off of a game the schedule last had as not started, from its first state', () => {
    const first = s({ status: 'live', period: 1, clock: 700 });
    expect(notices(assumedBefore(first, true), first, all).map((x) => x.key)).toEqual(['start']);
    expect(notices(assumedBefore(first, false), first, all)).toEqual([]);
  });

  it('respects each switch', () => {
    expect(kinds(s({ status: 'scheduled' }), s({ status: 'live' }), { ...all, start: false })).toEqual([]);
  });
});

describe('settings', () => {
  // Settings saved before favourites had one team to follow; it must not be lost on update.
  it('turns the one team to follow of older settings into the first favourite', () => {
    expect(normalize({ team: '7' }).favourites).toEqual(['7']);
    expect(normalize({ team: '7', favourites: ['9'] }).favourites).toEqual(['9']);
  });

  // Settings saved before the shortcuts existed get them on, like a new install; an off stays off.
  it('turns the shortcuts on for older settings and keeps them off once switched off', () => {
    expect(normalize({ favourites: ['7'] }).shortcuts).toBe(true);
    expect(normalize({ shortcuts: false }).shortcuts).toBe(false);
  });

  it('falls back to the defaults for anything missing or malformed', () => {
    expect(normalize(null)).toEqual(DEFAULTS);
    expect(normalize({ team: 7, notify: { start: 'yes', final: false } })).toEqual({ favourites: [], notify: { start: true, final: false, clutch: true }, shortcuts: true });
    // One favourite: the first valid one is kept.
    expect(normalize({ favourites: [7, '', '7', '9'] }).favourites).toEqual(['7']);
  });
});
