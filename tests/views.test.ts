// The glance text. Each case is something a one-second look must get right.

import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n/index.ts';
import { barView, clockText, dotView, lastLine, RUN_MIN, whenText } from '../src/ui/views.ts';
import type { GameState } from '../src/model/types.ts';

const en = STRINGS.en, zh = STRINGS['zh-TW'];
const base: GameState = {
  gameId: '1', status: 'live', period: 4, clock: 422,
  teams: { away: { id: 'a', abbr: 'SA', name: 'Spurs', color: 'c4ced4' }, home: { id: 'h', abbr: 'UTAH', name: 'Jazz', color: '4e008e' } },
  score: { away: 85, home: 112 }, periodScores: { away: [], home: [] },
};

describe('clock', () => {
  // The arena clock switches to tenths in the last minute; "0:45" would hide how close it is.
  it('shows minutes and seconds, then tenths in the last minute', () => {
    expect(clockText(422)).toBe('7:02');
    expect(clockText(60)).toBe('1:00');
    expect(clockText(55.9)).toBe('55.9');
    expect(clockText(0)).toBe('0.0');
  });
});

describe('period', () => {
  it('names quarters and overtimes in both languages', () => {
    expect([1, 4, 5, 6].map(en.period)).toEqual(['Q1', 'Q4', 'OT', '2OT']);
    expect([1, 4, 5, 6].map(zh.period)).toEqual(['第1節', '第4節', '延長', '第2延長']);
  });

  // A break after the second period is halftime, not "End Q2": the wait is 15 minutes, not 2.
  it('says halftime for the break after the second period', () => {
    expect(whenText({ ...base, status: 'break', period: 2 }, en)).toBe('Half');
    expect(whenText({ ...base, status: 'break', period: 1 }, en)).toBe('End Q1');
    expect(whenText({ ...base, status: 'break', period: 3 }, zh)).toBe('第3節結束');
  });

  it('shows the period and clock while live, the result once final', () => {
    expect(whenText(base, en)).toBe('Q4 7:02');
    expect(whenText({ ...base, status: 'final' }, zh)).toBe('終場');
  });
});

describe('last line', () => {
  const basket = { side: 'home' as const, points: 2 as const, period: 4, clock: 422, player: { id: 'p', name: 'Isaiah Collier', short: 'I. Collier' } };

  // The team comes first: a glance at a name alone does not say which side just scored.
  it('names the team, the scorer and the points', () => {
    expect(lastLine({ ...base, lastBasket: basket }, en)).toBe('UTAH I. Collier +2');
    expect(lastLine({ ...base, lastBasket: basket }, zh)).toBe('UTAH I. Collier 得 2 分');
    const { player: _, ...noShooter } = basket;
    expect(lastLine({ ...base, lastBasket: noShooter }, zh)).toBe('UTAH 得 2 分');
  });

  // A 2-0 "run" is every basket; the line only calls out a run once it means momentum.
  it(`mentions a run from ${RUN_MIN} unanswered points, not before`, () => {
    expect(lastLine({ ...base, lastBasket: basket, run: { side: 'home', points: RUN_MIN - 1 } }, en)).toBe('UTAH I. Collier +2');
    expect(lastLine({ ...base, lastBasket: basket, run: { side: 'home', points: 8 } }, en)).toBe('UTAH I. Collier +2 · UTAH 8-0 run');
    expect(lastLine({ ...base, lastBasket: basket, run: { side: 'home', points: 8 } }, zh)).toBe('UTAH I. Collier 得 2 分 · UTAH 連得 8 分');
  });

  it('drops the run once the game is over', () => {
    expect(lastLine({ ...base, status: 'final', lastBasket: basket, run: { side: 'home', points: 8 } }, en)).toBe('UTAH I. Collier +2');
  });
});

describe('possession', () => {
  // The ring marks who has the ball; between periods nobody does, so it must not linger.
  it('rings the dot of the team with the ball while live, and nobody during a break', () => {
    const live = dotView({ ...base, possession: 'away' }, en);
    expect(live.match(/class="dot ball"/g)).toHaveLength(1);
    expect(live.indexOf('dot ball')).toBeLessThan(live.indexOf('85'));
    expect(dotView({ ...base, status: 'break', possession: 'away' }, en)).not.toContain('dot ball');
  });

  it('escapes names from the feed', () => {
    const html = barView({ ...base, lastBasket: { side: 'away', points: 3, period: 4, clock: 1, player: { id: 'x', name: '<b>', short: '<b>' } } }, en);
    expect(html).toContain('SA &lt;b&gt; +3');
  });

  // A replay that looks live misleads; the pill has no room for the word, so it gets a mark.
  it('marks a replay in the dot without the word that would not fit', () => {
    const html = dotView(base, en, 'Replay');
    expect(html).toContain('↺');
    expect(html).toContain('title="Replay"');
  });
});
