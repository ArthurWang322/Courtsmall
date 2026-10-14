# Courtsmall

**Basketball, but small.** An unofficial desktop companion that keeps live NBA games in a quiet corner of your screen, so you know your team is playing without watching the game.

把 NBA 收進桌面一角的非官方小工具，不打擾工作也能知道比賽正在打。

<p>
  <img src="docs/media/court.gif" width="360" alt="The court view: a shot arcs to the rim and the points rise from the spot">
  <img src="docs/media/bar.png" width="360" alt="The simple view: the score, the clock and the two latest plays">
</p>

## What it does

- **A score you can read at a glance.** Each team's cell in its colour, the period and the clock, and the team with the ball framed.
- **The two latest plays**, newest on top: baskets, misses, fouls, turnovers, rebounds and substitutions, with timeouts and reviews by the clock, and a run in brackets at the end of the line.
- **A 3D court**, seen from behind the arc: each shot flies to the rim on its real spot, makes drop through the net, misses bounce off, free throws come from the line. The play's line and the score change as the ball reaches the rim, so the words and the court always tell the same play.
- **Stats beside the window**: the box score of each side (who is on the court starred, the bench below a line), the teams side by side in bars, and the points per period underneath. They unfold from the main window and move with it.
- **Your favourite team**, followed automatically and starred in the games list. Without one, Courtsmall follows the closest game on.
- **Before tip-off**, a countdown; **after the final**, the points per period and each side's leaders.
- **Notices** at tip-off, at the final and in a close finish, each a switch.
- **Shortcuts from any app**: Ctrl+Alt+M (⌃⌥M) switches simple / court, Ctrl+Alt+S shows the stats, Ctrl+Alt+H hides and shows. One switch turns them off.
- Traditional Chinese and English.

<p>
  <img src="docs/media/games.png" width="300" alt="The games list, the favourite team's game first">
  <img src="docs/media/result.png" width="300" alt="A finished game: points per period and each side's leaders">
</p>

<p>
  <img src="docs/media/stats.png" width="300" alt="The stats window: a side's box score, starters above the bench">
  <img src="docs/media/team.png" width="300" alt="Team stats: the two sides' numbers as bars from the middle">
</p>

## Install

Download the installer for your system from [Releases](https://github.com/ArthurWang322/Courtsmall/releases): nothing else to install.

- **Windows**: the `-setup.exe`. It installs for your user, no admin needed. It is not code-signed, so the first time Windows SmartScreen may warn: choose *More info*, then *Run anyway*.
- **macOS**: the `.dmg` (Apple silicon and Intel). It is not notarized, so the first time, right-click the app and choose *Open*.

It is developed on macOS; the Windows build is new and less tried.

## Build from source

For development. You need Node.js (24 recommended) and Rust ([rustup](https://rustup.rs)).

```bash
npm install            # with npm 10 (Node 23), use: npm install --legacy-peer-deps
npm test
npx tauri dev          # run the app
npx tauri build        # build the app bundle and installer
```

A version tag (`git tag v0.1.0 && git push --tags`) builds the Windows and macOS installers on GitHub Actions into a draft release, to check and publish.

Tests that check the adapter against ESPN's box scores need recorded games, which are not committed:

```bash
node scripts/probe/06-fixtures.mjs   # saves them to fixtures/nba/
```

`npm run dev` serves the page alone in a browser; add `?game=<ESPN event id>&replay&fixture` to replay a recorded game. `docs/PLAN.md` and `docs/PROBE_REPORT.md` (in Traditional Chinese) cover the design and everything measured about the data.

## Data

Game data comes from ESPN's public site and core APIs, fetched directly by your computer every 10 seconds while a game is on screen. There is no server. Courtsmall is not affiliated with or endorsed by the NBA, its teams or ESPN, and uses no league or team logos.

## Known issues

- System notices do not show yet; the cause is still being looked into.
- ESPN sometimes publishes a play late or corrects it; the score is always right, but an occasional basket may update the score without its animation.

## Credits

Based on [Basesmall](https://github.com/Zaious/basesmall) by Zaious, ChronicleCore Studio. Fonts: [Big Shoulders Display](https://fonts.google.com/specimen/Big+Shoulders+Display) and [Barlow Condensed](https://github.com/jpt/barlow), both under the SIL Open Font License 1.1.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attributions.

---

## 繁體中文

Courtsmall 是一個浮在桌面角落的小視窗，用 ESPN 公開的資料顯示 NBA 比賽。上班不能看直播，也能一眼知道比分、誰在持球、剛剛誰投進。

- **簡易模式**：比分、節次與時間，加上最近兩筆事件（得分、沒進、犯規、失誤、籃板、換人），連續得分以括號標在行尾。
- **球場模式**：45 度俯瞰的 3D 半場，每次出手照實際位置飛向籃框；球到籃框時文字直播和比分才更新，文字和動畫永遠對得上。
- **數據視窗**：從主視窗旁展開，雙方球員本場數據（場上球員標 *、先發與替補以分隔線區隔）、團隊數據長條圖比較，下方是每節得分。
- **最愛球隊**：自動跟它的比賽，在比賽列表裡標星號；沒設定時跟最緊張的比賽。
- **開賽前**倒數，**終場後**顯示各節比分與雙方各項領先者。
- **快捷鍵**（在任何程式裡都能用）：Ctrl+Alt+M（⌃⌥M）切換模式、Ctrl+Alt+S 數據、Ctrl+Alt+H 隱藏／顯示，可在設定關閉。
- 開賽、終場、關鍵時刻的通知，各自可以開關（目前系統通知還無法顯示，正在查原因）。

**安裝**：到 [Releases](https://github.com/ArthurWang322/Courtsmall/releases) 下載安裝檔，不需要裝其他東西。Windows 下載 `-setup.exe`（第一次若出現 SmartScreen 警告，按「其他資訊 → 仍要執行」）；macOS 下載 `.dmg`（第一次請按右鍵 →「打開」）。

全部在你的電腦上執行，沒有伺服器。非 NBA、球隊或 ESPN 官方產品。
