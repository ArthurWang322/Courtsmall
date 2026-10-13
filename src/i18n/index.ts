// UI strings. Traditional Chinese and English; player and team names are never translated.

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
  /** "BOS 10-0 run". */
  run(abbr: string, points: number): string;
  replay: string;
  loading: string;
  noGame: string;
  nextGame(when: string): string;
  offline: string;
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
    run: (abbr, points) => `${abbr} ${points}-0 run`,
    replay: 'Replay',
    loading: 'Loading…',
    noGame: 'No game right now',
    nextGame: (when) => `Next: ${when}`,
    offline: 'Reconnecting…',
  },
  'zh-TW': {
    period: (n) => (n <= 4 ? `第${n}節` : n === 5 ? '延長' : `第${n - 4}延長`),
    half: '中場',
    endOf: (p) => `${p}結束`,
    final: '終場',
    postponed: '延賽',
    cancelled: '取消',
    delayed: '暫停比賽',
    run: (abbr, points) => `${abbr} 連得 ${points} 分`,
    replay: '重播',
    loading: '載入中…',
    noGame: '現在沒有比賽',
    nextGame: (when) => `下一場：${when}`,
    offline: '重新連線中…',
  },
};

export const langOf = (tag: string): Lang => (tag.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en');
