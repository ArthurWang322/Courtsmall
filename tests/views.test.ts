// The glance text. Each case is something a one-second look must get right.

import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n/index.ts';
import { barView, boxView, clockText, teamView, controlsView, countdownParts, gamesView, JUMP_MS, leadersTable, playLines, pregameView, RUN_MIN, settingsView, whenText } from '../src/ui/views.ts';
import type { BoxLine, GameCard, GameState, PlayLine, TeamStats } from '../src/model/types.ts';

const en = STRINGS.en, zh = STRINGS['zh-TW'];
/** The newest play line alone, as a one-line bar shows it. */
const lastLine = (s: GameState, T: typeof en) => (playLines(s, T, 1)[0] ?? '').replace(/<span class="run">(.*?)<\/span>/, ' $1');
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
    expect(playLines(s, zh, 2)).toEqual(['[UTAH] I. Collier 防守籃板<span class="run">（[UTAH] 連得 8 分）</span>', '[SA] J. Embiid 三分不進']);
    const html = barView(s, zh, 2);
    expect(html.indexOf('play new')).toBeLessThan(html.indexOf('divider'));
    expect(html.indexOf('divider')).toBeLessThan(html.indexOf('play old'));
    expect(html.slice(html.indexOf('play new'), html.indexOf('divider'))).toContain('防守籃板');
    expect(html.slice(html.indexOf('play old'))).toContain('三分不進');
    // A window too short for two lines keeps the newest and drops the divider.
    expect(playLines(s, zh, 1)).toEqual(['[UTAH] I. Collier 防守籃板<span class="run">（[UTAH] 連得 8 分）</span>']);
    expect(barView(s, zh, 1)).not.toContain('divider');
  });

  // A 2-0 "run" is every basket; the line only calls out a run once it means momentum.
  it(`mentions a run from ${RUN_MIN} unanswered points, not before`, () => {
    expect(lastLine({ ...base, recentPlays: [basket], run: { side: 'home', points: RUN_MIN - 1 } }, en)).toBe('[UTAH] I. Collier +2');
    expect(lastLine({ ...base, recentPlays: [basket], run: { side: 'home', points: 8 } }, en)).toBe('[UTAH] I. Collier +2 ([UTAH] 8-0 run)');
    expect(lastLine({ ...base, recentPlays: [basket], run: { side: 'home', points: 8 } }, zh)).toBe('[UTAH] I. Collier +2 （[UTAH] 連得 8 分）');
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

});

describe('toolbar and games list', () => {
  it('lights the current size in the toolbar and offers the others', () => {
    const html = controlsView('bar', zh);
    expect(html.match(/class="icon on" data-tier="(\w+)"/)![1]).toBe('bar');
    expect([...html.matchAll(/data-tier="(\w+)"/g)].map((m) => m[1])).toEqual(['bar', 'court']);
    // Every button says what it does on hover, in the maintainer's words.
    expect([...html.matchAll(/data-tip="([^"]+)"/g)].map((m) => m[1])).toEqual(['簡易模式', '球場模式', '比賽列表', '球員數據', '設定']);
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
    expect(pregameView(base.teams, start, '09:30', start - 1000, zh, 'court')).toContain('countdown big');
  });
});

describe('favourite team', () => {
  const card = (id: string, away: string, home: string, status: GameCard['status'], start: number): GameCard => ({
    id, status, start, period: 4, clock: 100, score: { away: 90, home: 91 },
    teams: { away: { id: away, abbr: away.toUpperCase(), name: away }, home: { id: home, abbr: home.toUpperCase(), name: home } },
  });

  // Opening the list, the favourite's game is the one to find at a glance.
  it("puts the favourite's game first in its group, starred and lit", () => {
    const html = gamesView('10/13', [card('1', 'a', 'b', 'live', 1), card('2', 'c', 'den', 'live', 2), card('3', 'd', 'e', 'final', 0)], zh, () => '', undefined, ['den']);
    expect([...html.matchAll(/data-game="(\d)"/g)].map((m) => m[1])).toEqual(['2', '1', '3']);
    expect(html).toContain('class="game live fav" data-game="2"');
    expect(html).toMatch(/<span><span class="star">★<\/span>DEN<\/span>/);
    expect(html.match(/★/g)).toHaveLength(1);
  });

  it("stars the favourite in the score bug", () => {
    const html = barView(base, en, 1, undefined, [base.teams.home.id]);
    expect(html).toMatch(/<span class="abbr"><span class="star">★<\/span>UTAH<\/span>/);
    expect(barView(base, en, 1)).not.toContain('★');
  });
});

describe('settings page', () => {
  const teams = [{ id: '7', abbr: 'DEN', name: 'Denver Nuggets', color: 'fec524' }, { id: '20', abbr: 'PHI', name: 'Philadelphia 76ers', color: 'ed174c' }];
  const settings = { favourites: [] as string[], notify: { start: true, final: true, clutch: true } };

  // One favourite, picked from a drop-down whose first choice is none; the teams by full name.
  it('shows the choice, and when open lists none and every team by full name, the choice marked', () => {
    const closed = settingsView(teams, { ...settings, favourites: ['7'] }, zh);
    expect(closed).toContain('<span>Denver Nuggets</span>');
    expect(closed).toContain('background:#fec524');
    expect(closed).not.toContain('fav-list');
    const open = settingsView(teams, { ...settings, favourites: ['7'] }, zh, true);
    expect([...open.matchAll(/<button class="fav-item( on)?" data-fav-pick="(\d*)">([^<]*)</g)].map((m) => `${m[3]}${m[1] ? '*' : ''}`))
      .toEqual(['無（自動跟最緊張的比賽）', 'Denver Nuggets*', 'Philadelphia 76ers']);
    expect(settingsView(teams, settings, zh)).toContain('<span>無（自動跟最緊張的比賽）</span>');
  });
});

describe("players' window", () => {
  const line = (id: string, short: string, o: Partial<BoxLine> = {}): BoxLine => ({
    player: { id, name: short, short }, starter: false, dnp: false, min: 20, pts: 10, reb: 5, ast: 3, stl: 1, blk: 0, to: 2, ...o,
  });
  const box = { away: [line('1', 'D. Fox', { starter: true, pts: 31 }), line('2', 'K. Ellis'), line('3', 'X. Tillman', { dnp: true, min: 0 })], home: [line('9', 'L. Markkanen', { starter: true })] };

  // A player's line reads left to right in the order of the header: minutes, then the six stats.
  it("shows the chosen side's players with minutes and the six stats, those who did not play marked", () => {
    const html = boxView(base.teams, box, 'away', zh);
    const rows = [...html.matchAll(/<div class="row( starter| head-row)?">(.*?)<\/div>/g)].map((m) => m[2]!.replace(/<[^>]+>/g, ' ').trim().split(/\s+/));
    expect(rows[0]).toEqual(['球員', '時間', '得分', '籃板', '助攻', '抄截', '火鍋', '失誤']);
    expect(rows[1]).toEqual(['D.', 'Fox', '20', '31', '5', '3', '1', '0', '2']);
    expect(html).toContain('<div class="row dnp"><span class="name">X. Tillman</span><span class="why">未上場</span></div>');
    expect(html).not.toContain('Markkanen');
    expect(html).toContain('class="side on" data-box-side="away"');
  });

  // The maintainer asked for these (2026-10-14): a line under the starters, a star on who is playing.
  it('draws a line between the starters and the bench, and stars the players on the court', () => {
    const html = boxView(base.teams, box, 'away', zh, [], new Set(['2']));
    expect(html.indexOf('<hr class="bench">')).toBeGreaterThan(html.indexOf('D. Fox'));
    expect(html.indexOf('<hr class="bench">')).toBeLessThan(html.indexOf('K. Ellis'));
    expect(html.match(/class="on-court"/g)).toHaveLength(1);
    expect(html).toContain('<b class="on-court">*</b>K. Ellis');
  });

  it('closes from its own button, and says so when no game is on or while it loads', () => {
    expect(boxView(base.teams, box, 'away', zh)).toContain('data-close');
    expect(boxView(undefined, undefined, 'away', zh)).toContain('目前沒有正在看的比賽');
    expect(boxView(base.teams, undefined, 'away', zh)).toContain('載入中');
  });
});

describe("teams' stats", () => {
  const t = (o: Partial<TeamStats> = {}): TeamStats => ({
    fg: { made: 40, att: 80 }, two: { made: 30, att: 50 }, three: { made: 10, att: 30 }, ft: { made: 15, att: 20 },
    reb: 45, oreb: 10, dreb: 35, ast: 25, stl: 7, blk: 5, to: 12, fouls: 20, fastBreak: 14, paint: 50, largestLead: 9, ...o,
  });
  const html = teamView(base.teams, { away: t({ three: { made: 15, att: 30 }, to: 8 }), home: t() }, zh);
  /** The markup of one stat's row. */
  const row = (label: string) => html.split('<div class="trow"').find((r) => r.includes(`<span class="tlabel">${label}</span>`))!;

  // The maintainer's call (2026-10-14): a percentage's bar is the percentage, the half being 100%;
  // a count's bars compare the two sides.
  it("draws a shooting row's bar as its percentage of the whole half, made-attempted beside it", () => {
    const r = row('三分');
    expect(r).toContain('15-30 · 50%');
    expect(r).toContain('33% · 10-30');
    expect(r).toMatch(/class="bar away" style="width:50\.0%/);
    expect(r).toMatch(/class="bar home" style="width:33\.0%/);
  });

  it("draws a count's bars against each other, the larger as long as the half", () => {
    const r = row('失誤');
    expect(r).toMatch(/class="bar away" style="width:66\.7%/);
    expect(r).toMatch(/class="bar home" style="width:100\.0%/);
  });

  // The fewer turnovers is the better side; everywhere else the more.
  it("brightens the better side's number, the fewer for turnovers", () => {
    expect(row('三分')).toMatch(/<span class="better">15-30/);
    expect(row('失誤')).toMatch(/<span class="better">8<\/span>/);
    expect(row('助攻')).not.toContain('better');
  });
});

