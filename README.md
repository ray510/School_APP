# 香港選校年鑑 HK_APP

香港幼稚園、小學及中學的年度選校工具。Vue 3 + TypeScript + Hono + Cloudflare Workers Static Assets + D1。

**目前交付：本機可運行、已有實際 CI 驗收的 MVP；不是已完成全港資料審核或 production 上線。** 程式驗證、資料覆蓋及部署是三個獨立門檻。

工作分支：`fix/phase1-stabilization`；Draft PR：<https://github.com/ray510/HK_APP/pull/1>。`main` 尚未合併。

## 開始使用

需要 Node 24.x、pnpm 10.28.0。以下 PowerShell 指令不會部署或寫入遠端 D1。切換分支前請先保存現有未提交修改；不要使用 reset --hard。

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
# 可選：新增明確標示為測試的學校，純本機示範
pnpm school demo --environment local
pnpm dev:worker
```

瀏覽 `http://127.0.0.1:8787`。另一個終端執行 `pnpm dev:web` 可用 5173 前端熱更新，API 轉送本機 8787。示範學校、地址及費用不是真實資料；若已有正式資料 channel，搜尋會優先使用它。

Windows 指令已提供；實際自動驗收環境是 GitHub Actions Ubuntu + Node 24，不冒稱已在你的 Windows 電腦實跑。

## 已實作功能

| 功能 | 範圍 |
|---|---|
| 學校搜尋及詳情 | 三學段、入學學年、校名、來源地區及資助類別；固定 release 分頁 |
| 最多四項比较 | 同學段、同一資料版本；區分零元、未知與不適用 |
| 年度概覽 | 三個來源專用 parser、身份配對待審清單、hash 審核、版本 API、詳情頁原始欄位及來源證據 |
| 私人清單 | IndexedDB 本機儲存、筆記、申請進度、JSON 備份及匯入衝突預覽、跨分頁 revision 檢查 |
| 招生日曆 | 僅展示已核實已發佈事件、date-only 與確切時間分開、ICS 匯出 |
| 私人事件 | 只存瀏覽器，與官方公告分開；隨私人 JSON 備份匯出 |
| 資料流程 | 明確來源下載、raw hash 保存、canary、hash 綁定審核、本機 import、原子發佈及回滾 |
| 建置與防誤部署 | 環境 metadata、robots、安全標頭、offline preflight、遠端寫入預設拒絕 |

學校名錄不是招生資格或錄取概率。沒有資料時顯示空狀態，不用去年日期或虛構數字填滿畫面。年度 CSV 文字以文字呈現，不作 HTML 執行；學校自述不轉成平台評分。

## 真實來源流程

```powershell
pnpm school source probe --all --out artifacts/source-probe.json
pnpm school source build --source edb-school-directory --level PRIMARY --scope canary --limit 5 --out artifacts/primary-canary
pnpm school review prepare --bundle artifacts/primary-canary
```

先核對 `review.json`、`coverage.json` 及官方原文，再用確切 manifest hash 批准：

```powershell
pnpm school review approve --bundle artifacts/primary-canary --reviewer YOUR_OPERATOR_ID --confirm-hash EXACT_REVIEWED_HASH
pnpm school import plan --bundle artifacts/primary-canary --environment local
pnpm school import run --bundle artifacts/primary-canary --environment local
pnpm school release publish --release-id EXACT_RELEASE_ID --channel profiles:PRIMARY --expected-revision 0 --actor YOUR_OPERATOR_ID --environment local
```

最後一行只適用於該 channel 首次發佈。已有 head 時必須使用實際 revision 及 `--expected-previous-release-id`。過期 CAS、未審核 hash、數量不符或以小樣本覆蓋全量均會拒絕。

**canary 不是完整名錄。** 重複校號全部隔離，特殊學校明確列出未覆蓋；未確認班別保留 UNKNOWN。HTTP Last-Modified 不當成資料所述學年。

年度概覽及招生事件操作詳見 [docs/ANNUAL_DATA_OPERATIONS.md](docs/ANNUAL_DATA_OPERATIONS.md)。三份年度來源已以真實 raw 驗證 parser，但跨來源候選沒有自動批准，全量年度資料沒有自動發佈。

## 驗證

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm exec tsx tests/integration/prepare.ts
python tests/integration/publication.py
pnpm build:web
pnpm build:worker
# 本機 Worker 啟動、demo 已加入後：
node tests/integration/catalog-http.mjs
pnpm --filter @hk-school/web exec playwright install chromium
pnpm test:e2e
```

`build:worker` 只 dry-run，不上傳。`pnpm test` 不包含 Python／瀏覽器驗收；CI 另行執行這些套件。

已驗證程式 commit：`39594dc525ceccb69e31527798c66810b4517daf`。

- 本機全套驗收：<https://github.com/ray510/HK_APP/actions/runs/35366624076> — success。
- 真實來源及三份年度 parser：<https://github.com/ray510/HK_APP/actions/runs/35366620214> — success。

檢查定義、限制及未完成門檻見 [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)。GitHub CI success 不等於已完成 production 或資料人工審核。

## 部署邊界

所有新增 import／publish 命令只支持 local；沒有遠端 migration、seed、cron、付費服務或 production 部署。`scripts/deployment-preflight.mjs` 只驗證本機配置及提供的額度觀察，並不代替已授權的遠端帳戶檢查。

完整開發及部署規格仍在 `DEVELOPMENT.md`、`DEPLOY_CLOUDFLARE.md`；其中遠端 importer/reviewer、durable archive、staging／production 步驟並非本版全部完成。不要因為文件存在就執行未實作的部署命令。

正式上線前仍須完成資料配對覆核、招生事件維護、production 權限、帳戶總額度、持久備份、成本量測及 staging canary 驗收。私人資料不會由本平台同步到伺服器；請避免在筆記填寫兒童身份證明、成績或其他敏感資料。
