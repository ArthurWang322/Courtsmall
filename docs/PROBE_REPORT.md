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

## 4. 直播量測

`03-live-measure.mjs <eventId> [minutes]`，紀錄存到 `fixtures/nba/live-<id>.jsonl`。實測 SA @ UTAH（401898721，季前賽），2026-10-13 02:25:49Z 至 02:50:40Z。前 2.5 分鐘是中場，之後是第三節 12:00 打到 2:34。每 10 秒一輪，共 150 輪；`summary` 每 3 輪抓一次，共 50 次。

### 4.1 輕量端點

ESPN core API（`sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{id}/competitions/{id}/…`）：

| 端點 | 實測大小 | `cache-control` | 內容 |
| --- | --- | --- | --- |
| `status` | 平均 347 B | `max-age=1, stale-while-revalidate=7200` | `type.name`、`period`、`displayClock`、`clock` |
| `plays?limit=1&page=999999` | 平均 210 B | `max-age=10, …` | 超出範圍的頁不給 items，但給 `count`：可以用來問「總共幾筆」 |
| `plays?limit=1&page={count}` | 約 1.2 KB | 同上 | 最新一筆，比 site API 多了 `modified`、`possessionTeam`、`clock.value` |

### 4.2 結果

- **輕量端點比 `summary` 新。** 50 次 `summary` 裡，有 22 次的最後一筆比同一輪 core API 的最後一筆舊，28 次相同，沒有一次比較新。
- **事件數只增不減**：149 個間隔裡 `count` 增加了 39 次，沒有減少過。
- **一次可能新增好幾筆**：每次增加 1–6 筆（1 筆 11 次、2 筆 10 次、3 筆 12 次、4 筆以上 6 次）。所以只抓最後一筆不夠，要抓上次之後到現在的區間。
- **比賽鐘**：149 個間隔裡變了 55 次。罰球、暫停、死球時會停。
- **出現延遲**（第一次看到某筆的輪詢時間減去該筆的 `wallclock`，包含最多 10 秒的輪詢間隔）：中位數 16.7 秒，p90 41.9 秒，最大 208.9 秒。最大值可能是事後補登或時間被更正【未驗證】。

### 4.3 流量估算（一場約 2.5 小時、每 10 秒一輪，約 900 輪）

| 做法 | 每輪 | 一場 |
| --- | --- | --- |
| 每輪抓 `summary` | 約 350 KB | 約 315 MB |
| `status` 心跳，`count` 變了才抓新增的事件 | 平時約 0.6 KB，有新事件時再加約 1.2 KB × 筆數 | 約 1–2 MB |

輕量做法要比整包少兩個數量級以上，所以即時來源用 core API。`summary` 只在開始跟一場比賽時抓一次，拿 boxscore 與球員名單。

## 5. 還沒驗證

- 延長賽：四場都沒有延長。【未驗證】
- 季後賽。【未驗證】
- 事件事後被修改（`modified` 變了）的頻率，以及修改的內容。量測只看了最新一筆，沒有回頭比對舊事件。【未驗證】
- `count` 是否保證等於最後一筆的頁碼，也就是中間會不會有被刪掉的序號。【未驗證】
- core API 的事件內容和 site API 的 `plays[]` 是否逐筆相同。目前只比對了序號。【未驗證】
- ESPN 的使用條款。這是非官方 API，沒有公開授權。【待決】
- 台灣封鎖 `cdn.nba.com` 的原因是公司網路還是地區。【待決】
