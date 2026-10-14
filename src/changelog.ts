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
