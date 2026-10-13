// The glance text. Each case is something a one-second look must get right.

import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n/index.ts';
import { barView, clockText, dotView, playLines, RUN_MIN, whenText } from '../src/ui/views.ts';
import type { GameState, PlayLine } from '../src/model/types.ts';

const en = STRINGS.en, zh = STRINGS['zh-TW'];
/** The newest play line alone, as a one-line bar shows it. */
const lastLine = (s: GameState, T: typeof en) => playLines(s, T, 1)[0] ?? '';
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
  const collier = { id: 'p', name: 'Isaiah Collier', short: 'I. Collier' };
  const embiid = { id: 'e', name: 'Joel Embiid', short: 'J. Embiid' };
  const basket = { type: 'basket' as const, basket: { side: 'home' as const, points: 2 as const, period: 4, clock: 422, player: collier }, score: base.score };

  // The team comes first: a glance at a name alone does not say which side it was. Same in both
  // languages, "+2" included (the maintainer's call, 2026-10-13).
  it('writes a basket as [team] name +points in both languages', () => {
    expect(lastLine({ ...base, recentPlays: [basket] }, en)).toBe('[UTAH] I. Collier +2');
    expect(lastLine({ ...base, recentPlays: [basket] }, zh)).toBe('[UTAH] I. Collier +2');
    const { player: _, ...noShooter } = basket.basket;
    expect(lastLine({ ...base, recentPlays: [{ ...basket, basket: noShooter }] }, zh)).toBe('[UTAH] +2');
  });

  it('writes fouls, turnovers, rebounds and substitutions the same way', () => {
    const line = (p: PlayLine) => lastLine({ ...base, recentPlays: [p] }, zh);
    expect(line({ type: 'foul', kind: 'shooting', side: 'away', player: embiid })).toBe('[SA] J. Embiid 投籃犯規');
    expect(line({ type: 'turnover', side: 'away', player: embiid, stolenBy: collier })).toBe('[SA] J. Embiid 失誤（I. Collier 抄截）');
    expect(lastLine({ ...base, recentPlays: [{ type: 'turnover', side: 'away', player: embiid, stolenBy: collier }] }, en)).toBe('[SA] J. Embiid turnover (I. Collier steal)');
    expect(line({ type: 'rebound', offensive: true, side: 'home' })).toBe('[UTAH] 進攻籃板');
    expect(line({ type: 'substitution', side: 'home', in: collier, out: embiid })).toBe('[UTAH] I. Collier 換下 J. Embiid');
    expect(lastLine({ ...base, recentPlays: [{ type: 'foul', kind: 'personal', side: 'away', player: embiid }] }, en)).toBe('[SA] J. Embiid foul');
  });

  // The maintainer asked for this (2026-10-13): who missed and who got the rebound, read together.
  // The newest play stays in one place on top; the one before it moves under the divider.
  it('puts the newest play on top and the one before it under the divider', () => {
    const miss = { type: 'miss' as const, points: 3 as const, side: 'away' as const, player: embiid };
    const reb = { type: 'rebound' as const, offensive: false, side: 'home' as const, player: collier };
    const s = { ...base, recentPlays: [miss, reb], run: { side: 'home' as const, points: 8 } };
    expect(playLines(s, zh, 2)).toEqual(['[UTAH] I. Collier 防守籃板 · UTAH 連得 8 分', '[SA] J. Embiid 三分不進']);
    const html = barView(s, zh, 2);
    expect(html.indexOf('play new')).toBeLessThan(html.indexOf('divider'));
    expect(html.indexOf('divider')).toBeLessThan(html.indexOf('play old'));
    expect(html.slice(html.indexOf('play new'), html.indexOf('divider'))).toContain('防守籃板');
    expect(html.slice(html.indexOf('play old'))).toContain('三分不進');
    // A window too short for two lines keeps the newest and drops the divider.
    expect(playLines(s, zh, 1)).toEqual(['[UTAH] I. Collier 防守籃板 · UTAH 連得 8 分']);
    expect(barView(s, zh, 1)).not.toContain('divider');
  });

  // A 2-0 "run" is every basket; the line only calls out a run once it means momentum.
  it(`mentions a run from ${RUN_MIN} unanswered points, not before`, () => {
    expect(lastLine({ ...base, recentPlays: [basket], run: { side: 'home', points: RUN_MIN - 1 } }, en)).toBe('[UTAH] I. Collier +2');
    expect(lastLine({ ...base, recentPlays: [basket], run: { side: 'home', points: 8 } }, en)).toBe('[UTAH] I. Collier +2 · UTAH 8-0 run');
    expect(lastLine({ ...base, recentPlays: [basket], run: { side: 'home', points: 8 } }, zh)).toBe('[UTAH] I. Collier +2 · UTAH 連得 8 分');
  });

  it('drops the run once the game is over', () => {
    expect(lastLine({ ...base, status: 'final', recentPlays: [basket], run: { side: 'home', points: 8 } }, en)).toBe('[UTAH] I. Collier +2');
  });

  // The clock standing still is the question a glance asks; a timeout or review answers it.
  it('says why the clock is stopped, next to the clock', () => {
    expect(whenText({ ...base, stoppage: 'timeout' }, zh)).toBe('第4節 7:02 · 暫停');
    expect(whenText({ ...base, stoppage: 'review' }, en)).toBe('Q4 7:02 · Review');
  });
});

describe('possession', () => {
  // The triangle marks who has the ball; between periods nobody does, so it must not linger.
  it('puts a triangle on the outer side of the team with the ball while live, and none during a break', () => {
    const away = dotView({ ...base, possession: 'away' }, en);
    expect(away.match(/[▶◀]/g)).toEqual(['▶']);
    expect(away.indexOf('▶')).toBeLessThan(away.indexOf('85'));
    const home = dotView({ ...base, possession: 'home' }, en);
    expect(home.match(/[▶◀]/g)).toEqual(['◀']);
    expect(home.indexOf('◀')).toBeGreaterThan(home.indexOf('112'));
    expect(dotView({ ...base, status: 'break', possession: 'away' }, en)).not.toMatch(/[▶◀]/);
  });

  // In the bar the team with the ball has its whole cell framed in its colour, and a triangle.
  it("frames the cell of the team with the ball in the bar's score bug, and nobody's during a break", () => {
    const html = barView({ ...base, possession: 'home' }, en, 1);
    const cells = html.match(/<div class="cell team[^"]*"[^>]*>/g)!;
    expect(cells[0]).toBe('<div class="cell team">');
    expect(cells[1]).toMatch(/^<div class="cell team ball" style="border-color:#[0-9a-f]{6}">$/);
    expect(html.match(/◀/g)).toHaveLength(1);
    expect(barView({ ...base, status: 'break', possession: 'home' }, en, 1)).not.toContain('team ball');
  });

  it('escapes names from the feed', () => {
    const html = barView({ ...base, recentPlays: [{ type: 'foul', kind: 'personal', side: 'away', player: { id: 'x', name: '<b>', short: '<b>' } }] }, en, 1);
    expect(html).toContain('[SA] &lt;b&gt; foul');
  });

  // A replay that looks live misleads; the pill has no room for the word, so it gets a mark.
  it('marks a replay in the dot without the word that would not fit', () => {
    const html = dotView(base, en, 'Replay');
    expect(html).toContain('↺');
    expect(html).toContain('title="Replay"');
  });
});
