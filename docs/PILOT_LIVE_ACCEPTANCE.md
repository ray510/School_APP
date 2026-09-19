# 北區三學段試點：最終線上驗收

## 現況

**已完成測試修正、重新驗收及現有測試站部署。**

網址：https://schools-test.finpulsx.win

部署程式實際回報 `LIVE_VERIFIED`：`2026-09-19T06:03:52.290Z`（香港時間 2026-09-19 14:03:52）。其後桌面／手機線上瀏覽器測試亦全部通過，並非只通過本機測試。

本文件的現況取代上一輪 run 35424767224 的「prepare 失敗、deploy skipped」結果；舊紀錄保留作歷史證據。它不表示全港資料整合或 production 已全部完成。

## 程式及執行證據

| 項目 | 實際值 |
|---|---|
| 分支 | `fix/phase1-stabilization` |
| 最後測試修正 | `b29ea6d10b4d479bf545aa54f64335cc90aed4ad` |
| 已建置及部署 commit | `cee3fc3f06560e98a8d2e4fdd7b7398ca879753c` |
| 工作流程 | Reviewed school pilot delivery |
| Run | [35425446270](https://github.com/ray510/HK_APP/actions/runs/35425446270) |
| Prepare job | `105850464649` — completed / success |
| Deploy job | `105850763888` — completed / success |
| Worker | `hk-school-guide-test` |
| 新 Worker version | `5344c976-128c-45ab-aa5b-5af352a5d7c5` |
| 沿用 D1 | `hk-school-guide-test-f6350475fa41` |
| D1 ID | `f80ca4cd-5e0a-4e9c-94ab-e4acdcbfda89` |
| 新試點資料包 ID | `c18a0fa467d8ba919ab98f1f2931003d62e7fa5fddb7512e729c7b5f1cd74af6` |

後續如只提交本文件或 README，不能把文件 commit 當作已部署的程式 commit。

## 最後測試修正

`apps/web/tests/pilot/journey.spec.ts` 在加入私人清單後，等待既有成功訊息才導航；在儲存筆記後，等待「已儲存於此瀏覽器。」才刷新。`savePrivate()` 在 IndexedDB transaction 的 `oncomplete` 才 resolve，而介面在 await 完成後才顯示成功訊息。

保留全部原有斷言：刷新後筆記值相同、網絡請求不含筆記、學校與年度資料、招生事件、適用條件、ICS 日期邊界及錯誤 API。沒有固定 sleep、沒有跳過失敗測試，也沒有修改資料儲存行為。

## 實際驗收

執行環境：GitHub Actions Ubuntu 24.04.5、Node 24.20.0、pnpm 10.28.0、Wrangler 4.135.0。

| 驗收項目 | 結果 |
|---|---|
| Frozen install、全部 package typecheck、ESLint | PASS |
| Node regression | 70 passed / 0 failed |
| Vitest | 111 passed / 0 failed，8 個測試檔 |
| Python SQLite publication | 13 tests OK |
| 真實資料 SQL 重播兩次 | PASS：30 annual、15 events、10 commands、10 audit；baseline unchanged |
| 真正本機 D1 migrations 001–005 及資料匯入 | PASS |
| 本機 desktop / mobile Chromium | 4 passed，10.0 秒 |
| 遠端既有 D1 備份、migration 005、試點發佈 | PASS |
| 遠端版本、資料筆數、FK、baseline heads 核對 | PASS |
| 線上 desktop / mobile Chromium | 4 passed，26.8 秒，於 06:04:42Z 完成 |

線上 Playwright 直接使用 `https://schools-test.finpulsx.win`，測試步驟沒有注入部署 Token。包括各學段選校、比較、詳情、加入私人清單、相關招生日期與 ICS，以及筆記保存後刷新／不傳送筆記。不是使用模擬 API 代替真實遠端。

未聲稱在使用者 Windows 實機或正式 production 執行過。ChatGPT 工作容器本輪 DNS 無法獨立載入站點；上述線上結果來自實際執行並已讀取日誌的 CI runner。

## 已發佈資料及保護

北區年度資料試點：幼稚園 10、小學 10、中學 10，共 30 個學校／校址配對項目。公開招生事件由 0 增至 15：10 項教育局共同／有條件程序，及 5 項粉嶺神召會幼稚園個別公告。事件保留學段、入學學年、申請途徑、適用條件及原始證據。

原本三個 `profiles:*` 基本名錄 heads、release ID 與 revision=1 完全不變；沒有重建資料庫。新增三個年度及四個事件 channel，均為首個 release、revision=1。外鍵檢查通過，試點僅使用已配對及非合成資料。

遠端只新增套用 `005_publication_channel_namespace.sql`，沒有改寫已套用的 001–004。四個 trigger（annual_publication_guard、event_publication_guard、publication_apply、publication_guard）全部核對存在。每個 channel 的審核、CAS 與 audit 原子發佈保護保留；不把七個 channel 宣稱為單一跨 channel 交易。

本轮只操作既有測試 D1／Worker；沒有建立新 DB、沒有部署 production、沒有更改主站或其他 hostname、沒有合併 main、沒有開 cron 或更改付費方案。

## 備份、額度及恢復邊界

遠端寫入前已匯出 `artifacts/pilot/before.sql`，並保存 `before.json`（舊 heads、migration ledger、ownership 及 Worker deployment）。SQL SHA-256：

`4e9f79ac115bc6a24c817ae4fde8ea2d97aff7e126fbbc1396c20076a2f3270c`

部署前帳戶當日觀察：rows_written 49,627、rows_read 46,278。部署工具本身 D1 query API 回報 rows_written 533、rows_read 10,616；**此數不含 Wrangler migration/export 或公開 HTTP 讀取，不是整個工作流程或帳戶帳單總量**。

前一 Worker version 為 `43a5f920-d599-4fe0-a966-19f54e58003f`，可作程式回退參考，但本輪沒有執行回退。新增 pilot channel 目前各只有一個版本，不能聲稱已有先前 pilot 資料可直接 rollback。任何恢復均應先核對快照與目前狀態，不要直接把 before.sql 匯入現有非空 DB。

## 可下載證據

同一 run 的兩個 artifact：

- [reviewed-pilot-package](https://github.com/ray510/HK_APP/actions/runs/35425446270/artifacts/10578159630)：18,565,353 bytes；前端、原始來源、SQL、manifest、本機驗收。ZIP SHA-256 `7e854eed66600ceeab0f99fb08ba5914ec41d6ecaa2a3bad2dd4740e36ddbc02`。
- [reviewed-pilot-live-evidence](https://github.com/ray510/HK_APP/actions/runs/35425446270/artifacts/10578584614)：1,682,608 bytes；實際 deployment-result、遠端寫入前 SQL 備份、設定及四張線上瀏覽器截圖。ZIP SHA-256 `0f832c0d81edcaa9ea2709d2b683d1ff36065d2c7f2b63205d9117260f6164cf`。

Artifact metadata 顯示到期日 `2026-12-18T06:00:38Z`，即本輪保留 90 天，**仍不是永久備份**。已下載副本並驗證兩份 ZIP hash 及 before.sql hash。

## 試用入口與限制

可從 `/schools?level=PRIMARY&year=2027&has_annual=1` 開始，切換 KG / PRIMARY / SECONDARY，選兩間比較，再查看學校詳情、相關日期與私人清單。

試點不是全港配對完成：基本名錄仍屬 partial，未納入試點的年度原文繼續獨立展示。歷史概覽及收費時期不會因選擇 2027 入學而變成 2027 已確認數值。核對屬透明標示的 assistant-assisted source review，`human_review=false`，不是教育局認證或真人逐校核准。公開資訊最後仍應以教育局及學校公告為準。
