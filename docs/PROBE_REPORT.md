# PROBE_REPORT — M0 資料探針實測

實測日期：2026-10-13，出口 IP 在台灣（TW）。腳本在 `scripts/probe/`，回應快取在 `fixtures/nba/raw/`（不提交）。

## 1. cdn.nba.com：打不到

`01-endpoints.mjs`。`cdn.nba.com` 的 `liveData/scoreboard`、`staticData/scheduleLeagueV2.json`、`robots.txt`，還有 `www.nba.com` 首頁，全部回 403。回應是 Akamai 的 "Access Denied" HTML 頁面，與 User-Agent 和 `Origin` 無關。同一時間 ESPN 和 MLB statsapi 都回 200。

判斷：Akamai 依來源 IP 封鎖。是公司網路還是地區封鎖【未驗證】。沒有嘗試繞過。

## 2. ESPN site API：可用

`02-espn.mjs [YYYYMMDD]`。

| 端點 | 大小 | `cache-control` | CORS |
| --- | --- | --- | --- |
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD` | 約 83 KB | `max-age=6` | `*` |
| `.../summary?event={id}` | 345–463 KB（已結束比賽） | `max-age=1`、`max-age=2` | `*` |

`summary` 的頂層欄位：`boxscore, format, gameInfo, leaders, injuries, broadcasts, pickcenter, odds, againstTheSpread, news, header, plays, videos, wallclockAvailable, meta, winprobability, standings`。

`plays[]` 的欄位：`id, sequenceNumber, type.{id,text}, text, shortDescription, awayScore, homeScore, period.{number,displayValue}, clock.displayValue, scoringPlay, scoreValue, shootingPlay, pointsAttempted, team.id, participants[].athlete.id, wallclock, coordinate.{x,y}`。

- 一場約 440–540 筆。種類細到「Driving Floating Bank Jump Shot」，所以要靠 `type.id` 歸類，不能靠文字。
- 每筆都有 `wallclock`（ISO 時間），可以用來做重播節奏。
- 每筆都有 `coordinate`。不是投籃的比賽事件是哨兵值（`x=-214748340, y=-214748365`），轉換層要濾掉。
- 球員只給 id，名字要從 `boxscore` 對。

## 3. 核對：逐球資料能不能重建官方比分

用每節最後一筆的 `awayScore/homeScore` 相減算出各節得分，對照 `header.competitions[0].competitors[].linescores` 與終場比分；另外也加總 `scoreValue`。

| 日期 | 比賽 | 終場 | 各節得分 | `scoreValue` 加總 |
| --- | --- | --- | --- | --- |
| 2026-10-12 季前賽 | LON @ POR 66–119 | 一致 | 一致 | 一致 |
| 2026-10-11 季前賽 | DAL @ HOU 132–115 | 一致 | 一致 | 一致 |
| 2026-04-10 例行賽 | DET @ CHA 118–100 | 一致 | 一致 | 一致 |
| 2026-03-01 例行賽 | SA @ NY 89–114 | 一致 | 一致 | 一致 |

四場全部一致。

## 4. 還沒驗證

- 延長賽：四場都沒有延長。【未驗證】
- 季後賽。【未驗證】
- 直播中的行為：`summary` 更新多頻繁、`plays` 是否完整、有沒有增量端點。ESPN 沒有像 MLB `diffPatch` 那樣的機制的話，每次輪詢都要抓 300–460 KB，與「資料用量要節制」衝突。這是最大的未知數。【未驗證】
- ESPN 的使用條款。這是非官方 API，沒有公開授權。【待決】
- 台灣封鎖 `cdn.nba.com` 的原因是公司網路還是地區。【待決】
