# 香港選校年鑑 HK_APP

香港幼稚園、小學及中學的年度選校工具。Vue 3 + TypeScript + Hono + Cloudflare Workers Static Assets + D1。

**目前交付：已上線並完成線上驗收的北區三學段試點。** 包含 30 個已配對的學校／校址年度資料項目、15 項有來源證據及適用條件的招生事件，以及比較、私人清單與 ICS 流程。這不是全港資料已核實或 production 正式上線。

測試站：<https://schools-test.finpulsx.win>

建議入口：<https://schools-test.finpulsx.win/schools?level=PRIMARY&year=2027&has_annual=1>

## 最新驗收

- 已部署程式 commit：`cee3fc3f06560e98a8d2e4fdd7b7398ca879753c`。
- 最後測試修正：`b29ea6d10b4d479bf545aa54f64335cc90aed4ad`；等待 IndexedDB 儲存完成才導航／刷新，保留持久化及不傳送筆記的斷言。
- [Reviewed school pilot delivery — run 35425446270](https://github.com/ray510/HK_APP/actions/runs/35425446270)：prepare / deploy **success**。
- `LIVE_VERIFIED`：`2026-09-19T06:03:52.290Z`；其後線上 desktop / mobile Chromium **4 passed**。
- 完整證據、資料限制、備份與恢復邊界：[docs/PILOT_LIVE_ACCEPTANCE.md](docs/PILOT_LIVE_ACCEPTANCE.md)。

本次 70 項 Node 回歸、111 項 Vitest、13 項 Python SQLite publication 測試、本機及線上各 4 項 Chromium 流程通過。執行環境是 GitHub Actions Ubuntu / Node 24，沒有宣稱在使用者 Windows 或 production 驗收。

工作分支：`fix/phase1-stabilization`；[Draft PR #1](https://github.com/ray510/HK_APP/pull/1)。本輪未合併 main。後續文件 commit 不等於已部署程式版本。

## 已實作功能

| 功能 | 範圍 |
|---|---|
| 學校搜尋及詳情 | 三學段、入學學年、校名、來源地區及資助類別；固定 release 分頁 |
| 試點年度資料 | 北區各學段 10 個配對項目；年度摘要、原文、識別及來源證據 |
| 最多四校比較 | 同學段比較；年度資料保留來源版本、所屬時期及未知狀態 |
| 私人清單 | IndexedDB 本機儲存、筆記、進度、JSON 備份及匯入衝突預覽、跨分頁 revision 檢查 |
| 招生日曆 | 15 項已發佈、有證據及適用條件的事件；date-only 與確切時間分開、ICS 匯出 |
| 私人事件 | 只存瀏覽器，與官方公告分開；隨私人 JSON 備份匯出 |
| 資料流程 | 原始 hash、來源審閱、immutable 版本、CAS 發佈及 audit；相同資料重播不重複發佈 |
| 部署保護 | 測試主機與既有 D1 限定、寫入前備份、帳戶額度檢查、noindex、無 HTTP 管理寫入 |

基本名錄仍為 partial；原始來源紀錄不等於去重後獨立學校數。未納入試點的年度原文繼續獨立展示。15 項事件包含共同或有條件程序，並非每間學校都有個別招生公告。試點配對屬 assistant-assisted source review，`human_review=false`，不是官方認證。

學校名錄不是招生資格或錄取概率。未知欄位不由去年日期或虛構數字填補。歷史概覽不因選擇 2027 入學而成為 2027 已確認收費。CSV 文字不當 HTML 執行，學校自述不轉成平台排名。

## 本機開始使用

需要 Node 24.x、pnpm 10.28.0。以下 PowerShell 指令只操作本機。切換分支前先保存未提交修改，不要使用 reset --hard。

```powershell
git fetch origin
git switch fix/phase1-stabilization
git pull --ff-only
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm build:web
pnpm db:migrate:local
pnpm fixture:local
# 以下為純本機示範，不是真實學校
pnpm school demo --environment local
pnpm dev:worker
```

瀏覽 `http://127.0.0.1:8787`。另一終端的 `pnpm dev:web` 使用 5173，API 轉送本機 8787。若 8787 已被其他程序佔用，先確認程序用途，不要擅自結束其他服務。

## 測試

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm exec tsx tests/integration/prepare.ts
python tests/integration/publication.py
pnpm build:web
pnpm build:worker
```

`build:worker` 是 dry-run，不上傳。`pnpm test` 不包含 Python 或瀏覽器測試；完整 CI 會另行執行。試點 Playwright 需要正確的真實試點資料；一般本機 demo 不能代替。

## 更新測試站

本輪使用 `.github/workflows/pilot-delivery.yml` 和 `scripts/pilot-deploy.mjs`。只更新 `schools-test.finpulsx.win`、既有 `hk-school-guide-test` 與已核對的 D1；沒有新建資料庫。實際遠端 ledger 為 001–005。

API Token 只由 GitHub staging secret 注入部署步驟，不要提交或貼出 Token。必須保留 prepare 成功門檻、審核及帳戶額度檢查。新資料發佈前仍需更新對應來源審閱與版本，不要靠略過 release 衝突強行更新。

一般 `pnpm school` import/publish 工具仍有其 local-only 限制；不要將專用、已授權 staging updater 與未完成的通用 production importer 混為一談。

基礎名錄部署與資料包重用方式：[docs/TEST_SITE_DEPLOYMENT.md](docs/TEST_SITE_DEPLOYMENT.md)。年度資料操作：[docs/ANNUAL_DATA_OPERATIONS.md](docs/ANNUAL_DATA_OPERATIONS.md)。較早狀態文件僅代表其所標日期及 commit；本輪現況以 [docs/PILOT_LIVE_ACCEPTANCE.md](docs/PILOT_LIVE_ACCEPTANCE.md) 為準。

## 備份及未完成的正式營運門檻

本次 `reviewed-pilot-package` 及 `reviewed-pilot-live-evidence` artifact 保留至 2026-12-18；後者包含寫入前 `before.sql`、hash、版本記錄及線上截圖。此為有期限的備份，不是永久封存。不可直接將備份 SQL 覆蓋匯入現有非空資料庫。

正式營運仍須擴展資料配對與當屆公告覆核、持久備份、production 權限、安全及成本評估；本輪沒有修改主站、其他子網域、production、cron 或付款方案。

私人筆記及申請進度只存家長瀏覽器，沒有伺服器同步；請避免填寫兒童身份證明、成績或其他敏感資料，並自行定期匯出備份。
