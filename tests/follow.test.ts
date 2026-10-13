// Following: what the window shows without being asked. Each case is a promise to the user.

import { describe, expect, it } from 'vitest';
import { decide, STAY_AFTER_FINAL_MS } from '../src/follow/decide.ts';
import { progress, tension } from '../src/follow/tension.ts';
import type { GameCard } from '../src/model/types.ts';

const T0 = Date.parse('2026-11-01T00:00:00Z');
const team = (id: string) => ({ id, abbr: id.toUpperCase(), name: id });
const game = (id: string, away: string, home: string, o: Partial<GameCard> = {}): GameCard => ({
  id, status: 'scheduled', teams: { away: team(away), home: team(home) }, start: T0, period: 0, clock: 720, score: { away: 0, home: 0 }, ...o,
});
const live = (id: string, away: string, home: string, period: number, clock: number, a: number, h: number) =>
  game(id, away, home, { status: 'live', period, clock, score: { away: a, home: h } });

describe('decide', () => {
  // Switching away from a game someone is watching, even to a closer one, is the one unforgivable move.
  it('never leaves a game in progress', () => {
    const today = [live('1', 'a', 'b', 1, 600, 2, 30), live('2', 'den', 'phi', 4, 10, 100, 100)];
    expect(decide({ now: T0, today, current: { id: '1', status: 'live' } })).toEqual({ kind: 'game', id: '1', why: 'current' });
    expect(decide({ now: T0, favourites: ['den'], today, current: { id: '1', status: 'break' } })).toEqual({ kind: 'game', id: '1', why: 'current' });
  });

  it('keeps a finished game up for a while, then moves on', () => {
    const today = [live('2', 'a', 'b', 4, 10, 90, 91)];
    const current = { id: '1', status: 'final' as const, finalAt: T0 };
    expect(decide({ now: T0 + STAY_AFTER_FINAL_MS - 1, today, current }).kind).toBe('game');
    expect(decide({ now: T0 + STAY_AFTER_FINAL_MS, today, current })).toEqual({ kind: 'game', id: '2', why: 'tense' });
  });

  // Two favourites playing at once: the closer game wins, as without favourites.
  it('follows the tensest of the favourites\' games on', () => {
    const blowout = live('1', 'den', 'a', 4, 60, 80, 120), close = live('2', 'b', 'phx', 4, 60, 101, 100);
    expect(decide({ now: T0, favourites: ['den', 'phx'], today: [blowout, close] })).toEqual({ kind: 'game', id: '2', why: 'team' });
  });

  it("shows the soonest of the favourites' next games when none is on", () => {
    const later = game('3', 'den', 'a', { start: T0 + 8 * 3600_000 }), sooner = game('4', 'b', 'phx', { start: T0 + 2 * 3600_000 });
    expect(decide({ now: T0, favourites: ['den', 'phx'], today: [], teamGames: [later, sooner] })).toEqual({ kind: 'upcoming', game: sooner });
  });

  it("follows the team's game when it is on", () => {
    const today = [live('1', 'a', 'b', 4, 10, 100, 100), live('2', 'den', 'phi', 1, 600, 2, 30)];
    expect(decide({ now: T0, favourites: ['den'], today })).toEqual({ kind: 'game', id: '2', why: 'team' });
  });

  it("shows the team's next game when it is not playing now, today's or another day's", () => {
    const later = game('3', 'den', 'phi', { start: T0 + 5 * 3600_000 });
    const tomorrow = game('4', 'den', 'lal', { start: T0 + 30 * 3600_000 });
    expect(decide({ now: T0, favourites: ['den'], today: [later], teamGames: [tomorrow, later] })).toEqual({ kind: 'upcoming', game: later });
    expect(decide({ now: T0, favourites: ['den'], today: [], teamGames: [tomorrow] })).toEqual({ kind: 'upcoming', game: tomorrow });
  });

  // With a team chosen, other games are not offered on their own: the window is the team's.
  it("does not follow another team's game when the team is off", () => {
    expect(decide({ now: T0, favourites: ['den'], today: [live('1', 'a', 'b', 4, 10, 100, 100)], teamGames: [] })).toEqual({ kind: 'idle' });
  });

  it('without a team, follows the tensest game on, or waits for the next tip-off', () => {
    const blowout = live('1', 'a', 'b', 4, 60, 80, 120), close = live('2', 'c', 'd', 4, 60, 101, 100);
    expect(decide({ now: T0, today: [blowout, close] })).toEqual({ kind: 'game', id: '2', why: 'tense' });
    const next = game('5', 'e', 'f', { start: T0 + 3600_000 });
    expect(decide({ now: T0, today: [game('6', 'g', 'h', { status: 'final' }), next] })).toEqual({ kind: 'idle', next });
  });
});

describe('tension', () => {
  it('rises with the clock and the closeness of the score', () => {
    expect(progress({ period: 1, clock: 720 })).toBe(0);
    expect(progress({ period: 4, clock: 0 })).toBe(1);
    expect(progress({ period: 5, clock: 300 })).toBe(1);
    const early = live('1', 'a', 'b', 1, 600, 10, 10), late = live('2', 'a', 'b', 4, 60, 100, 100), lateBlowout = live('3', 'a', 'b', 4, 60, 80, 110);
    expect(tension(late)).toBeGreaterThan(tension(early));
    expect(tension(late)).toBeGreaterThan(tension(lateBlowout));
    expect(tension(game('4', 'a', 'b'))).toBe(0);
  });
});
