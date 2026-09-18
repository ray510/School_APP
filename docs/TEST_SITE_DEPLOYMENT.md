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

工作流程：`.github/workflows/test-site-release.yml`，顯示名稱 **Real data and finpulsx test deployment**。

`prepare`：frozen install → typecheck/lint/tests → 下載四個官方來源 → 生成 staging 前端及真實資料包 → SQLite 匯入重播與外鍵檢查 → 真正本機 D1 匯入 → desktop/mobile Chromium 驗收 → 保存資料及網站 artifact。

`deploy`：讀取 staging 憑證 → 查證帳戶／zone／DNS 衝突及帳戶總額度 → dry-run → 建立獨立測試 D1 → migration／資料匯入／資料庫核對 → 部署單一 Custom Domain → HTTPS、API、年度來源與禁止索引驗收。

只有最後結果為 `LIVE_VERIFIED` 才代表實際網址已驗收；`BLOCKED_MISSING_CREDENTIALS`、`BLOCKED`、`DEPLOYED_NOT_VERIFIED` 均不等於測試站可用。

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

已加入有效 Token 後，對資料準備成功而 deployment 失敗的 run 選 **Re-run failed jobs**。在 artifact 仍有效期間，會重用同一資料及網站包，不必重做來源下載；若 artifact 已過期，重跑整個工作流程。工作流程只在其檔案變更時自動触發，並提供 workflow_dispatch；尚未合併預設分支時，以已存在的 run 重跑為最直接路徑。

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
