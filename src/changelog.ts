// What each version brought, newest first, for the changelog in the settings (src/ui/views.ts
// changelogView). Only what a user notices, a few words a line: one title and a few lines a version, in both languages.

import type { Lang } from './i18n/index.ts';

export interface Release {
  version: string;
  /** The day it came out, YYYY-MM-DD. */
  date: string;
  title: Record<Lang, string>;
  items: Record<Lang, string[]>;
}

export const CHANGELOG: readonly Release[] = [
  {
    version: '0.5.0',
    date: '2026-10-22',
    title: { 'zh-TW': '快速切換比賽', en: 'Quick game switching' },
    items: {
      'zh-TW': ['新增卡片疊：摸視窗上緣，叫出同一天的其他比賽', '點一張卡片就換場', '設定裡可以關掉', '比賽列表標示延遲與延長賽', '修正 macOS 系統通知不會跳出', '設定新增測試通知按鈕', '打開時有新版本會提醒更新'],
      en: ["New card stack: touch the window's top edge for the day's other games", 'Pick a card to switch to that game', 'Can be switched off in the settings', 'The games list shows delays and overtime', 'Fixed: system notices never showing on macOS', 'A test notice button in the settings', 'A newer version is offered at start'],
    },
  },
  {
    version: '0.4.3',
    date: '2026-10-21',
    title: { 'zh-TW': '詳細數據', en: 'Full box score' },
    items: {
      'zh-TW': ['數據表新增簡易／詳細切換', '詳細：兩分、三分、罰球、犯規、+/-', '滑過投籃數字顯示命中率'],
      en: ['Stats: switch between simple and full', 'Full: twos, threes, free throws, fouls, +/-', 'Shooting percentage on hover'],
    },
  },
  {
    version: '0.4.2',
    date: '2026-10-15',
    title: { 'zh-TW': '比賽列表優化', en: 'Games list polish' },
    items: {
      'zh-TW': ['卡片懸停浮起', '標示觀看中的比賽', '切換比賽的轉場更順', '主隊用主色、客隊用副色', '修正 Windows 數據表人名被擠掉'],
      en: ['Cards lift on hover', 'The game on screen is marked', 'A smoother switch to a game', 'Home in first colours, visitors in second', 'Fixed: names squeezed out on Windows'],
    },
  },
  {
    version: '0.4.1',
    date: '2026-10-15',
    title: { 'zh-TW': '比分即時更新修正', en: 'Live score fix' },
    items: {
      'zh-TW': ['修正比賽進度落後，例如顯示舊的中場畫面'],
      en: ['Fixed: a game could show an old moment, such as half time'],
    },
  },
  {
    version: '0.4.0',
    date: '2026-10-15',
    title: { 'zh-TW': 'NBA 風格球場', en: 'An NBA-style court' },
    items: {
      'zh-TW': [
        '球場改為 NBA 風格，套用主場配色',
        '節次時間以燈號顯示比賽狀態',
        '文字直播逐行滑入，更連貫',
        '數據視窗隨新事件更新',
        '修正暫停文字被截斷',
      ],
      en: [
        'An NBA-style court in the home colours',
        'The clock lights up with the game state',
        'Smoother play-by-play lines',
        'Stats follow new plays',
        'Fixed: a clipped timeout label',
      ],
    },
  },
  {
    version: '0.3.2',
    date: '2026-10-14',
    title: { 'zh-TW': '隊徽與球隊配色', en: 'Team logos and colours' },
    items: {
      'zh-TW': [
        '比分與比賽列表加上隊徽',
        '比分格與數據視窗套用球隊顏色',
        '終場每節比分標上節次並放大',
        '設定：精簡通知、快捷鍵開關、更新日誌與回饋',
        '修正點擊視窗會自動縮小',
      ],
      en: [
        'Team logos in the score and games list',
        'Team colours in the score and stats',
        'Labelled, larger points per period',
        'Settings: fewer notices, shortcut switch, changelog, feedback',
        'Fixed: a click shrank the window',
      ],
    },
  },
  {
    version: '0.3.1',
    date: '2026-10-14',
    title: { 'zh-TW': '停在螢幕右下角', en: "In the screen's corner" },
    items: {
      'zh-TW': [
        '預設停在螢幕右下角',
        '拖動後可一鍵回到角落',
      ],
      en: [
        "Opens in the screen's corner",
        'One click back to the corner after a drag',
      ],
    },
  },
  {
    version: '0.3.0',
    date: '2026-10-14',
    title: { 'zh-TW': '在設定裡更新', en: 'Updates from the settings' },
    items: {
      'zh-TW': [
        '設定頁可直接檢查並安裝更新',
        '簡易模式顯示最近四筆事件',
      ],
      en: [
        'Check and install updates in the settings',
        'The simple view shows the last four plays',
      ],
    },
  },
  {
    version: '0.2.0',
    date: '2026-10-14',
    title: { 'zh-TW': '數據視窗', en: 'The stats windows' },
    items: {
      'zh-TW': [
        '新增球員與團隊數據視窗',
        '全域快捷鍵',
        '連續得分提示',
      ],
      en: [
        'Player and team stats windows',
        'Shortcuts from any app',
        'Scoring runs',
      ],
    },
  },
  {
    version: '0.1.0',
    date: '2026-10-13',
    title: { 'zh-TW': '第一版', en: 'The first version' },
    items: {
      'zh-TW': [
        '簡易模式與 3D 球場模式',
        '比賽列表、開賽倒數與終場結果',
        '比賽通知',
      ],
      en: [
        'The simple view and the 3D court',
        'Games list, countdown and results',
        'Game notices',
      ],
    },
  },
];
