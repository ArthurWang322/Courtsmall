# Courtsmall

**Basketball, but small.** An unofficial desktop companion that keeps live NBA games in a quiet corner of your screen, so you know your team is playing without watching the game.

把 NBA 收進桌面一角的非官方小工具，不打擾工作也能知道比賽正在打。

<p>
  <img src="docs/media/court.gif" width="360" alt="The court view: a shot arcs to the rim and the points rise from the spot">
  <img src="docs/media/bar.png" width="360" alt="The simple view: the score, the clock and the two latest plays">
</p>

## What it does

- **A score you can read at a glance.** Each team's cell in its colour, the period and the clock, and the team with the ball framed.
- **The two latest plays**, newest on top: baskets, misses, fouls, turnovers, rebounds and substitutions, with timeouts and reviews by the clock.
- **A 3D court**, seen from behind the arc: each shot flies to the rim on its real spot, makes drop through the net, misses bounce off, free throws come from the line.
- **Your favourite team**, followed automatically and starred in the games list. Without one, Courtsmall follows the closest game on.
- **Before tip-off**, a countdown; **after the final**, the points per period and each side's leaders.
- **Notices** at tip-off, at the final and in a close finish, each a switch.
- Traditional Chinese and English.

<p>
  <img src="docs/media/games.png" width="300" alt="The games list, the favourite team's game first">
  <img src="docs/media/result.png" width="300" alt="A finished game: points per period and each side's leaders">
</p>

## Install

There is no release yet. Build it from source (below); the app bundle lands in `src-tauri/target/release/bundle/`.

It is developed and tested on macOS. The build is not notarised, so the first time, open it from Finder with right-click → Open.

## Build from source

You need Node.js (24 recommended) and Rust ([rustup](https://rustup.rs)).

```bash
npm install            # with npm 10 (Node 23), use: npm install --legacy-peer-deps
npm test
npx tauri dev          # run the app
npx tauri build        # build the app bundle and installer
```

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

- **簡易模式**：比分、節次與時間，加上最近兩筆事件（得分、沒進、犯規、失誤、籃板、換人）。
- **球場模式**：45 度俯瞰的 3D 半場，每次出手照實際位置飛向籃框。
- **最愛球隊**：自動跟它的比賽，在比賽列表裡標星號；沒設定時跟最緊張的比賽。
- **開賽前**倒數，**終場後**顯示各節比分與雙方各項領先者。
- 開賽、終場、關鍵時刻的通知，各自可以開關（目前系統通知還無法顯示，正在查原因）。

全部在你的電腦上執行，沒有伺服器。非 NBA、球隊或 ESPN 官方產品。
