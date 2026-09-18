# 香港選校年鑑 HK_APP

Vue + Hono + Cloudflare Workers Static Assets + D1。繁體中文、手機優先，資料版本與入學學年分開；不提供排名、錄取概率或代報名。

## 本機啟動（Node 24.x，pnpm 10.28.0）

```powershell
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build:web
pnpm db:migrate:local
pnpm fixture:local
# 可選：加入清楚標示的 synthetic UI 示範，僅 local
pnpm school demo --environment local
pnpm dev:worker
```

瀏覽 `http://127.0.0.1:8787`。另開終端執行 `pnpm dev:web` 可啟用前端熱更新（5173，API proxy 到 8787）。`pnpm build:worker` 僅 dry-run，不部署。

私人資料存在瀏覽器 IndexedDB；沒有登入或雲端同步。清除網站資料會移除私人記錄，請先匯出備份。

## 功能

- 按學段、入學學年、校名、來源地區及資助類別搜尋；固定 release 的分頁。
- 學校頁與同學段最多四項比較；零元、未知、不適用費用分開。
- 私人清單、筆記、狀態、JSON 匯出／匯入、衝突預覽、跨分頁 revision 保護。
- 僅讀已核實已發佈事件；空狀態不假造日期；全天 ICS 使用 exclusive end。
- 私人事件與官方事件分开；私人事件只隨 JSON 備份匯出。
- S01 顯式來源下載、raw hash 保存、小樣本 bundle、人工 hash 審核、本機匯入、原子發佈與回滾。

## 來源與本機資料流程

```powershell
pnpm school source probe --all --out artifacts/source-probe.json
pnpm school source build --source edb-school-directory --level PRIMARY --scope canary --limit 5 --out artifacts/primary-canary
pnpm school review prepare --bundle artifacts/primary-canary
# 人工閱讀 review.json、coverage.json 及官方來源後，才確認 exact manifest hash：
pnpm school review approve --bundle artifacts/primary-canary --reviewer YOUR_OPERATOR_ID --confirm-hash HASH_FROM_REVIEW
pnpm school import plan --bundle artifacts/primary-canary --environment local
pnpm school import run --bundle artifacts/primary-canary --environment local
# release ID 從 bundle.json 取得。首次發佈要求目前沒有 head，revision=0：
pnpm school release publish --release-id RELEASE_ID --channel profiles:PRIMARY --expected-revision 0 --actor YOUR_OPERATOR_ID --environment local
```

有現存 head 必須明確提供它的 revision 和 `--expected-previous-release-id`。過期 CAS、無有效 hash 審核、數量不符、全量被小樣本覆蓋均拒絕。回滾使用 `release rollback`，目標必須已發佈且同 channel；保留版本和審計。

`canary` 不是完整名錄。重複校號全部隔離；特殊學校另列未覆蓋，不誤放入普通學段。S01 學校班別原始值與身份影響尚未完成對照，暫保留 UNKNOWN。年度概覽 S02–S04 僅探測目錄，未完成 adapter／跨來源識別，不冒稱已整合。

## 驗證

```powershell
pnpm exec tsx tests/integration/prepare.ts
python tests/integration/publication.py
# 本機 Worker 運行、demo 已加入：
node tests/integration/catalog-http.mjs
pnpm --filter @hk-school/web exec playwright install chromium
pnpm test:e2e
```

CI 會執行 frozen install、型別、lint、unit、SQLite publication、真正 workerd/D1 HTTP、desktop/mobile Chromium。請以對應 commit 的 CI 結果為準；新增測試檔不等於已通過。

## 部署邊界

本輪不部署 Cloudflare，不改 remote D1，不啟用 cron。所有新增寫入工具只支援 local，remote 會明確 BLOCKED。`DEPLOY_CLOUDFLARE.md` 的完整遠端流程是目標規格，並非本版全部可執行。正式環境前仍需來源覆蓋、持久 archive、遠端配額、安全權限、staging canary、真實瀏覽及回滾證據。

詳見 `docs/IMPLEMENTATION_STATUS.md`。原始設計保留在 `DEVELOPMENT.md`；不把本機通過等同全平台上線完成。
