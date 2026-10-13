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

## 5. 延長賽與季後賽

`04-coverage.mjs [YYYYMMDD …]` 對這些比賽跑第 3 節的核對（腳本在 `check.mjs`）：

| 類型 | 比賽 | 結果 |
| --- | --- | --- |
| 延長賽 | DEN @ PHI、ORL @ BKN、UTAH @ OKC、PHI @ TOR（2026-01，各 5 節） | 全部一致 |
| 雙延長 | BOS @ BKN（2026-01-23，6 節） | 一致 |
| 季後賽 | TOR @ CLE、ATL @ NY、MIN @ DEN（2026-04-20）、ORL @ DET（2026-05-03）、NY @ SA（2026-06-05） | 全部一致 |

延長賽在 `linescores` 裡就是第 5、6 節，`status.period` 會大於 4，`status.type.detail` 是 `Final/OT`、`Final/2OT`。2026 年 1 月隔天抽樣 117 場，其中 5 場延長。

## 6. core API 與 site API 逐筆比對

`05-core-vs-site.mjs <eventId>`。實測 SA @ UTAH（401898721），比對時比賽還在第三節，core 有 384 筆、site 有 382 筆（site 落後，同 §4.2）。

- **兩邊共有的 382 筆**：比分、得分、節次、比賽鐘、隊伍、`wallclock` 全部相同。只有一筆不同：seq 499 的 `type.id` 是 111 對 118，文字是「alley oop layup」對「3-foot alley oop dunk」。這是 core 已經更正、site 還沒跟上。
- **事件會在事後被更正**：`modified - wallclock` 的 p50 是 -0.2 分（`modified` 只精確到分鐘），p90 9.6 分，p99 42.5 分，最大 44.1 分；384 筆裡有 54 筆超過 5 分鐘以後才被修改。
- **列表不是照 `sequenceNumber` 排序，而是照比賽中的順序。** 有三處序號倒退，例如 seq 102（換人，4:43）後面接 seq 94（跳投，4:30）。代表晚補登的事件會插進列表中間，不一定接在最後面。
- **`sequenceNumber` 不連續**：範圍 4–562，只有 384 筆，有 175 個號碼沒用到。

### 6.1 對即時來源的影響

照第 4.3 節的「`count` 變了才抓最後幾頁」，會漏掉插進中間的事件，也拿不到事後的更正。所以：

- 每次抓尾端時多抓幾筆重疊，用 `id` 去重，`modified` 變了就更新那一筆。
- 補一個低頻的完整重抓（`plays?limit=1000`，整場約 384–540 筆），用來接住插在中間的事件與舊事件的更正。頻率【待決，M2 定】。
- 更正只更新狀態，不重播事件，同 Basesmall 的做法。

## 8. M1 轉換層驗收時的發現

`tests/timeline.test.ts` 用 14 場夾具（`node scripts/probe/06-fixtures.mjs`，site summary 加 core API 的 plays）對照官方數字。

- **累計比分會暫時錯掉。** 14 場裡有 8 筆 `scoringPlay: false` 的事件改變了比分。典型的例子是：暫停那一筆比分少 2 分，下一筆失誤又補回來。例如 401898400 seq 532「Mavericks Full timeout」主隊 -2，seq 546「Caleb Martin lost ball turnover」主隊 +2。轉換層把這種變化當作更正：比分照官方更新，但不產生進球事件、不影響跑動。之前誤把它算成進球的時候，球員得分對不上 boxscore（3 場各差 1–2 分）。
- 副作用：重播到錯誤的那一筆時，畫面會短暫顯示錯的比分。這是資料源本身的狀態，暫時不修。
- **`possessionTeam` 是這一球進攻的那一隊**（投進時是得分隊，防守籃板時是籃板隊）。投進以後到下一筆之前，球權仍顯示得分隊。目前照官方欄位，不自行推算換邊。

## 9. 還沒驗證

- 一場打完後，`modified` 最晚會到什麼時候（今天量的比賽還沒打完）。【未驗證】
- `plays?limit=1000` 的完整重抓有多大。【未驗證，M2 量】
- ~~ESPN 的使用條款~~ 【已決定，2026-10-13】維護者接受，見 `PLAN.md` Q2。
- 台灣封鎖 `cdn.nba.com` 的原因是公司網路還是地區。【待決】
