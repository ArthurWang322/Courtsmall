// The card stack and the games list show a day's games in one order: if the two drifted apart, the
// card next behind the window would not be the game next in the list.

import { describe, expect, it } from 'vitest';
import { backCards, dayOrder, espnDay } from '../src/ui/day-order.ts';
import type { GameCard } from '../src/model/types.ts';

const game = (id: string, status: GameCard['status'], start: number, away = 'a', home = 'h'): GameCard => ({
  id, status, start, period: 0, clock: 0, score: { away: 0, home: 0 },
  teams: { away: { id: away, abbr: away.toUpperCase(), name: away }, home: { id: home, abbr: home.toUpperCase(), name: home } },
});
// Shuffled on purpose: the order comes from the games, not from how ESPN lists them.
const today = [
  game('done', 'final', 1),
  game('later', 'scheduled', 30),
  game('soon', 'scheduled', 20),
  game('on', 'live', 10),
  game('fav-later', 'scheduled', 40, 'fav'),
  game('half', 'break', 5),
];

describe("a day's order", () => {
  it('orders a day as the games list does: on, to come, finished; the favourites first in each; then by tip-off', () => {
    expect(dayOrder(today, ['fav']).map((g) => g.id)).toEqual(['half', 'on', 'fav-later', 'soon', 'later', 'done']);
    // Without a favourite, tip-off alone within each group.
    expect(dayOrder(today, []).map((g) => g.id)).toEqual(['half', 'on', 'soon', 'later', 'fav-later', 'done']);
    // The day as given is left as it was.
    expect(today[0]!.id).toBe('done');
  });

  it("leaves out the game on screen, and keeps all of today when the game on screen is not today's", () => {
    expect(backCards(today, 'soon', ['fav']).map((g) => g.id)).toEqual(['half', 'on', 'fav-later', 'later', 'done']);
    expect(backCards(today, 'yesterday', ['fav'])).toEqual(dayOrder(today, ['fav']));
    expect(backCards(today, undefined, ['fav'])).toEqual(dayOrder(today, ['fav']));
  });

  it('has no cards behind when today has only the game on screen', () => {
    expect(backCards([game('only', 'live', 1)], 'only', [])).toEqual([]);
  });
});

// The card stack holds the other games of the day of the game on screen (the maintainer, 2026-10-22),
// as ESPN and the games list count days: in US Eastern time, whatever the time here.
describe("a game's day", () => {
  it('puts a game on the US Eastern day it is played, as the games list does', () => {
    // 19:30 in New York on 22 October.
    expect(espnDay(Date.parse('2026-10-22T23:30:00Z'))).toBe('20261022');
    // A late game in the west: past midnight in UTC (and in Taipei), still the 22nd in New York.
    expect(espnDay(Date.parse('2026-10-23T02:30:00Z'))).toBe('20261022');
    // The next morning in New York is the next day.
    expect(espnDay(Date.parse('2026-10-23T14:00:00Z'))).toBe('20261023');
  });
});
