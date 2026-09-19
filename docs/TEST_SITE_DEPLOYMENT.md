# finpulsx.win 選校測試站

## 目標與範圍

- 唯一允許的 hostname：`schools-test.finpulsx.win`。
- Worker：`hk-school-guide-test`；`workers.dev`、preview URLs、cron 及 HTTP 管理寫入關閉。
- D1：`hk-school-guide-test-<資料包 hash 前 12 碼>`，每個新資料包使用獨立資料庫。舊資料庫不會自動刪除；同一已完成資料包可重跑驗證。
- 不修改 `finpulsx.win` 主站、其他 subdomain、原本 production 設定、DNS nameserver 或付款方案。
- 此次使用者已明確授權測試站與測試資料庫部署；不是 production 全面上線授權。

## 已確認的權限阻塞

首次實際權限檢查：GitHub Actions run [35368038484](https://github.com/ray510/HK_APP/actions/runs/35368038484)，job `cloudflare-access`。

結果：`BLOCKED_MISSING_CREDENTIALS`，`token_present=false`、`account_configured=false`。該 job 沒有發出 Cloudflare provider request，亦沒有遠端寫入。這是 staging job 可取得憑證的檢查結果，不表示使用者在所有其他電腦或帳戶都沒有憑證。

連接 GitHub 不會同時授予 Cloudflare 部署權限。不要將 API Token 貼入對話、PR、文件、程式碼或 `.env` 提交。

## 一次執行流程

工作流程：`.github/workflows/test-site-release.yml`，顯示名稱 **Real data and finpulsx test deployment**。**只由 `workflow_dispatch` 觸發**；push 不會自動部署，因為每次重新生成資料包都會得到新的 build ID，進而建立第二個測試資料庫。

兩個輸入：

| 輸入 | 意義 |
|---|---|
| `reuse_package_run_id` | 重用該 run 的 `school-test-site-package` artifact（真實資料包）。留空＝重新下載來源並生成新資料包（新 build ID、新測試 DB）。 |
| `resume_database_id` | 當同名測試 DB 已存在但沒有 ownership 表時，允許續跑的 DB ID；必須與該 run 的 `deployment-result.json` 一致。留空＝不允許續跑。 |

`prepare`（重用路徑）：frozen install → typecheck/lint/tests → 下載指定 run 的資料包及 deployment-result artifact → 逐塊 SQL hash、四個來源原始檔 hash、年度原文筆數與 manifest 互相核對 → **以目前 commit 重建 staging 前端**，再疊回資料包的年度原文與 `test-data-report.json` → 寫入 `package-provenance.json`（資料包 build ID、資料來源 commit、前端 commit）→ 真正本機 D1 套用 migration 及匯入 → HTTP smoke → desktop/mobile Chromium 驗收 → 保存 artifact。

`prepare`（全新路徑，`reuse_package_run_id` 留空）：同上，但先下載四個官方來源並生成新的資料包。

`deploy`：讀取 staging 憑證 → 查證帳戶／zone／DNS 衝突及帳戶總額度 → dry-run → 依 build ID 找同名 D1；不存在則建立；已存在則**先唯讀讀取 schema、migration ledger 及各表筆數**，再依下列規則決定 → migration／資料匯入／資料庫核對 → 部署單一 Custom Domain → HTTPS、API、年度來源與禁止索引驗收。

既有 DB 的續跑規則（`scripts/deploy-test-site.mjs` 的 `assessExistingDatabase`，有回歸測試）：

- 有 `test_site_builds`：owner／hostname／build ID 必須相符；`ready=1` 跳過匯入，否則重跑冪等匯入。
- 沒有 `test_site_builds`（上次在資料包執行前中斷）：**缺表不等於允許接管**。必須同時滿足：DB 名稱由 manifest build ID 推出、`resume_database_id` 等於實際 DB ID、上次 deployment-result 的 DB ID／名稱／build ID／hostname 一致、ledger 是 repo migration 的前綴、schema 只含已套用 migration 的表、所有資料表為空。任一不符即 `BLOCKED_RESUME_UNVERIFIED`，不寫入、不刪庫、不另建 DB。

只有最後結果為 `LIVE_VERIFIED` 才代表實際網址已驗收；`BLOCKED_MISSING_CREDENTIALS`、`BLOCKED`、`BLOCKED_RESUME_UNVERIFIED`、`DEPLOYED_NOT_VERIFIED` 均不等於測試站可用。

## Migration 與 D1 遠端 splitter

`wrangler d1 migrations apply --remote` 會把整份 migration 交給 D1 `/query` endpoint，由**伺服器端**切句；本機 `--local` 則用 Wrangler 自己的 splitter。兩者行為不同：伺服器端以大寫 `BEGIN` 進入 trigger 區塊、遇到第一個 `END` 就結束，**不會巢狀計算 `CASE … END`**，因此 trigger 內的 `SELECT CASE WHEN … THEN RAISE(…) END;` 會令遠端回 `incomplete input: SQLITE_ERROR [code: 7500]`，而本機通過。

本 repo 的規則（`tests/regression/migration-guards.test.mjs` 會檢查）：

- trigger 內的條件式中止一律寫成 `SELECT RAISE(ABORT,'CODE') WHERE <condition>;`，語義與原本的 `CASE` 寫法相同（條件為真才中止、NULL 不中止），但沒有第二個 `END`。
- trigger 一律用大寫 `BEGIN`；`migrations/*.sql` 由 `.gitattributes` 固定 LF（Windows `core.autocrlf` 會在 checkout 時轉成 CRLF，同樣會令遠端失敗）。
- 已套用的 migration 不改語義；本次只改寫遠端 ledger 尚未套用的 002–004。

## 憑證設定

在 GitHub 的 `ray510/HK_APP`，將 Cloudflare API Token 放入 **staging environment secret** 或 repository Actions secret：

```text
CLOUDFLARE_API_TOKEN
```

工具亦兼容現有 `CF_API_TOKEN`。`CLOUDFLARE_ACCOUNT_ID` 可以放入 environment/repository variable 或 secret；沒有提供時會由唯一符合的 active `finpulsx.win` zone 查出，若提供則必須相符。

Token 僅限擁有 `finpulsx.win` 的 Cloudflare 帳戶；zone 權限僅限 `finpulsx.win`。首次建立新 Worker 需要 Workers product-level Admin；這不等於給予整個 Cloudflare 帳戶 Super Administrator。該 bootstrap token 可設定短期到期，完成後回收並按實際維護需要收窄。

此流程需要的能力：

| 能力 | 用途 |
|---|---|
| Workers Admin（首次建立；Workers product scope） | 建立／部署專用測試 Worker；只給 Editor 不能建立尚未存在的 Worker |
| D1 Write/Edit 與讀取能力 | 建立專用 DB、migration、匯入及核對 |
| Account Analytics Read | D1 UTC 當日帳戶總讀寫量檢查 |
| Zone Read + DNS Read（僅 finpulsx.win） | 找到正確 zone、確認 hostname 未被其他站佔用 |
| Zone Workers Routes Write（僅 finpulsx.win） | 設定測試 Custom Domain |

權限名称以 Cloudflare 當前控制台顯示及官方文件為準；不同 API 仍可能要求附加的讀取能力。**尚未以實際 provider Token 驗證寫入權限，不能聲稱加上任意 Token 就一定可部署。**

官方文件（本次已核對）：
- [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Create D1 database](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/)
- [GraphQL Analytics token](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/)
- [GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

程式修正後**不要**對舊 run 選 Re-run failed jobs——那會用舊 commit 的程式部署。改為在工作分支上以 `workflow_dispatch` 啟動新 run，並填入要重用的資料包 run ID 及可續跑的 DB ID，例如：

```bash
gh workflow run test-site-release.yml --ref fix/phase1-stabilization \
  -f reuse_package_run_id=<資料包所在 run> -f resume_database_id=<上次 deployment-result 的 database_id>
```

artifact 仍有效（30 天）時會重用同一份已核對 hash 的資料包，只重建前端；artifact 過期則留空 `reuse_package_run_id` 重新生成（新 build ID、新 DB）。

## 測試資料不是示範資料

基本名錄：只使用實際 S01 官方資料；精確校類及唯一來源鍵通過檢查後收錄。重複／不明鍵、未納入的特殊學校及資料驗證錯誤列入 exclusions。scope 為 `partial`，不冒稱全港所有學校均已配對。

基本名錄的 staging publication 以 `automated-source-qa:staging-only` 記錄機械式結構／唯一鍵審核。證據明確保留 `human_review=false`；不冒充人工逐校審核。原本需人工批准的年度 canonical import 並沒有被解除保護。

年度概覽：將官方 CSV 中三學段紀錄分別輸出到 `source-reference`。使用者可按來源／概覽版本搜尋並查看全部原始欄位。每筆明確為 `UNLINKED_SOURCE_RECORD`，不因同名就合併至另一學校。這條展示路徑不需要先虛構 canonical identity 批准。

年度資料保留原文與來源日期，不把概覽版本當作目標入學年，也不把舊年度收費、招生日期當成當屆公告。原文中的空欄保留未知；公開招生事件數為零，直到另有真正審核資料。私人筆記及事件仍只在家長瀏覽器 IndexedDB。

### 成果檔案

`school-test-site-package` artifact：
- `apps/web/dist/`：可部署前端、分來源的年度原文紀錄及 `test-data-report.json`。
- `archive/`：四個來源的原始檔與 metadata/hash。
- `artifacts/test-site/manifest.json`：真實筆數、排除數、資料 hash、SQL 分塊 hash、預算估計及驗收標記。
- `artifacts/test-site/exclusions.json`：排除來源鍵與原因。
- `artifacts/test-site/part-*.sql`：資料包 SQL。

`school-test-deployment-result` artifact：實際部署結果、可能的 D1 寫入回報、產生的專用 Wrangler 設定。缺憑證時只有阻塞報告，沒有假 DB ID 或虛构成功 URL。

artifact 目前保留 30 天，屬測試站恢復材料，**不是永久 production 備份方案**。正式營運前需另做持久封存。Cloudflare provider log 若沒有提供精確 rows_written，就保留 null，不填零。

## 成本、衝突及失敗处理

部署前檢查帳戶總當日 D1 讀寫量（不是只看新 DB）、儲存與 DB 數量，並保留預算緩衝。Analytics 可能滯後，並不能保證其他專案並行活動不耗盡額度；檢查不足或不確定即停止，不自動升級付費。

DNS／Worker 路由若已佔用目標 hostname，流程停止，不刪除或接管既有配置。新 DB 完成資料核對後才部署 Worker。若資料匯入途中失敗，保留資料庫供核實；不自動重建、清空或刪除。若 Worker 部署已返回但 HTTPS 驗收未通過，記錄 `DEPLOYED_NOT_VERIFIED`，不把它當成完成。

重跑已成功資料包會先檢查該 DB 的 `test_site_builds` ownership／build ID／ready。為防混用，沒有正確 ownership 的既有 DB 必須人工核實，不能強行覆蓋。

## 本機執行入口

先完成 repo 安裝及來源下載；所有資料構建均在 repo root：

```powershell
$env:SCHOOL_BUILD_ENV = 'staging'
pnpm build:web
pnpm exec tsx scripts/test-site-data.ts

# 只有已在本機安全提供有效 Cloudflare 憑證時，才明確執行：
$env:SCHOOL_TEST_DEPLOY = 'schools-test.finpulsx.win'
node scripts/deploy-test-site.mjs --execute
```

這些是已提交的程式入口，不代表遠端已實跑。實際狀態應以指定 GitHub Actions run 與 `deployment-result.json` 為準。
