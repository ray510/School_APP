# HK_APP — 香港年度選校資訊平台

**目前：Phase 1 穩定化，未完成正式網站；不應部署 production。**

開發規格見 `DEVELOPMENT.md`，Cloudflare 上線門檻見 `DEPLOY_CLOUDFLARE.md`。目前執行證據及限制以 `docs/STABILIZATION_STATUS.md` 為準；初次提交的完成報告已撤回。

## 本機起步（Windows PowerShell / macOS / Linux）

使用 Node 24.x、pnpm 10.28.0。以下順序不部署 Cloudflare。

```powershell
corepack enable
corepack prepare pnpm@10.28.0 --activate
# 只限尚未有 lockfile 的 bootstrap；取得並審核 lockfile 後必須改為 --frozen-lockfile。
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build:web
pnpm build:worker
pnpm db:migrate:local
pnpm fixture:local
pnpm dev:worker
```

另一個終端：

```powershell
pnpm smoke:local
pnpm dev:web
```

前端：`http://127.0.0.1:5173`，Worker：`http://127.0.0.1:8787`。首次啟動 Worker 前必須 build:web，因 ASSETS 指向 dist。

fixture 是清楚標記的假學校資料，沒有公開 release head、沒有招生日期；health 的 `readiness: empty` 是正確結果。不要為了讓它變綠而發布假資料。

## 不安裝依賴也可執行的回歸測試

```powershell
node scripts/run-regressions.mjs
```

此組測試使用 Node 原生 TypeScript stripping / SQLite 和明確的 workspace test resolver；不是 pnpm 安裝、Vue 建置或 Cloudflare runtime 的驗收證據。

## 可用 CLI 與限制

`pnpm school fixture seed --environment local`、`pnpm school config check --environment local`、`pnpm school smoke --environment local --base-url http://127.0.0.1:8787` 已連接到本機流程。

source probe/build、review、遠端 config/smoke 仍返回 BLOCKED。任何 local helper 都不接受任意 Wrangler 參數或 remote database；build:worker 只執行 dry-run。尚未有驗證過的 lockfile，請先檢查 CI 結果及 artifact，再把審核後的 lockfile 加入版本控制。
