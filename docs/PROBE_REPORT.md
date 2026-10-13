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

## 7. M1 轉換層驗收時的發現

`tests/timeline.test.ts` 用 14 場夾具（`node scripts/probe/06-fixtures.mjs`，site summary 加 core API 的 plays）對照官方數字。

- **累計比分會暫時錯掉。** 14 場裡有 8 筆 `scoringPlay: false` 的事件改變了比分。典型的例子是：暫停那一筆比分少 2 分，下一筆失誤又補回來。例如 401898400 seq 532「Mavericks Full timeout」主隊 -2，seq 546「Caleb Martin lost ball turnover」主隊 +2。轉換層把這種變化當作更正：比分照官方更新，但不產生進球事件、不影響跑動。之前誤把它算成進球的時候，球員得分對不上 boxscore（3 場各差 1–2 分）。
- 副作用：重播到錯誤的那一筆時，畫面會短暫顯示錯的比分。這是資料源本身的狀態，暫時不修。
- **`possessionTeam` 是這一球進攻的那一隊**（投進時是得分隊，防守籃板時是籃板隊）。投進以後到下一筆之前，球權仍顯示得分隊。目前照官方欄位，不自行推算換邊。

## 8. 還沒驗證

- 一場打完後，`modified` 最晚會到什麼時候（今天量的比賽還沒打完）。【未驗證】
- ~~ESPN 的使用條款~~ 【已決定，2026-10-13】維護者接受，見 `PLAN.md` Q2。
- 台灣封鎖 `cdn.nba.com` 的原因是公司網路還是地區。【待決】

## 9. M2 補量

### 9.1 傳輸大小（gzip）

前面各節的大小都是解壓後的。App 的 fetch 會送 `Accept-Encoding: gzip`，實際在網路上傳的是壓縮後的量（401810362，curl 實測）：

| 請求 | 解壓後 | gzip |
| --- | --- | --- |
| `status` | 約 350 B | 250 B |
| `plays?limit=25&page=N`（尾端） | 約 45 KB | 2.2 KB |
| `plays?limit=1000`（整場重抓） | 0.70–1.07 MB（384–588 筆，每筆約 1.8 KB） | 41 KB |

即時來源的預設是每 10 秒抓一次 `status` 加上事件數、事件數變了才抓尾端、每 2 分鐘整場重抓一次。一場 2.5 小時約 75 次整場重抓，約 3 MB，再加上心跳約 0.5 MB 和尾端。

### 9.2 重播節奏

14 場夾具的 `wallclock` 間隔：

| 間隔 | 筆數 | 中位數 | p90 | 最大 |
| --- | --- | --- | --- | --- |
| 同一節內，兩筆事件之間 | 7073 | 8 秒 | 31 秒 | p99 200 秒 |
| 第一節結束到第二節 | 14 | 132 秒 | — | 209 秒 |
| 中場 | 14 | 869 秒 | — | 1025 秒 |
| 第三節結束到第四節 | 14 | 150 秒 | — | 194 秒 |

同一節內有 16% 的事件跟前一筆在同一秒（換人、罰球），另有 62 次 `wallclock` 往回跳。「緊湊」模式的上限照這些數字訂：節內 12 秒、節間 10 秒、最短 0.5 秒（`src/data/replay/pacing.ts`）。往回跳的間隔當作最短間隔處理，不另外修正時間戳記。

### 9.3 即時來源實測（`scripts/live-smoke.ts`）

2026-10-13 03:05–03:11Z，SA @ UTAH 第四節，兩次各 3 分鐘。連線、比分、比賽鐘、球權、跑動、進球事件都正常。兩次分別是 49 和 38 個請求，更正 1 次和 3 次。

兩次都有一記罰球改了比分，卻沒有送出進球事件：

- **第一次**：seq 619「Free Throw - 2 of 2」（8:53，`wallclock` 03:06:27）排在 seq 622、623 兩次換人（8:53，`wallclock` 03:05:36）前面，但比它們晚發布。原本的規則是「排在已送出的事件前面就算更正」，所以它被丟掉了。現在改成看比賽鐘：比賽時間早於最後送出那一筆才算晚補登，同一時刻的照常送出。`tests/live.test.ts` 有一個會重現這個情況的測試。
- **第二次**：seq 644「Free Throw - 2 of 2」（7:36）出現時，7:20 的 seq 645、646 已經送出，照新規則算更正。這筆的 `modified` 是 03:09，但 03:10:22 那一輪還沒看到它。可能原因有兩個，都【未驗證】：一是 CDN 給了舊快取（`stale-while-revalidate=7200`）；二是 ESPN 先記成罰失，事後才更正成罰進。

這兩種情況下，狀態（比分、最近一次進球、跑動）都是對的，只少了那一次進球事件。

第一次的原因也沒有完全確定：也可能是 619 本來就在列表裡、是從罰失被改成罰進。如果是這樣，它走的是「已送出的事件被修改」那條路，比賽鐘的規則救不了它。【未驗證】要確認的話，量測腳本需要記錄每一輪的完整尾端。

## 10. 事件種類（M3 第二行）

14 場夾具裡共有 84 種 `type.id`。`type.text` 是種類名稱（例如「Out of Bounds - Bad Pass Turnover」），不是事件描述，所以轉換層用它歸類（`playKind`，`src/data/espn/timeline.ts`），沒見過的 id 也能歸進去：

| 歸類 | 例子（id 名稱，次數） | 參與者角色 |
| --- | --- | --- |
| 失誤 | 62 Bad Pass Turnover 169、63 Lost Ball Turnover 104、64 Traveling 16、70 Shot Clock Turnover 21（沒有球員）、84 Offensive Foul Turnover 48 | `offense`（失誤者）、`defender`（抄截者） |
| 犯規 | 44 Shooting Foul 306、45 Personal Foul 213、43 Loose Ball Foul 48、42 Offensive Foul 42、24 Offensive Charge 5、35 Technical Foul 7、32 Flagrant Foul Type 1 2、36 Double Personal Foul 1 | `fouler`；雙方犯規沒有角色，依序是兩名球員 |
| 籃板 | 155 Defensive Rebound 986、156 Offensive Rebound 572（含球隊籃板，沒有球員） | `rebounder` |
| 換人 | 584 Substitution 913 | `subin`、`subout` |
| 暫停 | 16 Full Timeout 168 | 無 |
| 重播審查 | 213–216 Coach's Challenge、277、278–280 Ref-Initiated Review，共 48 | 無 |

- **驗收**：14 場的每位球員，犯規（不含技術犯規）、失誤、進攻籃板、防守籃板的事件數，都等於 boxscore 的 PF、TO、OREB、DREB（`tests/timeline.test.ts`）。
- **參與者可能是 `null`**：401810405 有一筆「Technical Foul」的 `participants` 裡有 `null`，可能是吹給不在名單上的人（教練、板凳）。轉換層會先濾掉。
- **暫停會持續到比賽恢復**：暫停期間記錄的換人不會清掉「暫停」，下一筆非換人的事件才會。
- **沒進的出手**：投籃事件有 `shootingPlay: true`、`scoringPlay: false`、`pointsAttempted`（1、2、3），出手者是 `shooter`，被蓋火鍋時另有 `blocker`。14 場的每位球員，進球事件加上沒進的事件，都等於 boxscore 的 FG、3PT、FT 出手數，被蓋的次數也等於 BLK。
- **節末拋投不算出手**：14 場共有 19 次「282 Heave Jump Shot」，都在節末最後 0.7 秒以內，全都不進。boxscore 的出手數不計入它們，但被蓋火鍋時，阻攻數照樣計入。畫面照樣顯示「三分不進」，只在統計時排除。為什麼不計入，可能是 NBA 近年對節末拋投的統計規則【未驗證】。

## 11. 投籃座標（球場畫面）

core API 投籃事件的 `coordinate`，單位是英尺，`x` 是 0–50（橫跨球場），`y` 從底線往外。兩隊的投籃都換算到同一個籃框。不是投籃的事件，座標是哨兵值（約 -2^31）。

驗證方法：14 場裡有 1784 次投籃（不含罰球）的事件文字寫了距離，例如「makes 25-foot three point jumper」。拿這些距離反推籃框位置，最佳解是 **(25, 1)**：

| 項目 | 數值 |
| --- | --- |
| 座標算出的距離與文字距離的誤差 | 中位數 0.28 英尺，p90 1.00，p99 1.19，最大 1.61 |
| 三分出手離籃框最近 | 22.0 英尺（底角三分是 22 英尺） |
| 兩分出手離籃框最遠 | 22.8 英尺（三分弧頂是 23.75 英尺） |
| 範圍 | `x` 0–49，`y` -3–66（66 是過半場的拋投） |

座標是整數，所以誤差在 1.6 英尺以內是合理的。`tests/timeline.test.ts` 檢查每一次三分出手都在三分線外、兩分出手都在線內（允許 1.6 英尺的誤差）。

