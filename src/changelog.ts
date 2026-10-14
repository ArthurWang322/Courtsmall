// What each version brought, newest first, for the changelog in the settings (src/ui/views.ts
// changelogView). Only what a user notices: one title and a few lines a version, in both languages.

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
        '比分、比賽列表與最愛球隊選單都附上隊徽；沒有隊徽的球隊以代表色圓章顯示縮寫首字。',
        '比分格以球隊代表色由左往右漸淡；數據視窗換成所選球隊的顏色，團隊數據混合兩隊顏色。',
        '終場比賽的每節比分標上節次並放大；打開數據時只展開旁邊的數據視窗。',
        '設定：通知只保留開賽與關鍵時刻，且沒選最愛球隊時不發；快捷鍵改為開啟／關閉、最愛球隊的隊徽成為背景浮水印，並加入更新日誌與回饋信箱。',
        '設定頁改以 ✕ 關閉（設定一改就生效）；打開設定時直接顯示最愛球隊，不再先閃過「無」。',
        '修正點主視窗空白處，視窗會縮回預設大小的問題。',
      ],
      en: [
        'Team logos in the score, the games list and the favourite picker; a team without one shows its initial on a disc in its colour.',
        "The score's cells fade from the team colour; the stats window takes the chosen side's colour, the teams' stats both.",
        "A finished game's points per period are labelled and larger; its stats open without the line score.",
        "Settings: notices at tip-off and in a close finish only, for a favourite team; shortcuts are on or off, the favourite's logo stands behind the page, and a changelog and a feedback address.",
        'The settings close from a ✕ (changes apply as they are made), and open on your favourite team instead of a flash of none.',
        'Fixed: a click on the window snapped it back to its preset size.',
      ],
    },
  },
  {
    version: '0.3.1',
    date: '2026-10-14',
    title: { 'zh-TW': '停在螢幕右下角', en: "In the screen's corner" },
    items: {
      'zh-TW': [
        '開啟時停在螢幕右下角；改變大小或打開數據時，整組視窗會滑到能完整顯示的位置。',
        '拖動視窗後就停在你放的地方，工具列左端出現「回到右下角」按鈕。',
      ],
      en: [
        "Opens in the screen's bottom-right corner; changing size or opening the stats glides the group to where it all fits.",
        'Once dragged it stays where you put it, and the toolbar gains a button back to the corner.',
      ],
    },
  },
  {
    version: '0.3.0',
    date: '2026-10-14',
    title: { 'zh-TW': '在設定裡更新', en: 'Updates from the settings' },
    items: {
      'zh-TW': [
        '設定頁可以檢查更新、下載安裝並重新啟動。',
        '簡易模式顯示最新一筆與之前三筆事件，越舊越淡。',
      ],
      en: [
        'Check for, install and restart into a new version from the settings.',
        'The simple view shows the newest play and three before it, older ones fainter.',
      ],
    },
  },
  {
    version: '0.2.0',
    date: '2026-10-14',
    title: { 'zh-TW': '數據視窗', en: 'The stats windows' },
    items: {
      'zh-TW': [
        '主視窗旁展開數據：雙方球員數據與場上球員、團隊數據長條圖，下方是每節比分。',
        '全域快捷鍵：切換模式、打開數據、隱藏／顯示。',
        '連續得分標在行尾；一次更新的多筆事件依序出現，球到籃框時文字才更新。',
      ],
      en: [
        "Stats beside the main window: each side's players and who is on the court, the teams' stats in bars, the points per period below.",
        'Shortcuts from any app: switch the view, open the stats, hide and show.',
        'Runs at the end of the line; plays arriving together show one after another, the text as the ball reaches the rim.',
      ],
    },
  },
  {
    version: '0.1.0',
    date: '2026-10-13',
    title: { 'zh-TW': '第一版', en: 'The first version' },
    items: {
      'zh-TW': [
        '簡易模式與 3D 球場模式，自動跟最愛球隊或最接近的比賽。',
        '比賽列表、開賽前倒數，終場後的各節比分與雙方領先者。',
        '開賽、終場與關鍵時刻通知。',
      ],
      en: [
        'The simple view and the 3D court, following your favourite team or the closest game.',
        "The games list, a countdown to tip-off, and after the final the points per period and each side's leaders.",
        'Notices at tip-off, at the final and in a close finish.',
      ],
    },
  },
];
