# 真實測試資料包與部署驗收

## 本輪結論

**測試站已上線並通過線上驗收：`https://schools-test.finpulsx.win`，狀態 `LIVE_VERIFIED`（2026-09-19T03:58:02Z）。**

- 程式 commit：`3dc1e8a2cedf69aff4153d41ccddaaa27b48252a`（修復 migration、續跑判定、資料包重用）。
- Workflow：**Real data and finpulsx test deployment**，`workflow_dispatch`，輸入 `reuse_package_run_id=35369033994`、`resume_database_id=f80ca4cd-5e0a-4e9c-94ab-e4acdcbfda89`。
- Run：[35419861458](https://github.com/ray510/HK_APP/actions/runs/35419861458)；prepare 與 deploy job `105835671385` 均 `completed / success`。
- 資料包 ID：`f6350475fa412107c9da0c9c90c941d283b50c02213b0fc4c24689359b91c51d`，重用自 run 35369033994 的 artifact（ZIP SHA-256 `0233cd42…0813cf`），逐塊 SQL 與四個來源原始檔 hash 重新核對；資料來源 commit `36cee9c`，前端在 `3dc1e8a` 重建（`package-provenance.json`）。
- 測試 D1：`hk-school-guide-test-f6350475fa41`（`f80ca4cd-5e0a-4e9c-94ab-e4acdcbfda89`，帳戶 `7760594e…`），由 run 35369033994 建立。部署前唯讀核對：ledger 只有 `001`、schema 只含 001 物件、所有表為空，續跑判定 `import`。
- 遠端 migration：`002`（11 句）、`003`（2 句）、`004`（5 句）以 `wrangler d1 migrations apply --remote` 套用；ledger 現為 001–004，trigger 4 個。
- 遠端匯入（Cloudflare 回報）：13,225 句、rows_read 6,632、**rows_written 49,588**、DB 9.30 MB；當日帳戶預檢 rows_written 0。
- 遠端筆數（部署後獨立唯讀查詢）：school_search 連 release_heads KG 2,156／PRIMARY 616／SECONDARY 530，synthetic 0；三個 channel revision 1，release ID 與 manifest 一致；publication_commands 3、audit_events 3、event_versions 0、profile_versions 3,302；`test_site_builds` ready=1；`PRAGMA foreign_key_check` 0。
- Worker：`hk-school-guide-test`，Version `43a5f920-d599-4fe0-a966-19f54e58003f`，只綁 Custom Domain `schools-test.finpulsx.win`。
- 線上 HTTPS 驗收（憑證有效）：health `staging / database=ok / data_status=published`；`/`、`/schools?level=PRIMARY`、`/schools/:id`、`/compare`、`/shortlist`、`/sources` 深層網址 200；三學段搜尋與名稱關鍵字、詳情、比較（跨學段回 400）均取得真實資料且 `is_test=false`；`/source-reference` 三份原文 962／507／441 筆、欄位 104／118／103，記錄標示 `UNLINKED_SOURCE_RECORD`；`/api/v1/events` 0 筆、`verified_events_only`；`/api/not-found` 回 JSON 404；`robots.txt` `Disallow: /`、`X-Robots-Tag: noindex, nofollow`、CSP `connect-src 'self'`。
- 私人筆記：前端只發出 GET `/api/v1/*`，收藏／備註存於瀏覽器 IndexedDB；CSP 禁止連往其他來源。

上一輪 run [35369033994](https://github.com/ray510/HK_APP/actions/runs/35369033994) 的 deploy job `105682164673` 在建立 D1 並套用 001 後，於 002 失敗（`incomplete input: SQLITE_ERROR [code: 7500]`）；根因與修法見 [TEST_SITE_DEPLOYMENT.md](TEST_SITE_DEPLOYMENT.md)「Migration 與 D1 遠端 splitter」。

### 已知限制、備份與回滾

- 資料仍是 `partial` scope 的基本名錄；年度概覽為原文展示、未配對身份；公開招生事件 0，沒有補任何日期。
- 備份：資料包與前端在 artifact `school-test-site-package`（run 35369033994 及 35419861458，各保留 30 天）；部署結果在 `school-test-deployment-result`；原始來源在 `archive/`（CI artifact，本機另存）。這不是永久 production 封存。
- 回滾：程式層以 Cloudflare Workers 版本回滾（Version ID 見上）；資料層以 `publication_commands` 的 rollback 指令切回同 channel 先前 release（本輪每 channel 只有一個 release，沒有可回退版本）；若要整體撤下，只需刪除 Custom Domain／Worker，不刪 D1。
- 不在本輪範圍：`finpulsx.win` 主站、其他 subdomain、production、付款方案均未觸碰。

## 名錄來源資料

S01 官方名錄原始 3,496 筆，通過本次明確校類與唯一來源鍵檢查後收錄 **3,302 筆來源紀錄**，排除 **194 筆**。排除規則包括未納入本輪的校類、不明／重複来源鍵及結構驗證失敗；逐筆原因在 `artifacts/test-site/exclusions.json`，不由總數反推原因分布。

| 學段 | 收錄來源紀錄數 |
|---|---:|
| 幼稚園／幼稚園暨幼兒中心 | 2,156 |
| 小學 | 616 |
| 中學 | 530 |
| 合計 | 3,302 |

這些是來源紀錄數，**不是合併校址／班別後的獨立學校總數**，也不是招生名額。班別 UNKNOWN、校址未核實、學費未知等狀態仍保留。

原始 hash：`e21ae78ecf8ba0e118c0117b4932dc63d76632ab71fff9dfb6203f9020666795`。本輪擷取：`2026-09-18T16:32:42.309Z`。資料發布 scope 為 `partial`，不是 full。

## 年度概覽原文

| 來源版本 | 原始紀錄 | 欄位 | 解析分隔 |
|---|---:|---:|---|
| 幼稚園 2025/26 | 962 | 104 | `^` |
| 小學概覽 2025 | 507 | 118 | `,` |
| 中學概覽 2025/2026 | 441 | 103 | `,` |
| 紀錄合計 | 1,910 | — | — |

三份原始檔已依 metadata hash 核對，Python 與 TypeScript 對同一原始檔的紀錄數一致；輸出網站的 index 與原文 JSON 在 Chromium 驗收時再次核對筆數／欄位數。

這批年度資料由 `/source-reference` 展示，使用 `UNLINKED_SOURCE_RECORD` 標籤，沒有偽造跨來源身份審核。來源版本是本次 CKAN 目錄所列選定 CSV，不宣稱等於學校網站最新概覽或 2027 入學招生安排。

公開招生事件：**0**。合成測試紀錄：**0**。沒有用虛構招生資料填充日曆。

## 已實際通過

- Frozen install、四個 package 型別檢查、ESLint。
- Node 原生回歸測試 **59 passed / 0 failed**。
- Vitest **100 passed / 0 failed**，7 個檔案。
- staging 前端建置、禁止索引 metadata、原文來源頁。
- 套用四份 migration 後，以 Node SQLite 執行真實資料 SQL、完整重播、檢查筆數及外鍵。
- 真正本機 D1 套用 migrations 001–004，匯入 **13,225 條 SQL**。
- workerd HTTP smoke **10 checks PASS**，`data_status=published`。
- Chromium 真實資料驗收 **2 passed**（桌面及手機）；每個包含三學段 API、無合成資料、比較頁、年度原文頁、三個來源原文筆數／欄位數。

HTTP 與瀏覽器測試在 `127.0.0.1:8787` 的真正 workerd 執行，**不是 finpulsx.win 遠端驗收**。既有 synthetic E2E 屬另一個 ordinary local-acceptance workflow，不與本輪真實資料混為一談。

## 已保存 artifact

[school-test-site-package](https://github.com/ray510/HK_APP/actions/runs/35369033994/artifacts/10557059428)

- Artifact ID：`10557059428`。
- 壓縮檔大小：16,938,294 bytes。
- Artifact ZIP SHA-256：`0233cd42c721ec9d1aff0a097572eb1fe0e676db8b2bfd144372bce04a0813cf`。
- 包含 2,019 個檔案：前端、年度原文 JSON、原始來源、SQL、manifest、coverage 及本機執行記錄。
- SQL 切成 67 塊，逐塊保留 SHA-256。
- 預算模型估算 69,040 rows written；**這是保守預算，不是實際 Cloudflare 帳單或遠端量測值**。
- Artifact 保留 30 天，非永久 production 封存。

[school-test-deployment-result](https://github.com/ray510/HK_APP/actions/runs/35369033994/artifacts/10557880241)

- Artifact ID：`10557880241`。
- 只含實際 `deployment-result.json` 阻塞結果；沒有虛構 DB UUID 或成功網址。
- `writes_performed=false`；未執行 provider 讀寫。

## 重新部署與再驗收

憑證與 migration 阻塞已解除。之後任何程式變更要上測試站，按 [TEST_SITE_DEPLOYMENT.md](TEST_SITE_DEPLOYMENT.md) 以 `workflow_dispatch` 啟動新 run：artifact 有效期內填 `reuse_package_run_id`（同一資料包、同一 DB，前端以新 commit 重建），已完成的 DB 會因 `test_site_builds` ready=1 跳過匯入；資料包過期或來源更新則留空，建立新 build ID 與新 DB。

線上瀏覽器再驗收（桌面＋手機 Chromium，唯讀）：啟動 **Live test-site browser acceptance (read only)** workflow，結果在 artifact `school-live-acceptance`。
