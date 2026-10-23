// The glance text. Each case is something a one-second look must get right.

import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/i18n/index.ts';
import { playLinesAt, TIER_PRESET, TOOLBAR_H } from '../src/render/tiers.ts';
import { CHANGELOG } from '../src/changelog.ts';
import { barView, boxView, courtView, periodTable, stackView, updateView, changelogView, clockText, lineScoreView, teamView, controlsView, countdownParts, gamesView, JUMP_MS, leadersTable, noLogo, playLines, SLIDE_MS, pregameView, RUN_MIN, settingsView, whenText } from '../src/ui/views.ts';
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

  // The simple view at its preset size (the maintainer's call, 2026-10-14): the newest, then three
  // before it, newest first; lines not filled yet keep their place so the layout does not jump.
  it('shows the newest play and three before it, newest first, in a window tall enough', () => {
    const p = (n: number) => ({ type: 'rebound' as const, offensive: false, side: 'home' as const, player: { ...collier, short: `P${n}` } });
    const s = { ...base, recentPlays: [p(1), p(2), p(3), p(4)] };
    const html = barView(s, zh, 4);
    expect([...html.matchAll(/class="row play (?:new|old old-\d)">\[UTAH\] (P\d)/g)].map((m) => m[1])).toEqual(['P4', 'P3', 'P2', 'P1']);
    expect(barView({ ...base, recentPlays: [p(1)] }, zh, 4).match(/play old/g)).toHaveLength(3);
    expect(playLinesAt(150)).toBe(4);
    expect(playLinesAt(TIER_PRESET.bar.h - TOOLBAR_H)).toBe(4);
    expect(playLinesAt(100)).toBe(2);
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
    expect([...html.matchAll(/data-tip="([^"]+)"/g)].map((m) => m[1])).toEqual(['簡易模式', '球場模式', '比賽列表', '數據', '設定']);
    expect(html).toContain('data-open="games"');
    expect(html).toContain('data-open="settings"');
  });

  // The way back to the corner only matters once the window has left it; then it comes first, so
  // the buttons people know stay where they were.
  it('offers the way back to the corner only once the window was dragged away', () => {
    expect(controlsView('bar', zh)).not.toContain('data-corner');
    const moved = controlsView('bar', zh, false, true);
    expect([...moved.matchAll(/data-tip="([^"]+)"/g)].map((m) => m[1])).toEqual(['回到右下角', '簡易模式', '球場模式', '比賽列表', '數據', '設定']);
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
    // The game on screen says so in words, not only by its frame; no other card does.
    expect(html.match(/<span class="watching"><i><\/i>觀看中<\/span>/g)).toHaveLength(1);
    expect(html).toMatch(/data-game="l"[^>]*>.*?觀看中/);
    // Picked: the list gives way to that card.
    const picking = gamesView('10/13', [card('f', 'final', 1), card('l', 'live', 2)], zh, () => '', undefined, [], 'f');
    expect(picking).toContain('<div class="panel games picking">');
    expect(picking).toMatch(/class="game picked[^"]*" data-game="f"/);
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
    expect(html).toMatch(/<span>DEN<span class="star">★<\/span><\/span>/);
    expect(html.match(/★/g)).toHaveLength(1);
  });

  it("stars the favourite in the score bug", () => {
    const html = barView(base, en, 1, undefined, [base.teams.home.id]);
    expect(html).toMatch(/<span class="abbr">UTAH<span class="star">★<\/span><\/span>/);
    expect(barView(base, en, 1)).not.toContain('★');
  });
});

describe('settings page', () => {
  const teams = [{ id: '7', abbr: 'DEN', name: 'Denver Nuggets', color: 'fec524' }, { id: '20', abbr: 'PHI', name: 'Philadelphia 76ers', color: 'ed174c' }];
  const settings = { favourites: [] as string[], notify: { start: true, clutch: true }, shortcuts: true, stack: true };

  // One favourite, picked from a drop-down whose first choice is none; the teams by full name.
  it('shows the choice, and when open lists none and every team by full name, the choice marked', () => {
    const closed = settingsView(teams, { ...settings, favourites: ['7'] }, zh);
    expect(closed).toContain('<span>Denver Nuggets</span>');
    expect(closed).toContain('src="https://a.espncdn.com/i/teamlogos/nba/500/den.png"');
    // The favourite's logo also stands faint behind the page; without a favourite there is none.
    expect(closed).toContain('<img class="watermark" data-abbr="DEN"');
    expect(settingsView(teams, settings, zh)).not.toContain('watermark');
    expect(closed).not.toContain('fav-list');
    const open = settingsView(teams, { ...settings, favourites: ['7'] }, zh, true);
    expect([...open.matchAll(/<button class="fav-item( on)?" data-fav-pick="(\d*)">(?:<img [^>]*>)?<span>([^<]*)</g)].map((m) => `${m[3]}${m[1] ? '*' : ''}`))
      .toEqual(['無', 'Denver Nuggets*', 'Philadelphia 76ers']);
    expect(settingsView(teams, settings, zh)).toContain('<span>無</span>');
    // Changes apply as they are made, so the page closes from a ✕, not a Save it would not need.
    expect(settingsView(teams, settings, zh)).toContain('<button class="icon close" data-done aria-label="關閉">✕</button>');
    expect(settingsView(teams, settings, zh)).not.toContain('儲存');
  });

  // A favourite is set before the team list has come: the picker must not say there is none.
  it('reads loading, not none, while the favourite\'s name is still coming', () => {
    expect(settingsView([], { ...settings, favourites: ['7'] }, zh)).toContain('<span>載入中…</span>');
    expect(settingsView([], settings, zh)).toContain('<span>無</span>');
  });

  // Notices are for the favourite's games: with none chosen they cannot be turned on and show
  // unchecked, saying why; once one is chosen, the choices kept from before come back.
  it('disables the notices without a favourite, keeping the choices for when one is picked', () => {
    const boxes = (html: string) => [...html.matchAll(/<input type="checkbox" data-notify="\w+"([^>]*)>/g)].map((m) => m[1]!.trim());
    const none = settingsView(teams, settings, zh);
    expect(boxes(none)).toEqual(['disabled', 'disabled']);
    expect(none).toContain('選擇最愛球隊後，開啟比賽通知設定');
    const fav = settingsView(teams, { ...settings, favourites: ['7'], notify: { start: false, clutch: true } }, zh);
    expect(boxes(fav)).toEqual(['', 'checked']);
    expect(fav).not.toContain('選擇最愛球隊後');
  });

  // One button walks through updating: check, then install only what was found; while it works
  // there is nothing to press twice. No version (a browser under npm run dev): no row at all.
  it('shows the version and one button that checks for an update, then installs it', () => {
    const at = (u: Parameters<typeof settingsView>[7]) => settingsView(teams, settings, zh, false, true, false, '0.2.0', u);
    expect(at({ kind: 'idle' })).toContain('版本 0.2.0');
    expect(at({ kind: 'idle' })).toContain('data-update="check">檢查更新');
    expect(at({ kind: 'checking' })).not.toContain('data-update');
    // No newer release is not a failure: it says so plainly.
    expect(at({ kind: 'latest' })).toContain('此版本為最新版');
    expect(at({ kind: 'available', version: '0.3.0' })).toContain('有新版本 0.3.0');
    expect(at({ kind: 'available', version: '0.3.0' })).toContain('data-update="install">立即更新');
    expect(at({ kind: 'installing', percent: 42 })).toContain('更新中… 42%');
    expect(at({ kind: 'installing', percent: 42 })).not.toContain('data-update');
    expect(at({ kind: 'failed', during: 'check' })).toContain('無法檢查更新，請確認網路連線');
    expect(at({ kind: 'failed', during: 'install' })).toContain('更新失敗，請稍後再試');
    expect(at({ kind: 'failed', during: 'install' })).toContain('data-update="check"');
    expect(settingsView(teams, settings, zh)).not.toContain('class="update"');
  });

  // The keys are only useful if people can find them: each one, in the system's own notation.
  it('lists each shortcut in the system\'s notation, and says when another app has the keys', () => {
    expect(settingsView(teams, settings, zh, false, true)).toContain('<kbd>⌃⌥M</kbd> 切換模式');
    expect(settingsView(teams, settings, zh, false, false)).toContain('<kbd>Ctrl+Alt+H</kbd> 隱藏／顯示');
    expect(settingsView(teams, settings, zh, false, true, true)).toContain('有些按鍵已被其他程式佔用。');
    // Switched off, the keys are given back, so nothing is taken.
    expect(settingsView(teams, { ...settings, shortcuts: false }, zh, false, true, true)).not.toContain('佔用');
  });

  // On or off is one choice of two, so exactly one is ever marked, and it is the one in effect.
  // A press shows whether a notice reached the system, and what to do when the system has them off.
  it('offers a test notice and says how it went', () => {
    expect(settingsView(teams, settings, zh)).toContain('data-notice-test>傳送測試通知</button>');
    expect(settingsView(teams, settings, zh, false, true, false, undefined, undefined, { kind: 'sending' })).toContain('data-notice-test disabled>');
    expect(settingsView(teams, settings, zh, false, true, false, undefined, undefined, { kind: 'sent' })).toContain('已送出');
    expect(settingsView(teams, settings, zh, false, true, false, undefined, undefined, { kind: 'off' })).toContain('系統設定 → 通知 → Courtsmall');
    expect(settingsView(teams, settings, zh, false, true, false, undefined, undefined, { kind: 'failed', why: 'boom' })).toContain('boom');
  });

  // Every feature is a switch (docs/PLAN.md §0): the card stack too, on or off like the shortcuts.
  it('offers the card stack as on or off, the one in effect marked', () => {
    const marked = (html: string) => [...html.matchAll(/data-stack="(on|off)"( checked)?/g)].map((m) => `${m[1]}${m[2] ? '*' : ''}`);
    expect(marked(settingsView(teams, settings, zh))).toEqual(['on*', 'off']);
    expect(marked(settingsView(teams, { ...settings, stack: false }, zh))).toEqual(['on', 'off*']);
    expect(settingsView(teams, settings, zh)).toContain('快速切換比賽');
  });

  it('offers the shortcuts as on or off, the one in effect marked', () => {
    const marked = (html: string) => [...html.matchAll(/data-shortcuts="(on|off)"( checked)?/g)].map((m) => `${m[1]}${m[2] ? '*' : ''}`);
    expect(marked(settingsView(teams, settings, zh))).toEqual(['on*', 'off']);
    expect(marked(settingsView(teams, { ...settings, shortcuts: false }, zh))).toEqual(['on', 'off*']);
  });
});

describe("players' window", () => {
  const line = (id: string, short: string, o: Partial<BoxLine> = {}): BoxLine => ({
    player: { id, name: short, short }, starter: false, dnp: false, min: 20, pts: 10, reb: 5, ast: 3, stl: 1, blk: 0, to: 2,
    fg: { made: 4, att: 9 }, three: { made: 1, att: 4 }, ft: { made: 1, att: 2 }, pf: 3, pm: -2, ...o,
  });
  const box = { away: [line('1', 'D. Fox', { starter: true, pts: 31 }), line('2', 'K. Ellis'), line('3', 'X. Tillman', { dnp: true, min: 0 })], home: [line('9', 'L. Markkanen', { starter: true })] };

  /** What a view shows: the names, then the header's numbers and each player's, the full view's own columns only when open. */
  const shown = (html: string, open: boolean) => ({
    names: [...html.matchAll(/<span class="name">(.*?)<\/span>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '')),
    nums: [...html.matchAll(/<div class="nums">(.*?)<\/div>/g)]
      .map((m) => (open ? m[1]! : m[1]!.replace(/<span class="x[^"]*"[^>]*>.*?<\/span>/g, '')).replace(/<[^>]+>/g, ' ').trim().split(/\s+/)),
  });

  // A player's line reads left to right in the order of the header: minutes, then the six stats.
  it("shows the chosen side's players with minutes and the six stats, those who did not play marked", () => {
    const html = boxView(base.teams, box, 'away', zh);
    expect(shown(html, false).names).toEqual(['球員', 'D. Fox', 'K. Ellis', 'X. Tillman']);
    expect(shown(html, false).nums.slice(0, 2)).toEqual([['時間', '得分', '籃板', '助攻', '抄截', '火鍋', '失誤'], ['20', '31', '5', '3', '1', '0', '2']]);
    expect(shown(html, false).nums[3]).toEqual(['未上場']);
    expect(html).toContain('<div class="row dnp"><span class="name">X. Tillman</span></div>');
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

  // Asked for by a user (2026-10-21): the whole line, the field goals split into twos and threes.
  // The maintainer's calls: no field goals or offensive/defensive rebounds, and the simple view's
  // columns in the simple view's order, so switching moves none of them; the simple view stays as it was until the switch is turned.
  it('shows the full line when switched to it: twos worked out from the field goals, shots made-attempted, plus-minus signed', () => {
    const html = boxView(base.teams, { ...box, away: [line('1', 'D. Fox', { starter: true, pts: 31, pm: 7 }), ...box.away.slice(1)] }, 'away', en, [], new Set(), undefined, true);
    const { names, nums } = shown(html, true);
    expect(names).toEqual(['PLAYER', 'D. Fox', 'K. Ellis', 'X. Tillman']);
    expect(nums[0]).toEqual(['MIN', 'PTS', '2PT', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-']);
    expect(nums[1]).toEqual(['20', '31', '3-5', '1-4', '1-2', '5', '3', '1', '0', '2', '3', '+7']);
    expect(nums[2]!.at(-1)).toBe('-2');
    expect(nums[3]).toEqual(['DNP']);
    // The percentage on hover, to the nearest whole one to fit the column; none for a shot never taken.
    expect(html).toContain('<span class="x shot" data-pct="60%">3-5</span>');
    expect(html).toContain('<span class="x shot" data-pct="25%">1-4</span>');
    expect(boxView(base.teams, { ...box, away: [line('1', 'D. Fox', { ft: { made: 0, att: 0 } })] }, 'away', en, [], new Set(), undefined, true)).toContain('<span class="x">0-0</span>');
    // The line under the starters runs through both halves, the names and the numbers.
    expect(html.match(/<hr class="bench">/g)).toHaveLength(2);
    // The switch is lit in the full view only.
    expect(html).toContain('<button class="mode on" data-box-full role="switch" aria-checked="true">');
    expect(html).toContain('<i class="track t-toggle" data-on="true">');
    expect(boxView(base.teams, box, 'away', en)).toContain('<button class="mode" data-box-full role="switch" aria-checked="false">');
  });

  // The maintainer asked for the full view's columns to slide open and closed (2026-10-21), not the
  // table drawn anew: that needs the same cells in both views, the switch and the table's class aside.
  it('draws the same cells in both views, so switching only opens or closes the full view\'s own', () => {
    const bare = (html: string) => html.replace(/<button class="mode[\s\S]*?<\/button>/, '').replace('<div class="table full">', '<div class="table">');
    expect(bare(boxView(base.teams, box, 'away', zh, [], new Set(['2']), undefined, true))).toBe(bare(boxView(base.teams, box, 'away', zh, [], new Set(['2']))));
  });

  // One control opens and closes the stats: the main window's stats button, not a ✕ of its own.
  it('has no close button of its own, and says so when no game is on or while it loads', () => {
    expect(boxView(base.teams, box, 'away', zh)).not.toContain('data-close');
    expect(boxView(base.teams, box, 'team', zh)).not.toContain('data-close');
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

describe('line score', () => {
  it('lists each period, overtimes too, the totals, the period being played lit, the rest "–"', () => {
    const html = lineScoreView({ ...base, period: 5, periodScores: { away: [20, 22, 25, 18, 4], home: [21, 20, 24, 20, 6] }, score: { away: 89, home: 91 } }, zh);
    const rows = [...html.matchAll(/<div class="lrow[^"]*">(.*?)<\/div>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').trim().split(/\s+/));
    expect(rows).toEqual([['1', '2', '3', '4', 'OT', '總分'], ['SA', '20', '22', '25', '18', '4', '89'], ['UTAH', '21', '20', '24', '20', '6', '91']]);
    expect(html.match(/class="now"/g)).toHaveLength(3);
    const early = lineScoreView({ ...base, period: 2, periodScores: { away: [20, 5], home: [21, 3] }, score: { away: 25, home: 24 } }, zh);
    expect(early.match(/>–</g)).toHaveLength(4);
  });
});

describe('games list close', () => {
  it('closes from a ✕', () => {
    const html = gamesView('10/13', [], zh, () => '');
    expect(html).toContain('<button class="icon close" data-done aria-label="關閉">✕</button>');
    expect(html).not.toContain('完成');
  });
});

describe('team logos', () => {
  // A club ESPN has no NBA logo for (a preseason visitor) must not leave a broken image in the
  // score: once its image has failed, its initial on a disc in its colour stands in.
  it('shows the logo, then the initial once the logo has failed', () => {
    expect(barView(base, en, 1)).toContain('src="https://a.espncdn.com/i/teamlogos/nba/500/utah.png"');
    noLogo.add('UTAH');
    try {
      const html = barView(base, en, 1);
      expect(html).not.toContain('utah.png');
      expect(html).toMatch(/<i class="logo badge" style="background:#\w+">U<\/i>/);
      expect(html).toContain('sa.png');
    } finally { noLogo.delete('UTAH'); }
  });
});

describe('a result in the main window', () => {
  // The line score stays closed for a result, so the main window's points per period must say
  // which period each number is, overtime included.
  it('labels the periods over the points, overtime as OT', () => {
    const s: GameState = { ...base, status: 'final', period: 5, periodScores: { away: [30, 25, 28, 27, 10], home: [28, 27, 25, 30, 8] } };
    const html = barView(s, en, 1, undefined, [], true);
    const head = html.match(/<div class="row period head">(.*?)<\/div>/)![1]!;
    expect([...head.matchAll(/<span class="mono">(.*?)<\/span>/g)].map((m) => m[1])).toEqual(['1', '2', '3', '4', 'OT']);
  });
});

// With a newer version out, the window at start is the update screen (the maintainer, 2026-10-22):
// the two versions, what changed, and updating as the only way on, unless the update fails.
describe('update screen', () => {
  const notes = CHANGELOG.slice(0, 2);
  it('shows the version in hand and the newest, what changed in between, and one button to update', () => {
    const html = updateView('0.4.2', '0.5.0', { kind: 'available', version: '0.5.0' }, notes, zh, 'zh-TW');
    expect(html).toContain('v0.4.2');
    expect(html).toContain('v0.5.0');
    expect(html).toContain(notes[0]!.title['zh-TW']);
    expect(html).toContain(notes[1]!.items['zh-TW'][0]!);
    expect(html.match(/data-update-now/g)).toHaveLength(1);
    // No way past it but updating: no close, no "later".
    expect(html).not.toContain('data-done');
    expect(html).not.toContain('data-update-later');
  });

  it('shows the download as it goes, and once it fails, a retry and the old version for now', () => {
    expect(updateView('0.4.2', '0.5.0', { kind: 'installing', percent: 42 }, notes, zh, 'zh-TW')).toContain('42%');
    expect(updateView('0.4.2', '0.5.0', { kind: 'installing', percent: 42 }, notes, zh, 'zh-TW')).not.toContain('data-update-now');
    // Downloaded and installed: it says it is restarting, nothing left to press.
    const done = updateView('0.4.2', '0.5.0', { kind: 'restarting' }, notes, zh, 'zh-TW');
    expect(done).toContain('重新啟動');
    expect(done).not.toContain('data-update-now');
    const failed = updateView('0.4.2', '0.5.0', { kind: 'failed', during: 'install' }, notes, zh, 'zh-TW');
    expect(failed).toContain('v0.5.0');
    expect(failed).toContain('data-update-now');
    expect(failed).toContain('data-update-later');
  });
});

describe('changelog', () => {
  // What each version brought, so people can see what changed: newest first, only the newest marked
  // as latest, in the reader's language, with a way back to the settings.
  it('lists the versions newest first, the newest marked latest, in the chosen language', () => {
    const html = changelogView(CHANGELOG, zh, 'zh-TW');
    const versions = [...html.matchAll(/<span class="ver">v([\d.]+)<\/span>/g)].map((m) => m[1]!);
    expect(versions).toEqual(CHANGELOG.map((r) => r.version));
    expect(versions).toEqual([...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })));
    expect(html.match(/class="tag">最新</g)).toHaveLength(1);
    expect(html).toContain(CHANGELOG[0]!.title['zh-TW']);
    expect(changelogView(CHANGELOG, en, 'en')).toContain(CHANGELOG[0]!.title.en);
    expect(html).toContain('data-done');
  });

  it('every version says what it brought in both languages', () => {
    for (const r of CHANGELOG) {
      expect(r.items['zh-TW'].length).toBeGreaterThan(0);
      expect(r.items.en).toHaveLength(r.items['zh-TW'].length);
    }
  });

  it('links the changelog and feedback from the foot of the settings', () => {
    const html = settingsView([], { favourites: [], notify: { start: true, clutch: true }, shortcuts: true, stack: true }, zh);
    expect(html).toContain('<div class="links"><a data-open="changelog">更新日誌</a><a data-feedback>回饋與問題回報</a></div>');
  });
});

describe('a new play line', () => {
  // A new line moves every line at once (the older ones down, the bottom one out, the new one in),
  // resumed where it was across redraws, so it reads as one movement; once over, all are plain.
  it('moves all the lines together while new, resumed across redraws, then stays put', () => {
    const s: GameState = { ...base, recentPlays: [{ type: 'rebound', offensive: false, side: 'home' }] };
    const html = barView(s, zh, 4, undefined, [], false, { play: 100, leaving: '[SA] 舊的一行' });
    expect(html).toContain('<div class="bar moving" style="--age:-100ms">');
    // The line pushed out keeps the look of the bottom place as it goes.
    expect(html).toContain('<div class="row play old old-3 leaving">[SA] 舊的一行</div>');
    const done = barView(s, zh, 4, undefined, [], false, { play: SLIDE_MS, leaving: '[SA] 舊的一行' });
    expect(done).toContain('<div class="bar">');
    expect(done).not.toContain('leaving');
    expect(barView(s, zh, 4)).not.toContain('moving');
  });
});

describe('the clock cell at a glance', () => {
  // Green while the clock runs, red while it is stopped (a timeout, a review, between quarters), gold at half time,
  // grey once it is over, nothing before tip-off: a glance says whether the game is on.
  it('marks the clock cell by how the game stands', () => {
    const look = (s: GameState) => barView(s, zh, 1).match(/class="cell clock mono( [\w ]+)?"/)![1]?.replace('stacked', '').trim();
    expect(look(base)).toBe('live');
    expect(look({ ...base, stoppage: 'timeout' })).toBe('paused');
    expect(look({ ...base, status: 'break', period: 2 })).toBe('paused half');
    expect(look({ ...base, status: 'break', period: 1 })).toBe('paused');
    expect(look({ ...base, status: 'final' })).toBe('final');
    expect(look({ ...base, status: 'scheduled' })).toBeUndefined();
  });
});

describe('a stopped clock', () => {
  // "Q3 2:50 · Timeout" on one line ran out of the clock cell: the reason goes under the clock.
  it('puts a timeout or review under the period and clock, not after them', () => {
    const html = barView({ ...base, stoppage: 'timeout' }, zh, 1);
    expect(html).toContain('<span>第4節 7:02</span><small>暫停</small>');
    expect(html).not.toContain('7:02 · 暫停');
    expect(barView(base, zh, 1)).not.toContain('stacked');
  });
});


describe('card stack', () => {
  const card = (id: string, status: GameCard['status'], score: [number, number], start = 0): GameCard => ({
    id, status, start, period: status === 'scheduled' ? 0 : 4, clock: 151, score: { away: score[0], home: score[1] },
    teams: { away: { id: `${id}a`, abbr: `A${id}`, name: id }, home: { id: `${id}h`, abbr: `H${id}`, name: id } },
  });
  const cards = [card('1', 'live', [108, 104]), card('2', 'scheduled', [0, 0]), card('3', 'final', [99, 97])];
  const html = stackView(cards, zh, () => '19:30');
  const strips = [...html.matchAll(/<div class="scard([^"]*)" data-game="(\d)" data-how="(\w+)" style="--depth:(\d+)"><div class="strip">(.*?)<\/div><\/div>/g)]
    .map((m) => ({ cls: m[1], id: m[2], how: m[3], depth: m[4], text: m[5]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));

  // A finished game's table has a column for each period it went to, a dash for points not known, as the
  // line score does: the table is laid out as it will be, whatever the feed has so far.
  it("lays out a finished game's periods, a dash for points not known", () => {
    const g = card('9', 'final', [125, 129]);
    const html = periodTable({ gameId: g.id, status: 'final', teams: g.teams, period: 5, clock: 0, score: g.score, periodScores: { away: [], home: [] } });
    const rows = [...html.matchAll(/<div class="row period[^"]*">(.*?)<\/div>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').trim().split(/\s+/));
    expect(rows[0]).toEqual(['1', '2', '3', '4', 'OT']);
    expect(rows[1]).toEqual(['A9', '–', '–', '–', '–', '–']);
    expect(rows[2]).toEqual(['H9', '–', '–', '–', '–', '–']);
  });

  // Seen with a card for every state (the maintainer, 2026-10-22): a game delayed before tip-off looked
  // started at 0–0 with nothing to say why, and one that went to overtime said less than the main window.
  it("says a game is delayed, without a score before tip-off, and that a final went to overtime, as the main window does", () => {
    const strip = (g: GameCard) => stackView([g], zh, () => '19:30').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const before = strip({ ...card('5', 'delayed', [0, 0]), period: 0 });
    expect(before).toContain('暫停比賽');
    expect(before).not.toContain('0 – 0');
    // Delayed once under way: the score stands.
    const during = strip({ ...card('6', 'delayed', [55, 60]), period: 3 });
    expect(during).toContain('55');
    expect(during).toContain('暫停比賽');
    expect(strip({ ...card('7', 'final', [121, 118]), period: 5 })).toContain('終場/OT');
    expect(strip({ ...card('8', 'final', [130, 128]), period: 6 })).toContain('終場/2OT');
    // The games list says the same.
    const list = gamesView('今天', [{ ...card('5', 'delayed', [0, 0]), period: 0 }, { ...card('7', 'final', [121, 118]), period: 5 }], zh, () => '19:30');
    expect(list).toContain('暫停比賽');
    expect(list).toContain('終場/OT');
    expect(list).not.toMatch(/<b>0<\/b>/);
  });

  // Seen live (DEN @ OKC, 2026-10-23): ESPN's scoreboard and summary said "0.0 - 2nd" while the plays were
  // at 11:08 of the second. A game in progress at 0.0 is ESPN not caught up (the end of a period comes as
  // a break): the period alone, rather than a time that is wrong.
  it("shows only the period of a game in progress whose clock ESPN reports at 0.0", () => {
    const strip = (g: GameCard) => stackView([g], zh, () => '19:30').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const stuck = strip({ ...card('9', 'live', [55, 60]), period: 2, clock: 0 });
    expect(stuck).toContain(zh.period(2));
    expect(stuck).not.toContain('0.0');
    expect(strip({ ...card('9', 'live', [55, 60]), period: 2, clock: 680 })).toContain('11:20');
    expect(gamesView('今天', [{ ...card('9', 'live', [55, 60]), period: 2, clock: 0 }], zh, () => '19:30')).not.toContain('0.0');
  });

  // A card behind shows only a strip above the one in front: enough to tell which game it is and how it stands.
  it('labels each card behind with its teams, its score once started, and its time', () => {
    expect(strips.map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(strips[0]!.text).toContain('A1');
    expect(strips[0]!.text).toContain('H1');
    expect(strips[0]!.text).toContain('108');
    expect(strips[0]!.text).toContain('104');
    expect(strips[0]!.cls).toContain('live');
    expect(strips[1]!.text).toContain('19:30');
    expect(strips[1]!.text).not.toMatch(/\d+ – \d+/);
    // A finished game drawn out is its result, as from the list.
    expect(strips.map((s) => s.how)).toEqual(['live', 'live', 'result']);
    expect(strips.map((s) => s.depth)).toEqual(['1', '2', '3']);
    // The strip that brings them up is not one of them: it is over the main window (src/ui/stack.ts).
    expect(html).not.toContain('edge');
  });
});
