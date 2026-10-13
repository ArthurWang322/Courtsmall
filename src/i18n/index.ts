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
    miss: (p) => (p === 1 ? 'missed free throw' : p === 3 ? 'missed 3' : 'missed shot'),
    block: (n) => ` (${n} block)`,
    foul: (k) => ({ personal: 'foul', shooting: 'shooting foul', offensive: 'offensive foul', technical: 'technical foul', flagrant: 'flagrant foul' })[k],
    turnover: 'turnover',
    steal: (n) => ` (${n} steal)`,
    rebound: (o) => (o ? 'offensive rebound' : 'defensive rebound'),
    substitution: (i, o) => `${i} in for ${o}`,
    stoppage: (k) => (k === 'timeout' ? 'Timeout' : 'Review'),
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
    miss: (p) => (p === 1 ? '罰球不進' : p === 3 ? '三分不進' : '投籃不進'),
    block: (n) => `（${n} 火鍋）`,
    foul: (k) => ({ personal: '犯規', shooting: '投籃犯規', offensive: '進攻犯規', technical: '技術犯規', flagrant: '惡意犯規' })[k],
    turnover: '失誤',
    steal: (n) => `（${n} 抄截）`,
    rebound: (o) => (o ? '進攻籃板' : '防守籃板'),
    substitution: (i, o) => `${i} 換下 ${o}`,
    stoppage: (k) => (k === 'timeout' ? '暫停' : '重播審查'),
    run: (abbr, points) => `${abbr} 連得 ${points} 分`,
    replay: '重播',
    loading: '載入中…',
    noGame: '現在沒有比賽',
    nextGame: (when) => `下一場：${when}`,
    offline: '重新連線中…',
  },
};

export const langOf = (tag: string): Lang => (tag.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en');
