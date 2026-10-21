// UI strings. Traditional Chinese and English; player and team names are never translated.

import type { FoulKind, StoppageKind } from '../model/types.ts';

export type Lang = 'en' | 'zh-TW';

export interface Strings {
  /** 1-4 quarters, 5 = first overtime. */
  period(n: number): string;
  half: string;
  endOf(period: string): string;
  final: string;
  postponed: string;
  cancelled: string;
  delayed: string;
  /** After "[UTAH] I. Collier": the points of a basket, "+2" in every language. */
  /** A missed shot worth `points`: free throw, two, three. */
  miss(points: number): string;
  /** Appended to a miss that was blocked. */
  block(name: string): string;
  foul(kind: FoulKind): string;
  turnover: string;
  /** Appended to a turnover, with its own leading space where the language uses one. */
  steal(name: string): string;
  rebound(offensive: boolean): string;
  /** "[UTAH] A in for B". */
  substitution(inName: string, outName: string): string;
  stoppage(kind: StoppageKind): string;
  /** "([BOS] 10-0 run)", in brackets: it ends the newest play's line. */
  run(abbr: string, points: number): string;
  replay: string;
  loading: string;
  noGame: string;
  nextGame(when: string): string;
  offline: string;
  /** Notices. `line` is "SA 100 – 97 UTAH". */
  tipOff: string;
  clutchNotice(when: string, line: string): string;
  /** The team's next game: "Today 19:30", "Fri 10/23 09:30". */
  today: string;
  tomorrow: string;
  /** Settings. */
  chooseTeam: string;
  noFavourite: string;
  notifyStart: string;
  notifyClutch: string;
  /** What counts as a close finish, under its checkbox. */
  notifyClutchHint: string;
  /** The shortcuts' switch, and what each does (src/ui/shortcuts.ts). */
  shortcuts: string;
  shortcut: { mode: string; stats: string; hide: string };
  /** Shown when another app already has the keys. */
  shortcutsTaken: string;
  shortcutsOn: string;
  shortcutsOff: string;
  /** The changelog (src/changelog.ts) and the feedback link, at the foot of the settings. */
  changelog: { title: string; intro: string; latest: string };
  feedback: string;
  notifyNeedsFavourite: string;
  /** The version and updating, at the foot of the settings (src/ui/update.ts). */
  update: { version: (v: string) => string; check: string; checking: string; latest: string; available: (v: string) => string; install: string; installing: (pct: number | undefined) => string; checkFailed: string; installFailed: string };
  close: string;
  /** The game on screen, marked in the games list. */
  watching: string;
  /** The line score's total column. */
  lineTotal: string;
  /** The toolbar's tips, one per button. */
  tip: { bar: string; court: string; games: string; box: string; settings: string; corner: string };
  /** The players' panel. */
  box: { player: string; min: string; dnp: string; noGame: string; team: string; full: string };
  /** The full view's own columns' labels (the others are T.box.min and T.stat). */
  boxFull: { two: string; three: string; ft: string; pf: string; pm: string };
  /** Team stats' labels. */
  teamStat: { fg: string; two: string; three: string; ft: string; reb: string; ast: string; stl: string; blk: string; to: string; fouls: string; fastBreak: string; paint: string; largestLead: string };
  noGames: string;
  prevDay: string;
  nextDay: string;
  /** Short names of the leader stats. */
  stat(key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'to'): string;
  /** The countdown to tip-off: unit labels, and what shows once it reaches zero. */
  units: { d: string; h: string; m: string; s: string };
  tipOffSoon: string;
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    period: (n) => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`),
    half: 'Half',
    endOf: (p) => `End ${p}`,
    final: 'Final',
    postponed: 'Postponed',
    cancelled: 'Cancelled',
    delayed: 'Delayed',
    miss: (p) => (p === 1 ? 'missed free throw' : p === 3 ? 'missed 3' : 'missed shot'),
    block: (n) => ` (${n} block)`,
    foul: (k) => ({ personal: 'foul', shooting: 'shooting foul', offensive: 'offensive foul', technical: 'technical foul', flagrant: 'flagrant foul' })[k],
    turnover: 'turnover',
    steal: (n) => ` (${n} steal)`,
    rebound: (o) => (o ? 'offensive rebound' : 'defensive rebound'),
    substitution: (i, o) => `${i} in for ${o}`,
    stoppage: (k) => (k === 'timeout' ? 'Timeout' : 'Review'),
    run: (abbr, points) => `([${abbr}] ${points}-0 run)`,
    replay: 'Replay',
    loading: 'Loading…',
    noGame: 'No game right now',
    nextGame: (when) => `Next: ${when}`,
    offline: 'Reconnecting…',
    tipOff: 'Tip-off',
    clutchNotice: (w, l) => `${w}, ${l}`,
    today: 'Today',
    tomorrow: 'Tomorrow',
    chooseTeam: 'Favourite team',
    noFavourite: 'None',
    notifyStart: 'Notify at tip-off',
    notifyClutch: 'Notify in a close finish',
    notifyClutchHint: '(the last 2 minutes and within 5 points)',
    shortcuts: 'Keyboard shortcuts, from any app',
    shortcut: { mode: 'simple / court', stats: 'stats', hide: 'hide / show' },
    shortcutsTaken: 'Some keys are taken by another app.',
    shortcutsOn: 'On',
    shortcutsOff: 'Off',
    changelog: { title: 'Changelog', intro: "What is new in Courtsmall, version by version.", latest: 'Latest' },
    feedback: 'Feedback and bug reports',
    notifyNeedsFavourite: 'Choose a favourite team to get notices for its games.',
    update: {
      version: (v) => `Version ${v}`, check: 'Check for updates', checking: 'Checking…', latest: 'This is the latest version',
      available: (v) => `Version ${v} is out`, install: 'Update now',
      installing: (p) => (p === undefined ? 'Updating…' : `Updating… ${p}%`),
      checkFailed: 'Could not check. Are you online?', installFailed: 'Could not update. Try again later.',
    },
    close: 'Close',
    watching: 'Watching',
    lineTotal: 'T',
    tip: { bar: 'Simple', court: 'Court', games: 'Games', box: 'Stats', settings: 'Settings', corner: 'Back to the corner' },
    box: { player: 'PLAYER', min: 'MIN', dnp: 'DNP', noGame: 'No game on screen', team: 'Team stats', full: 'Full' },
    boxFull: { two: '2PT', three: '3PT', ft: 'FT', pf: 'PF', pm: '+/-' },
    teamStat: { fg: 'Field goals', two: '2-pointers', three: '3-pointers', ft: 'Free throws', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', to: 'Turnovers', fouls: 'Fouls', fastBreak: 'Fast break pts', paint: 'Points in paint', largestLead: 'Largest lead' },
    noGames: 'No games this day',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    stat: (k) => ({ pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', to: 'TO' })[k],
    units: { d: 'DAYS', h: 'HRS', m: 'MIN', s: 'SEC' },
    tipOffSoon: 'Tip-off soon',
  },
  'zh-TW': {
    period: (n) => (n <= 4 ? `第${n}節` : n === 5 ? '延長' : `第${n - 4}延長`),
    half: '中場',
    endOf: (p) => `${p}結束`,
    final: '終場',
    postponed: '延賽',
    cancelled: '取消',
    delayed: '暫停比賽',
    miss: (p) => (p === 1 ? '罰球不進' : p === 3 ? '三分不進' : '投籃不進'),
    block: (n) => `（${n} 火鍋）`,
    foul: (k) => ({ personal: '犯規', shooting: '投籃犯規', offensive: '進攻犯規', technical: '技術犯規', flagrant: '惡意犯規' })[k],
    turnover: '失誤',
    steal: (n) => `（${n} 抄截）`,
    rebound: (o) => (o ? '進攻籃板' : '防守籃板'),
    substitution: (i, o) => `${i} 換下 ${o}`,
    stoppage: (k) => (k === 'timeout' ? '暫停' : '重播審查'),
    run: (abbr, points) => `（[${abbr}] 連得 ${points} 分）`,
    replay: '重播',
    loading: '載入中…',
    noGame: '現在沒有比賽',
    nextGame: (when) => `下一場：${when}`,
    offline: '重新連線中…',
    tipOff: '開賽了',
    clutchNotice: (w, l) => `${w} ${l}`,
    today: '今天',
    tomorrow: '明天',
    chooseTeam: '最愛球隊',
    noFavourite: '無',
    notifyStart: '開賽時通知',
    notifyClutch: '關鍵時刻通知',
    notifyClutchHint: '（最後 2 分鐘且差距 5 分內）',
    shortcuts: '快捷鍵（在任何程式裡都能用）',
    shortcut: { mode: '切換模式', stats: '數據', hide: '隱藏／顯示' },
    shortcutsTaken: '有些按鍵已被其他程式佔用。',
    shortcutsOn: '開啟',
    shortcutsOff: '關閉',
    changelog: { title: '更新日誌', intro: '查看 Courtsmall 每個版本的新功能與改進。', latest: '最新' },
    feedback: '回饋與問題回報',
    notifyNeedsFavourite: '選擇最愛球隊後，開啟比賽通知設定',
    update: {
      version: (v) => `版本 ${v}`, check: '檢查更新', checking: '檢查中…', latest: '此版本為最新版',
      available: (v) => `有新版本 ${v}`, install: '立即更新',
      installing: (p) => (p === undefined ? '更新中…' : `更新中… ${p}%`),
      checkFailed: '無法檢查更新，請確認網路連線', installFailed: '更新失敗，請稍後再試',
    },
    close: '關閉',
    watching: '觀看中',
    lineTotal: '總分',
    tip: { bar: '簡易模式', court: '球場模式', games: '比賽列表', box: '數據', settings: '設定', corner: '回到右下角' },
    box: { player: '球員', min: '時間', dnp: '未上場', noGame: '目前沒有正在看的比賽', team: '團隊數據', full: '詳細' },
    boxFull: { two: '兩分', three: '三分', ft: '罰球', pf: '犯規', pm: '+/-' },
    teamStat: { fg: '投籃', two: '兩分', three: '三分', ft: '罰球', reb: '籃板', ast: '助攻', stl: '抄截', blk: '火鍋', to: '失誤', fouls: '犯規', fastBreak: '快攻得分', paint: '禁區得分', largestLead: '最大領先' },
    noGames: '這天沒有比賽',
    prevDay: '前一天',
    nextDay: '後一天',
    stat: (k) => ({ pts: '得分', reb: '籃板', ast: '助攻', stl: '抄截', blk: '火鍋', to: '失誤' })[k],
    units: { d: '天', h: '時', m: '分', s: '秒' },
    tipOffSoon: '即將開賽',
  },
};

export const langOf = (tag: string): Lang => (tag.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en');
