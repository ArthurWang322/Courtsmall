// The glance text. Each case is something a one-second look must get right.

import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n/index.ts';
import { barView, clockText, controlsView, countdownParts, dotView, gamesView, JUMP_MS, leadersTable, playLines, pregameView, RUN_MIN, whenText } from '../src/ui/views.ts';
import type { GameCard, GameState, PlayLine } from '../src/model/types.ts';

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

  it('shows the period and clock while live, the result once final, overtime included', () => {
    expect(whenText(base, en)).toBe('Q4 7:02');
    expect(whenText({ ...base, status: 'final' }, zh)).toBe('終場');
    expect(whenText({ ...base, status: 'final', period: 5 }, zh)).toBe('終場/OT');
    expect(whenText({ ...base, status: 'final', period: 6 }, en)).toBe('Final/2OT');
  });

  // A finished game picked from the list is a result, not a play-by-play: points per period, no plays.
  it('shows a finished game as points per period instead of plays', () => {
    const fin = { ...base, status: 'final' as const, period: 5, periodScores: { away: [32, 28, 30, 23, 12], home: [30, 25, 31, 27, 11] },
      recentPlays: [{ type: 'rebound' as const, offensive: false, side: 'home' as const }] };
    const html = barView(fin, zh, 2, undefined, undefined, true);
    expect(html).not.toContain('防守籃板');
    const rows = [...html.matchAll(/<div class="row period">(.*?)<\/div>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').trim().split(/\s+/));
    expect(rows).toEqual([['SA', '32', '28', '30', '23', '12'], ['UTAH', '30', '25', '31', '27', '11']]);
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
    expect(cells[0]).toMatch(/^<div class="cell team" style="--team:#[0-9a-f]{6}">$/);
    expect(cells[1]).toMatch(/^<div class="cell team ball" style="--team:#([0-9a-f]{6});border-color:#\1">$/);
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

describe('toolbar and games list', () => {
  it('lights the current size in the toolbar and offers the others', () => {
    const html = controlsView('bar', zh);
    expect(html.match(/class="icon on" data-tier="(\w+)"/)![1]).toBe('bar');
    for (const t of ['dot', 'bar', 'court']) expect(html).toContain(`data-tier="${t}"`);
    expect(html).toContain('data-open="games"');
    expect(html).toContain('data-open="settings"');
  });

  // The list answers "what can I watch now": games on first; a finished game can only be replayed.
  it('lists the games on first, then those to come, then the finished ones, which open as results', () => {
    const card = (id: string, status: GameCard['status'], start: number): GameCard => ({
      id, status, start, period: status === 'live' ? 4 : 0, clock: 151, score: { away: 98, home: 101 }, teams: base.teams,
    });
    const html = gamesView('10/13', [card('f', 'final', 1), card('s', 'scheduled', 3), card('l', 'live', 2)], zh, () => '09:30', 'l');
    expect([...html.matchAll(/data-game="(\w)" data-how="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`)).toEqual(['l:live', 's:live', 'f:result']);
    expect(html).toContain('class="game on live" data-game="l"');
    expect(gamesView('10/13', [], zh, () => '')).toContain('這天沒有比賽');
  });
});

describe('score jump', () => {
  // The moment a score changes is the one worth catching from the corner of an eye.
  it('makes a score that just went up jump, resuming across redraws, and stops after JUMP_MS', () => {
    const html = barView(base, en, 1, undefined, undefined, false, { home: 200 });
    expect(html).toContain('<b class="jump" style="animation-delay:-200ms">112</b>');
    expect(html).toContain('<b>85</b>');
    expect(barView(base, en, 1, undefined, undefined, false, { home: JUMP_MS })).not.toContain('jump');
  });
});

describe('leaders', () => {
  // Each side keeps its side of the table: the away leader left of the stat, the home leader right.
  it("lists each side's leader per stat, away on the left and home on the right, a dash where there is none", () => {
    const p = (id: string, short: string) => ({ id, name: short, short });
    const s = { ...base, status: 'final' as const, leaders: { away: { pts: { player: p('1', 'D. Fox'), value: 31 } }, home: { pts: { player: p('2', 'L. Markkanen'), value: 28 } } } };
    const html = leadersTable(s, zh);
    const row = html.match(/<div class="leader">(.*?)<\/div>/)![1]!.replace(/<[^>]+>/g, ' ').trim().split(/\s+/);
    expect(row).toEqual(['D.', 'Fox', '31', '得分', '28', 'L.', 'Markkanen']);
    expect(html.match(/<div class="leader">/g)).toHaveLength(6);
    expect(html).toContain('<span class="who muted">–</span>');
  });

  it('shows them under the result only when asked (a tall window)', () => {
    const fin = { ...base, status: 'final' as const };
    expect(barView(fin, zh, 2, undefined, undefined, true)).not.toContain('class="leaders"');
    expect(barView(fin, zh, 2, undefined, undefined, true, {}, true)).toContain('class="leaders"');
  });
});

describe('countdown', () => {
  it('splits the time left into days, hours, minutes and seconds, and stops at zero', () => {
    expect(countdownParts(((1 * 24 + 2) * 3600 + 3 * 60 + 4) * 1000 + 999)).toEqual({ d: 1, h: 2, m: 3, s: 4 });
    expect(countdownParts(-5000)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });

  // Before tip-off the clock cell says when it starts, and the rest counts down to it.
  it('shows the tip-off in the clock cell and the countdown under it, then "tip-off soon"', () => {
    const start = Date.parse('2026-10-23T01:30:00Z');
    const html = pregameView(base.teams, start, '10/23 09:30', start - (3 * 3600 + 5) * 1000, zh, 'bar');
    expect(html).toContain('<div class="cell clock mono">10/23 09:30</div>');
    const units = [...html.matchAll(/<div class="unit"><b>(\d+)<\/b><span>(.)<\/span>/g)].map((m) => `${m[1]}${m[2]}`);
    expect(units).toEqual(['00天', '03時', '00分', '05秒']);
    expect(pregameView(base.teams, start, '', start + 1000, zh, 'bar')).toContain('即將開賽');
    expect(pregameView(base.teams, start, '09:30', start - 1000, zh, 'dot')).not.toContain('countdown');
  });
});

