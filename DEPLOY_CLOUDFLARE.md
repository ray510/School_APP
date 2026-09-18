# 香港年度選校資訊平台｜Cloudflare 部署手冊

> 專案代號：`hk-school-guide`  
> 文件版本：1.0｜官方文件核對日期：2026-09-18  
> 配套規格：同目錄 `DEVELOPMENT.md`  
> 主要操作環境：Windows PowerShell；所有路徑由 repository 根目錄開始。

**這是部署 runbook，不是可直接部署的程式碼套件。** 必須先按開發規格完成 repo、migrations、測試和本專案 CLI，才可執行相關命令。`pnpm school ...` 是待實作的專案指令，不是 Cloudflare 內建命令。本文沒有執行登入、建立資源、寫入遠端資料庫或發佈網站。

---

## 1. 部署方案與免費範圍

### 1.1 基線架構

```text
家長瀏覽器
  ├─ HTML / JS / CSS ─── Cloudflare Workers Static Assets
  └─ 同源 /api/* ─────── Cloudflare Worker ─── D1

營運者的本機 Node.js CLI
  ├─ 官方來源抓取、解析、原始備份、差異及人工核實
  └─ 小批次管理 API ─── staged release ─── 審核 ─── 發佈

R2：選擇性雲端 raw archive；基線不啟用
Cron：基線沒有排程；後續僅可加入已量測的輕量檢查
```

使用 **一個 Worker＋Static Assets**，不另建 Pages。一般 Vite 編譯前端，Wrangler 打包 TypeScript Worker；本手冊不使用 Cloudflare Vite plugin，環境選擇一致採 `--env`。[C01][C02]

### 1.2 重要成本與容量限制

| 產品 | 截至核對日的官方 Free 額度／限制 |
|---|---|
| Workers 動態請求 | 每日 100,000 |
| Worker CPU | HTTP request 10 ms；Free Cron 亦為 10 ms |
| Static Assets | 直接服務的靜態請求免費；匹配 worker-first 的請求會執行 Worker |
| D1 | 每日 5,000,000 rows read、100,000 rows written |
| D1 儲存 | 每個 Free DB 500 MB；帳戶合計 5 GB；Free 最多 10 個 DB |
| D1 Time Travel | Free 7 天，不等於長期 archive |
| R2 Standard（選配） | 每月 10 GB-month、100 萬 Class A、1,000 萬 Class B 的免費用量 |

Workers／D1 限制及計費依官方文件；D1 索引、migration、審計及重試都可能消耗讀寫額度。[C03][C04][C05][C06]

R2 需要 subscription／checkout，超出包含用量可能收費，不能宣稱強制封頂零費用。因此基線不建立 R2 bucket、不放 R2 binding，也不依賴付費 DNS 網域、外部地圖、郵件或 AI。[C07][C08]

**本機資料清理不是可有可無的最佳化：** 不應讓一次免費 Worker invocation 解析全份年度資料、生成大量 diff 或做大型 backfill。第一版不保證全自動更新，營運模式須明示。

---

## 2. 環境隔離及執行關卡

| 環境 | Worker 名稱 | DB 名稱 | 排程 | 資料 |
|---|---|---|---|---|
| local | 不發佈 | `hk-school-guide-local`，本機模擬 | 關閉 | 清楚標記的 fixture |
| staging | `hk-school-guide-staging` | `hk-school-guide-staging-db` | 關閉 | 真實 canary／標記 fixture；禁止搜尋引擎索引 |
| production | `hk-school-guide` | `hk-school-guide-production-db` | 預設關閉 | 只准已核實真實資料 |

不要使用同一 DB ID，不要把 staging token 用於 production，不要在原有其他專案的 DB 執行本專案 migration。使用者已存在的 Cloudflare 專案可能共用**帳戶總配額**，建立新 DB 不會重設日限額。

### 關卡順序

```text
G0：本機程式＋測試完成
 → G1：Cloudflare 帳戶、額度、資源身份核對
 → G2：staging schema + disabled-admin Worker
 → G3：staging 真實小樣本匯入、審核與 smoke
 → G4：明確批准 production 部署
 → G5：production schema + disabled-admin Worker
 → G6：完整 scope 資料審核、受控發佈、回滾證據
```

沒有任一關卡的證據，相關步驟就應 `BLOCKED`，不可寫 PASS。**閱讀本文件不構成授權 Coding Agent 自行操作 production。**

---

## 3. 執行前準備

### 3.1 工具與 repo

專案選用 Node.js 24，實作時鎖定經測試的 patch；pnpm、Wrangler、Vue、Vite 和測試依賴均鎖定於 repo。部署不要用浮動 `npx ...@latest` 或自行升級 lockfile。

首次開發尚無 lockfile，先由 Phase 0／1 建立及測試；以下正常部署流程假設 `pnpm-lock.yaml` 已存在。

```powershell
Set-Location 'D:\hk-school-guide'  # 改成實際 repo 路徑
$ErrorActionPreference = 'Stop'

# Windows PowerShell 對原生程式的非零 exit code 不一定自動拋錯。
function Assert-NativeSuccess {
    param([Parameter(Mandatory = $true)][string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step 失敗；exit code=$LASTEXITCODE。停止後續步驟。"
    }
}

node --version
Assert-NativeSuccess 'Node version'
pnpm --version
Assert-NativeSuccess 'pnpm version'
git status --short
Assert-NativeSuccess 'git status'

pnpm install --frozen-lockfile
Assert-NativeSuccess '安裝鎖定依賴'
pnpm exec wrangler --version
Assert-NativeSuccess 'Wrangler version'
pnpm school --help
Assert-NativeSuccess '專案 CLI'
```

如果 repo 不存在或 `pnpm school` 尚未實作，停止部署，返回 `DEVELOPMENT.md`。不要把本文當成空資料夾的自動生產安裝器。

### 3.2 先跑所有本機檢查

```powershell
foreach ($Task in @('typecheck', 'lint', 'test', 'test:e2e')) {
    pnpm run $Task
    Assert-NativeSuccess $Task
}
```

Playwright 瀏覽器缺少時依 repo 的已測試 bootstrap 指令安裝；測試未跑不能略過再部署。取得現在 commit：

```powershell
$Commit = (git rev-parse HEAD).Trim()
Assert-NativeSuccess '取得 commit'
New-Item -ItemType Directory -Force '.\artifacts\deploy' | Out-Null
```

有未提交修改時保留並報告，不擅自 stash、reset、commit 或切 branch。production 部署須能追溯到經核准的 build 內容；不能以一個不包含實際變更的 commit hash 作完整證據。

---

## 4. 唯一的 Wrangler 設定檔

以下放在 **repository 根目錄** `wrangler.jsonc`。`REPLACE_...` 只有 staging／production DB 建立後才可填入真實 ID；未替換禁止遠端部署。

綁定及 `vars` 不會自動由其他 named environment 繼承，故每個環境完整列出。[C02] 本檔的 top-level 名稱故意不可作正式部署使用；所有命令必須指定 environment。

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "hk-school-guide-do-not-deploy",
  "main": "apps/worker/src/index.ts",
  "compatibility_date": "2026-09-18",
  "workers_dev": false,
  "preview_urls": false,
  "assets": {
    "directory": "./apps/web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api", "/api/*"]
  },
  "triggers": { "crons": [] },
  "vars": {
    "APP_ENV": "invalid",
    "ENABLE_ADMIN_WRITE": "false",
    "ENABLE_SOURCE_PROBE": "false"
  },
  "env": {
    "local": {
      "name": "hk-school-guide-local",
      "workers_dev": false,
      "preview_urls": false,
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "hk-school-guide-local",
          "database_id": "00000000-0000-0000-0000-000000000001",
          "migrations_dir": "migrations"
        }
      ],
      "vars": {
        "APP_ENV": "local",
        "APP_TIMEZONE": "Asia/Hong_Kong",
        "STRICT_FREE_MODE": "true",
        "ALLOW_TEST_DATA": "true",
        "ENABLE_ADMIN_WRITE": "false",
        "ENABLE_SOURCE_PROBE": "false",
        "DATA_UPDATE_MODE": "manual",
        "ARCHIVE_MODE": "local"
      },
      "triggers": { "crons": [] }
    },
    "staging": {
      "name": "hk-school-guide-staging",
      "workers_dev": true,
      "preview_urls": false,
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "hk-school-guide-staging-db",
          "database_id": "REPLACE_STAGING_D1_ID",
          "migrations_dir": "migrations"
        }
      ],
      "vars": {
        "APP_ENV": "staging",
        "APP_TIMEZONE": "Asia/Hong_Kong",
        "STRICT_FREE_MODE": "true",
        "ALLOW_TEST_DATA": "true",
        "ENABLE_ADMIN_WRITE": "false",
        "ENABLE_SOURCE_PROBE": "false",
        "DATA_UPDATE_MODE": "manual",
        "ARCHIVE_MODE": "local"
      },
      "triggers": { "crons": [] }
    },
    "production": {
      "name": "hk-school-guide",
      "workers_dev": true,
      "preview_urls": false,
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "hk-school-guide-production-db",
          "database_id": "REPLACE_PRODUCTION_D1_ID",
          "migrations_dir": "migrations"
        }
      ],
      "vars": {
        "APP_ENV": "production",
        "APP_TIMEZONE": "Asia/Hong_Kong",
        "STRICT_FREE_MODE": "true",
        "ALLOW_TEST_DATA": "false",
        "ENABLE_ADMIN_WRITE": "false",
        "ENABLE_SOURCE_PROBE": "false",
        "DATA_UPDATE_MODE": "manual",
        "ARCHIVE_MODE": "local"
      },
      "triggers": { "crons": [] }
    }
  }
}
```

### 4.1 設定注意事項

`compatibility_date` 是 runtime 行為版本，不是招生年度；後续升級須測試，不能每次部署自動改成今天。若舊 Wrangler 不支援此日期，更新並重新測試依賴，而非忽略警告。

local 的全零類 UUID 只作本機 binding 識別，並非真實 Cloudflare DB。`config check --remote` 必須拒絕 `local`、未填 ID、同一 staging／production ID、錯誤 build environment，以及任何 R2／Cron 未核准啟用。

不設定 `limits.cpu_ms` 企圖提高 Free CPU；這不會變成付費方案的能力。也不打開資源自動 provision 代替明確命名與 quota 檢查。

### 4.2 API 不可被 SPA fallback 吞掉

`/api` 和 `/api/*` 先進 Worker；Worker 自己回傳 JSON 404，不能再 fallback 到首頁。其他路徑可交 Static Assets。[C09]

最小 routing 概念（需放入真正路由／安全處理，不是完整 app）：

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      // api.fetch 必須為未知 API 路徑回 JSON 404；禁止回 index.html。
      return api.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
```

不要設 `run_worker_first: true` 令所有圖片、JS、CSS 都走 Worker；這增加動態請求及 CPU，用不到的安全檢查亦不應放在所有靜態路徑。[C06]

### 4.3 靜態檔案建置契約

`build:web` 須接受 `SCHOOL_BUILD_ENV=local|staging|production`，沒設定時只預設 local。build 產生公開但不含秘密的 `build-info.json`（environment、commit、build timestamp），`config check` 必須核對環境一致。

local／staging 的 `robots.txt` 使用 Disallow，HTML／`_headers` 使用 noindex；production build 才移除全站 noindex。robots 不是權限控制。

以下檔案不可出現在 `apps/web/dist`：`.env*`、`.dev.vars*`、原始 archive、private review、D1 export、token、source code map（除非明確核准）及 server bundle。只把確實公開的內容放到 `apps/web/public`。

Static Assets 的 `_headers` 只處理靜態回應；API 的 security／cache headers 須由 Worker 自己設定，不能以為 `_headers` 自動保護所有 API。[C14]

---

## 5. 本機跑通

以下步驟只使用 local DB；不要加入 `--remote`。

```powershell
$env:SCHOOL_BUILD_ENV = 'local'
pnpm build:web
Assert-NativeSuccess 'local frontend build'

pnpm exec wrangler d1 migrations list DB --env local --local --persist-to .wrangler/state
Assert-NativeSuccess '列出本機 migrations'
pnpm exec wrangler d1 migrations apply DB --env local --local --persist-to .wrangler/state
Assert-NativeSuccess '套用本機 migrations'

pnpm school fixture seed --environment local
Assert-NativeSuccess '本機 fixture'
pnpm school config check --environment local
Assert-NativeSuccess '本機設定'
```

`fixture seed` 必須固定使用同一 `.wrangler/state`，不能寫另一個 SQLite 檔造成前端查不到資料，也不能根據沒有 environment 的預設去連遠端。

終端 A：

```powershell
pnpm dev:worker
```

終端 B：

```powershell
pnpm dev:web
```

本機 Vite 代理：

```ts
// apps/web/vite.config.ts 中的 server 設定
server: {
  port: 5173,
  strictPort: true,
  proxy: {
    '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true }
  }
}
```

本機測試：

```powershell
Invoke-RestMethod 'http://127.0.0.1:8787/api/v1/health'
curl.exe -i 'http://127.0.0.1:8787/api/not-a-real-endpoint'
pnpm school smoke --base-url 'http://127.0.0.1:8787' --environment local
Assert-NativeSuccess 'local smoke'
```

確認首頁、學校頁刷新、比較、私人清單及 calendar 空狀態。`/api/not-a-real-endpoint` 必須是 JSON 404，不是 HTML 200。

---

## 6. Cloudflare 身份與額度預檢

### 6.1 登入及指定帳戶

```powershell
pnpm exec wrangler login
Assert-NativeSuccess 'Cloudflare 登入'
pnpm exec wrangler whoami
Assert-NativeSuccess 'Cloudflare 帳戶核對'

$env:CLOUDFLARE_ACCOUNT_ID = (Read-Host '貼上已核對的目標 Cloudflare Account ID').Trim()
if ($env:CLOUDFLARE_ACCOUNT_ID -notmatch '^[0-9a-fA-F]{32}$') {
    throw 'Account ID 格式不符；不可繼續。'
}
```

登入頁、帳戶選擇、付款及雙重認證必須由帳戶擁有人完成。不要把 Global API Key 提供給 Coding Agent。CI 用最小必要範圍 token，不把 deploy token 和 app import token 混用。

### 6.2 Quota observation

在 Cloudflare Dashboard／官方 Analytics 查同帳戶 **當天 UTC 00:00 至現在** 的 D1 總讀寫，包含全部相關 DB、正在運行的其他專案及 staging。不要只查本專案一個 DB。[C04]

建立本機 `artifacts/quota-observation.json`，以下是必須填實數的結構，不可原樣當有效觀察：

```json
{
  "account_id": "REPLACE_ACCOUNT_ID",
  "utc_window_start": null,
  "observed_at": null,
  "rows_read": null,
  "rows_written": null,
  "source": "cloudflare-dashboard-or-official-analytics",
  "other_writers_status": "unknown",
  "valid": false
}
```

`null` 不能換成猜測的 0。資料觀察太舊、有其他大量寫入者、權限不足或分析延遲不明時先停止。預設觀察 TTL 15 分鐘；若匯入前已過期重新核對。

```powershell
pnpm school quota check --environment staging --observation '.\artifacts\quota-observation.json'
Assert-NativeSuccess '帳戶 quota gate'
```

基線預留 20,000 writes；一般 import 的預設上限 10,000、每個初次 canary run 上限 2,000。三學段多次 canary 的用量須合併記錄，不把每次上限當成總帳戶用量。

如果帳戶已超額：不執行 migration、不 seed、不另建 DB 繞過、不自動升級。UTC 00:00／香港 08:00 重設後重新讀取實際用量。[C04]

---

## 7. 建立 staging 資源

本章開始會建立／改動遠端資源，只在 G0／G1 通過後執行。

### 7.1 建立 D1，核對後填設定

```powershell
pnpm exec wrangler d1 list
Assert-NativeSuccess 'D1 清單'

# 清單確認不存在同名資料庫後才執行一次。
pnpm exec wrangler d1 create hk-school-guide-staging-db
Assert-NativeSuccess '建立 staging D1'
```

從成功回應取得真實 `database_id`，填入 `env.staging.d1_databases[0].database_id`。若 DB 已存在，先核對 account／name／ID／內容，不重建、不刪除、不猜 ID。

```powershell
$env:SCHOOL_BUILD_ENV = 'staging'
pnpm build:web
Assert-NativeSuccess 'staging frontend build'
pnpm school config check --environment staging --remote
Assert-NativeSuccess 'staging 設定及資源隔離'
```

### 7.2 遠端 migration

遠端 schema 變更前再次確認 quota observation 未過期。已有資料的 DB 先依第 13 章備份；空白首次 DB 記錄「新建無業務資料」。

```powershell
pnpm exec wrangler d1 migrations list DB --env staging --remote
Assert-NativeSuccess 'staging migration list'

pnpm exec wrangler d1 migrations apply DB --env staging --remote
Assert-NativeSuccess 'staging migration apply'

pnpm exec wrangler d1 execute DB --env staging --remote --command 'SELECT 1 AS ok;'
Assert-NativeSuccess 'staging D1 read check'
```

Wrangler migrations apply 只會套用未執行 migration；失敗 migration 的回滾不代表整批先前成功 migration 全部撤銷。非互動環境可能不再提示確認，所以不要把 CLI prompt 當唯一保護。[C10]

### 7.3 第一次部署：管理寫入保持關閉

```powershell
pnpm exec wrangler deploy --env staging --dry-run --outdir '.\artifacts\deploy\staging-dry-run'
Assert-NativeSuccess 'staging dry run'

pnpm exec wrangler deploy --env staging
Assert-NativeSuccess 'staging deploy'
```

**dry-run 不證明真實 DB schema、權限、來源下載或線上 CPU 已通過。** 記下成功輸出的實際 URL 及 Worker Version ID，不能從名稱猜測成功部署地址。

```powershell
$StagingUrl = (Read-Host '貼上剛才成功部署輸出的 staging HTTPS URL').Trim().TrimEnd('/')
if ($StagingUrl -notmatch '^https://') { throw 'staging 必須使用 HTTPS。' }

$Health = Invoke-RestMethod "$StagingUrl/api/v1/health"
if ($Health.data.environment -ne 'staging') { throw '連到錯誤 environment。' }

pnpm school smoke --base-url $StagingUrl --environment staging
Assert-NativeSuccess 'staging 空庫 smoke'
```

空庫 health 可以明確表示 `readiness=empty`，不能假裝已有學校資料。CLI smoke 在沒有 `--expect-published` 時接受正常 empty，但仍要求 DB query 成功和正確 schema；DB failed 不得通過。

---

## 8. 管理 token：生成、上傳及啟用

### 8.1 兩個能力分開

Importer 只能 staged import／validate；reviewer 才可 approve／publish／rollback。staging 和 production 各自獨立生成兩組 token。

**以下操作會更新已部署 Worker 的 secret，普通 `wrangler secret put` 會立即建立並部署新版本，不是純離線設定。** 必須記錄這些版本變更；不要在發布凍結期間隨便執行。[C11]

用 Node 產生 32-byte 隨機值，只放目前 PowerShell process environment，不印出到終端或寫進 repo：

```powershell
$env:SCHOOL_IMPORT_TOKEN = (node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))").Trim()
Assert-NativeSuccess '生成 import token'
$env:SCHOOL_REVIEW_TOKEN = (node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))").Trim()
Assert-NativeSuccess '生成 review token'

$ImportHash = (node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(process.env.SCHOOL_IMPORT_TOKEN).digest('hex'))").Trim()
Assert-NativeSuccess 'hash import token'
$ReviewHash = (node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(process.env.SCHOOL_REVIEW_TOKEN).digest('hex'))").Trim()
Assert-NativeSuccess 'hash review token'

$ImportHash | pnpm exec wrangler secret put IMPORT_TOKEN_SHA256 --env staging
Assert-NativeSuccess '設定 staging import hash'
$ReviewHash | pnpm exec wrangler secret put REVIEW_TOKEN_SHA256 --env staging
Assert-NativeSuccess '設定 staging review hash'

pnpm exec wrangler secret list --env staging
Assert-NativeSuccess '核對 staging secret 名稱'
```

若只做一次受控匯入，可在操作後清除本機值並輪換／移除 secrets；若要持續使用，放到營運者選定的安全密碼庫，不能把 plaintext token 寫入 `artifacts`、Markdown 或 source control。清除 process variable 不等於撤銷 server secret。

### 8.2 開啟短暫寫入窗口

只修改 `env.staging.vars.ENABLE_ADMIN_WRITE` 為字串 `"true"`，其餘維持不變。

```powershell
pnpm school config check --environment staging --remote
Assert-NativeSuccess 'staging write window 設定'
pnpm exec wrangler deploy --env staging
Assert-NativeSuccess '開啟 staging write window'
```

API 必須逐次檢查 flag 和 role token。缺少 secret 或 token 一律拒絕。公眾 URL 即使是 `workers.dev` 也不能 bypass。

完成匯入後把 flag 改回 `"false"` 再部署。這是一個明確安全窗口，不要求管理寫入永遠開著。

---

## 9. 真實資料 canary：先驗證，不直接全量灌入

### 9.1 來源只讀檢查

```powershell
pnpm school source probe --all --out '.\artifacts\source-probe.json'
Assert-NativeSuccess '官方來源 live probe'
```

某個來源 BLOCKED 時，不用其他年度或假資料補成成功。允許完成其餘來源的試驗，但報告明確列出覆蓋缺口。

### 9.2 建立三學段小樣本

CLI 必須支援 `--scope canary --limit 5`，並在 manifest 標記實際 scope；若尚未實作，先回開發，不手改全量 bundle 的 item count。

```powershell
pnpm school source build --source edb-kg-profiles --scope canary --limit 5 --out '.\artifacts\canary\kg'
Assert-NativeSuccess 'KG canary bundle'
pnpm school source build --source chsc-primary-profiles --scope canary --limit 5 --out '.\artifacts\canary\primary'
Assert-NativeSuccess '小學 canary bundle'
pnpm school source build --source chsc-secondary-profiles --scope canary --limit 5 --out '.\artifacts\canary\secondary'
Assert-NativeSuccess '中學 canary bundle'
```

每個 bundle 是一個 channel 的最多 5 筆真實資料；首次合計最多 15 筆。需要的學校基本名錄和 mapping 必須已經在本機 probe／parse 階段完成，不直接根據校名猜配。

Canary 若只有名錄資料，就先驗證名錄；招生事件沒有可核實樣本可保持空，不造日期。

### 9.3 本機人工 review

以下以小學 bundle 示範，另兩個學段按相同程序逐一進行：

```powershell
$Bundle = '.\artifacts\canary\primary'
pnpm school review prepare --bundle $Bundle
Assert-NativeSuccess '產生 review package'

# 由營運者打開 package，核對來源、年度、mapping、費用／日期等重要欄位。
# 人工確已核對後才執行；Coding Agent 不可代填已發生的人工作業。
$ReviewerId = (Read-Host '輸入實際審核操作員 ID').Trim()
if ([string]::IsNullOrWhiteSpace($ReviewerId)) { throw '審核者不能為空。' }

pnpm school review approve --bundle $Bundle --reviewer $ReviewerId
Assert-NativeSuccess '本機 review approval'
```

先完成 archive 和備份驗證；approval 要綁 manifest／內容 hash。`review approve` 是操作員確認紀錄，不是 AI 評估「看來正確」。

### 9.4 Import plan 與實際匯入

```powershell
pnpm school import plan --bundle $Bundle --environment staging --quota-observation '.\artifacts\quota-observation.json'
Assert-NativeSuccess 'canary import plan'

pnpm school import run --bundle $Bundle --base-url $StagingUrl --environment staging --quota-observation '.\artifacts\quota-observation.json' --max-writes 2000 --max-items 5
Assert-NativeSuccess 'canary staged import'
```

不要把 `--max-items 5` 用在全量 bundle 後就 publish；未完成 manifest 的所有 chunks 必須維持不能發佈。CLI 需核對 remote environment 和 import token；匯入達預算或不確定是否寫入成功時，先查 receipt，不盲目重新整批執行。

### 9.5 驗證、approve、publish

```powershell
$Manifest = Get-Content "$Bundle\manifest.json" -Raw | ConvertFrom-Json
$ReleaseId = $Manifest.release_id
if ([string]::IsNullOrWhiteSpace($ReleaseId)) { throw 'manifest 缺少真實 release ID。' }

pnpm school release validate --release-id $ReleaseId --base-url $StagingUrl --environment staging
Assert-NativeSuccess 'staged release validate'

pnpm school release approve --release-id $ReleaseId --approval-file "$Bundle\approval.json" --base-url $StagingUrl --environment staging
Assert-NativeSuccess 'server release approve'
```

CLI validate／report 必須提供該 channel 的現有 head revision。下例輸入的是剛剛讀取的真實值，不可永遠填 0：

```powershell
$ExpectedRevision = [int](Read-Host '輸入剛核對的該 channel head revision')
pnpm school release publish --release-id $ReleaseId --expected-revision $ExpectedRevision --base-url $StagingUrl --environment staging
Assert-NativeSuccess 'staging publish'

pnpm school smoke --base-url $StagingUrl --environment staging --expect-published
Assert-NativeSuccess 'staging published smoke'
```

`release publish` 亦須按該 revision 取得並提交 expected previous release ID，完整 CAS 不可只做 client-side 比較。409 時重新讀取狀態和人工核對，不能直接改 revision 再硬推。

### 9.6 Canary 完成要記錄的證據

合併三次執行的 `rows_read`、`rows_written`、索引及審計成本、CPU 觀察、raw hashes、release IDs、profile editions、item counts、被 quarantine 的紀錄，以及公眾網站實際顯示的覆蓋範圍。

本機跑得快不代表線上符合 10 ms CPU；需由 Cloudflare runtime 指標量測小批量 import 和讀取 API。目標保留明顯餘量，不能以偶爾超限仍成功作保證。未量測寫 `NOT_RUN`。[C03]

重播同一 chunk，確認業務版本和 membership 不重複；仍可能有少量狀態查詢／receipt 成本，不聲稱所有重試絕對零成本。

完成後關閉 staging 管理寫入窗口，再跑未授權測試。

---

## 10. Production 部署

**只有在收到明確 production 執行指令、且 staging 關卡通過後才執行。** 不因文件包含命令就自動操作。

### 10.1 新建 production DB

重新核對帳戶用量，確認 staging canary 已計入；不要沿用過期 observation。

```powershell
pnpm exec wrangler d1 list
Assert-NativeSuccess 'production 前 D1 清單'

# 確認不存在或未被既有專案使用後才建立一次。
pnpm exec wrangler d1 create hk-school-guide-production-db
Assert-NativeSuccess '建立 production D1'
```

把成功回應的真實 DB ID 寫入 `env.production`；檢查不等於 staging。若 database 已存在且有資料，先依備份章節處理，不清空重做。

### 10.2 建置、預檢、migration、部署

```powershell
$env:SCHOOL_BUILD_ENV = 'production'
pnpm build:web
Assert-NativeSuccess 'production frontend build'
pnpm school config check --environment production --remote
Assert-NativeSuccess 'production config gate'
pnpm school quota check --environment production --observation '.\artifacts\quota-observation.json'
Assert-NativeSuccess 'production quota gate'

pnpm exec wrangler d1 migrations list DB --env production --remote
Assert-NativeSuccess 'production migration list'
# 檢閱實際 pending migrations，完成批准與必要備份後才 apply。
pnpm exec wrangler d1 migrations apply DB --env production --remote
Assert-NativeSuccess 'production migration apply'

pnpm exec wrangler deploy --env production --dry-run --outdir '.\artifacts\deploy\production-dry-run'
Assert-NativeSuccess 'production dry run'
pnpm exec wrangler deploy --env production
Assert-NativeSuccess 'production deploy'
```

此刻仍是 `ENABLE_ADMIN_WRITE=false`，可以是沒有資料的正常站點，不代表正式資料服務已完成。

### 10.3 Production token 與資料

重做第 8 章隨機生成，命令的 `--env staging` 改為 `--env production`；**不能複用 staging token**。`secret put` 會立即影響已部署版本，記錄操作。

只在受控匯入窗口開啟 production `ENABLE_ADMIN_WRITE=true`。準備完整 scope、正確 channel 的已審核 bundle；同一窗口先 plan，確認 canary 推算成本有安全餘量，再分批匯入。

Production 的本專案 CLI 所有寫入命令都要額外帶 `--confirm-production`。例：

```powershell
$ProductionUrl = (Read-Host '貼上成功部署輸出的 production HTTPS URL').Trim().TrimEnd('/')
$ProductionBundle = (Read-Host '輸入已核實完整 scope bundle 目錄').Trim()

pnpm school import plan --bundle $ProductionBundle --environment production --quota-observation '.\artifacts\quota-observation.json'
Assert-NativeSuccess 'production import plan'

pnpm school import run --bundle $ProductionBundle --base-url $ProductionUrl --environment production --quota-observation '.\artifacts\quota-observation.json' --max-writes 10000 --max-items 200 --confirm-production
Assert-NativeSuccess 'production 分批匯入'
```

`--max-items 200` 是本次 runner 的上限，不是一次 HTTP body 大小；每個 cloud request 仍最多 10 items／32 KiB。總資料超出此次上限時保持 staged，下次在新 quota gate 後按 receipt 繼續，**未完成全部 manifest 前不可 approve／publish**。

完整 import、validate、人工 approval 後，使用同樣的 approve／CAS publish 流程，所有 production 寫入子命令附 `--confirm-production`。不得把 staging DB 整體複製成 production，避免夾帶 fixture、錯誤狀態和審核資料。

最後關閉 `ENABLE_ADMIN_WRITE` 並再次 deploy，保存 active Worker Version ID 和所有公開 release heads。

---

## 11. 上線 smoke 與驗收

建議將下列行為實作於 `pnpm school smoke` 與 `scripts/smoke.ps1`；本表為驗收契約。

| 測試 | 成功條件 |
|---|---|
| `/` | 200 HTML，正確專案，無 placeholder／demo 污染 |
| 深層學校路由刷新 | SPA 載入正常；不存在學校顯示明確 not-found |
| `/api/v1/health` | environment、schema、DB狀態正確；有無資料分開 |
| `/api/not-a-real-endpoint` | JSON 404；導覽和 fetch 均一致 |
| `/api/v1/manifest` | 公開 channel、release、資料時期、scope 可核對 |
| 三學段搜尋 | 正確 level，不把無資料當另一學段；分頁限制有效 |
| 比較 | 同學段≤4、來源／年度清楚；異學段被拒 |
| 日期 | 未核實不出「即將截止」；date-only無虛構時分 |
| 私人清單 | 操作後沒有筆記／個人狀態發送到雲端 |
| 管理 API | 關閉時拒絕；開啟時錯 token 401、錯角色403；不回成功 |
| 安全 | bundle 無 secret、API無stacktrace、無匿名任意URL代理 |
| SEO | staging noindex；production 不誤留全站 noindex |
| 配額與CPU | 已記錄實測，不只估算；小批量請求有安全餘量 |

PowerShell 手動抽查：

```powershell
$BaseUrl = $ProductionUrl
$Health = Invoke-RestMethod "$BaseUrl/api/v1/health"
if ($Health.data.environment -ne 'production') { throw '環境不符。' }

curl.exe -i "$BaseUrl/api/not-a-real-endpoint"
curl.exe -i -X POST "$BaseUrl/api/v1/admin/releases" -H 'Content-Type: application/json' --data '{}'

pnpm school smoke --base-url $BaseUrl --environment production --expect-published
Assert-NativeSuccess 'production final smoke'

pnpm exec wrangler deployments list --env production
Assert-NativeSuccess '記錄 active deployment'
```

`curl.exe` 單靠 exit code 不一定把 HTTP 4xx 當失敗；正式 smoke 必須驗證 status、content-type 和 JSON schema，不只看命令能否完成。

---

## 12. 自動更新、Cron 與營運週期

### 12.1 基線沒有背景更新

Wrangler 的三個環境 `crons=[]`，來源擷取由本機 CLI 明確執行。官方每月／每年更新頻率不代表平台已自動更新；前端顯示 `DATA_UPDATE_MODE=manual` 所代表的實際運作。

建議營運安排是按來源節奏檢查版本，在收生季優先維護已選定學校和已核實當屆事件。這是工作規劃，不是本文已建立的排程。

### 12.2 後續輕量 Cron（選配）

只有在 cloud handler、來源限制、D1預算和 CPU 都完成實測後才開啟。例如香港每日上午 09:15 等於 UTC 01:15，可在 **production** 設定：

```jsonc
"triggers": { "crons": ["15 1 * * *"] }
```

Cron 使用 UTC，修改可能需要最多約15分鐘傳播；Free Cron 的 CPU限制不會因每天只執行一次就變成15分鐘。[C03][C12]

允許的 probe 最多檢查少數已登記資源的可用性／headers，記錄一次精簡結果。不掃全港學校、不抓完整PDF、不解析大型CSV、不在 Cron 內做全量匯入或自動批准日期。

HEAD／ETag 不被來源正確支援時，probe 狀態為「無法可靠判斷內容變化」，由本機再次 fetch；不可把 header 沒變當作招生資料必然沒變。

啟用時必須同時設 `ENABLE_SOURCE_PROBE=true`，並保留 runtime kill switch。停用時先設false部署，再移除cron並部署；確認Dashboard沒有殘留觸發，不假設刪設定後瞬間全球停止。

---

## 13. 備份、發佈紀錄與回滾

### 13.1 部署證據

每次保存到 `artifacts/deploy/<run-id>/`：

```text
preflight.json       # account/env/版本/不含秘密的資源 ID
quota-before.json
migration-status.txt
build-info.json
worker-version.txt
release-heads.json
smoke.json
quota-after.json
rollback-plan.md
```

記錄執行者及 UTC 時間；給家長顯示的日期使用香港時區。不要將 token、authorization header 或完整私密 review 檔案附到公開 issue。

### 13.2 D1 export

有業務資料的 DB 在破壞性風險 migration 前備份；先檢查當日 read budget。官方支援 `d1 export`；CLI／Dashboard查詢亦計入用量，不應當作免費旁路。[C04][C10]

```powershell
New-Item -ItemType Directory -Force '.\backups' | Out-Null
$Stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$BackupFile = ".\backups\production-$Stamp.sql"

pnpm exec wrangler d1 export hk-school-guide-production-db --env production --remote --output $BackupFile
Assert-NativeSuccess 'production D1 export'

if (-not (Test-Path $BackupFile)) { throw '備份檔不存在。' }
if ((Get-Item $BackupFile).Length -eq 0) { throw '備份檔是空的。' }
Get-FileHash $BackupFile -Algorithm SHA256
```

備份檔不放靜態資產或公開 repo。除了檔案存在與 hash，須定期在隔離本機／staging 還原，驗證 schema、筆數和公開 head 一致，才叫做有還原證據。

D1 export 不包含本機 raw archive；raw bytes、source metadata、release bundles、approval及receipt也須獨立備份。Free Time Travel只有7天，不能替代年度長期保留。[C05]

### 13.3 程式回滾

先確認旧 Worker 仍兼容現在 DB schema。查詢實際已部署版本，不猜 Version ID：

```powershell
pnpm exec wrangler deployments list --env production
Assert-NativeSuccess '列出 production deployments'

$PreviousVersion = (Read-Host '輸入已驗證兼容的 Worker Version ID').Trim()
if ([string]::IsNullOrWhiteSpace($PreviousVersion)) { throw '缺少版本 ID。' }

# 此命令會立即改變線上部署，必須取得本次回滾授權。
pnpm exec wrangler rollback $PreviousVersion --env production
Assert-NativeSuccess 'Worker 程式回滾'
```

Worker rollback 不等於 D1 schema／資料、R2、資料 release 和 secrets 都回到同一歷史時點。完成後重新核對绑定、管理開關、secret可用性及 smoke。普通 secret put 本身亦可產生部署版本，選版本時要核對用途。[C11]

### 13.4 資料回滾

資料錯誤而程式正常時，開啟受控 reviewer 窗口，切回同一 channel 的先前有效 release：

```powershell
pnpm school release rollback --channel 'profiles:PRIMARY' --to-release 'REPLACE_PREVIOUS_VALID_RELEASE_ID' --expected-revision 0 --base-url $ProductionUrl --environment production --confirm-production
```

上例 `REPLACE...` 和 `0` 都必須換成實際核對的值；`config/CLI` 必須拒絕 placeholder。回滾同樣用 CAS、有 audit、不刪舊資料。重大錯誤需執行已測試的快取失效／暫停路由程序；一般回滾不能宣稱所有 edge cache 立即同步。

### 13.5 Schema／DB 災難恢復

優先 additive migration／forward fix；不得看到錯誤就DROP所有表重灌。需要Time Travel或備份還原時，先停止所有writer、記下目前狀態、確認目標時間與資料損失範圍，按當前官方恢復文件在隔離環境演練，再取得明確授權。

不要把 production SQL export直接匯入仍在服務的DB；不要以「反向migration」保證可無損回復。Quota耗盡時DB操作可能不可用，不能承諾此時仍能成功切換data head。[C04]

---

## 14. R2 選配部署

**此章不是 Free 基線必做步驟。** 只有帳戶擁有人確認R2 subscription、付款及超額風險後才執行；不能由Coding Agent自行完成checkout。[C07][C08]

### 14.1 資源與 binding

先完成Dashboard啟用，核對bucket名稱無衝突，再按需要逐個建立。[C15]

```powershell
pnpm exec wrangler r2 bucket create hk-school-guide-staging-raw
Assert-NativeSuccess 'staging R2 bucket'
# production bucket 另經 production 授權後建立：
# pnpm exec wrangler r2 bucket create hk-school-guide-production-raw
```

在已批准的named environment加入：

```jsonc
"r2_buckets": [
  {
    "binding": "RAW_ARCHIVE",
    "bucket_name": "hk-school-guide-staging-raw"
  }
]
```

production使用獨立bucket名稱。修改該環境 `ARCHIVE_MODE` 為 `r2`，重新生成Worker型別及跑測試；前端仍不能直接持有R2憑證。

Bucket保持private，不開公開 `r2.dev` 或custom domain；只存原始公開來源和處理證據，不上載兒童或家長資料。跨環境raw archive不共用寫入位置。

### 14.2 物件與配額

object key使用來源＋SHA-256，檔案沒變不重複PUT。Standard才有上述免費用量；不要啟用Infrequent Access、R2 SQL或其他額外計費功能。[C07]

使用量告警和application guard並非絕對帳戶收費硬上限。設定生命周期前，確認不會刪除仍被公開release引用的raw證據；遠端大檔上傳須獨立已量測流程，不能把32 KiB小批次管理API當任意檔案上載口。

---

## 15. 自訂網域及 CI/CD（後續）

### 15.1 自訂網域

最初使用成功部署的 `workers.dev` URL即可，不必買網域。已有網域而需要綁定時，先確認Cloudflare zone和DNS擁有權，再採Worker custom domain。下列只是替换後的格式示意：

```jsonc
"routes": [
  { "pattern": "schools.example.com", "custom_domain": true }
]
```

不得把 `example.com` 部署為真實設定。新網域驗證成功後才考慮關閉 `workers_dev`；保留preview URL關閉。所有管理授權都在Worker內實施，不可只保護其中一個hostname。[C13]

### 15.2 CI/CD 契約

第一版先由本機手動部署。後續CI應分開：

- Pull request：只跑lint／typecheck／tests／build，不帶production secrets，不連production D1。
- 手動staging：完成quota及身份檢查後才部署，migration獨立關卡。
- 手動production：需要受保護environment與人工批准，使用鎖定依賴及經核實的action版本。

不在deploy command內夾帶seed、scrape、backfill、cron啟用或auto-migration。不要使用會讓未信任PR取得secret的流程，也不要默認CI運算一定免費。

若接Cloudflare Builds或其他CI，須另核對當前build額度、觸發branch及watch paths；本手冊不會自動建立GitHub workflow或連接repo。

---

## 16. 常見故障處理

| 現象 | 先檢查 | 不應採取的做法 |
|---|---|---|
| API回index.html／200 | `/api` worker-first、API路由自己的404 | 把前端HTML當成功JSON |
| 網頁有UI但沒有學校 | DB ID、migration、公開release head、scope | 不斷重跑seed填假資料 |
| 本機有資料、雲端沒有 | 是否只寫local；remote實際環境；尚未publish | 把local模擬當remote成功 |
| `no such table` | 正確環境migration是否套用 | 重建production DB |
| D1 quota錯誤 | 同帳戶所有DB、索引、其他writer、UTC window | 換新DB、無限重試 |
| Worker CPU exceeded | chunk大小、JSON／crypto／parse成本、線上指標 | Free任意設更高cpu_ms |
| source突然空名單 | HTTP實際內容、schema、來源網頁改版 | 刪除所有既有學校 |
| 管理API401／403 | token角色、環境、hash encoding、secret版本 | 把token放URL或前端 |
| 管理API關閉 | `ENABLE_ADMIN_WRITE`是否false | 移除授權層 |
| 發佈409 | head revision改變、另一營運者已發佈 | 忽略CAS直接覆蓋 |
| Cron沒執行 | UTC、environment、flag、傳播延遲 | 大幅提高頻率 |
| R2 binding出錯 | subscription、bucket、各env明確binding | 關閉驗證或自動開付款 |
| production留noindex | build environment、_headers、robots | 直接複用staging dist |
| 回滾後資料仍錯 | 程式與data release是不同回滾、cache狀態 | 宣稱worker rollback已還原所有資料 |

---

## 17. 最終上線核對清單

- [ ] 兩份規格及實際repo命令一致，lockfile固定，測試完整通過。
- [ ] staging／production Worker、DB、token隔離；不影響既有Cloudflare專案。
- [ ] account-level讀寫用量已核對；有預留及停止規則。
- [ ] 來源LIVE_VERIFIED與欄位人工審核有區分；資料scope及年份正確。
- [ ] production沒有fixture、假日期、錯誤免費／學費數值。
- [ ] 三學段基本資料可用，尚未維護的年度事件有明確說明。
- [ ] 管理token不在前端或Git，寫入窗口結束後已關閉。
- [ ] Cron和R2基線保持關閉；選配啟用有獨立批准。
- [ ] D1備份、raw備份、release bundle、approval和receipt可核對。
- [ ] 程式和資料回滾分開演練，快取延遲及schema兼容已檢查。
- [ ] 實際部署URL、Worker Version ID、release heads及smoke evidence已保存。
- [ ] 使用者看到的是manual更新／本機收藏／非訂閱ICS的真實能力。

---

## 18. 官方參考

核對日期：2026-09-18。執行前應重查相關文件與鎖定Wrangler的 `--help`；若文件與實際CLI不一致，停止該步並更新runbook，不自行猜旗標。

- [C01：Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [C02：Wrangler configuration／environment bindings](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [C03：Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [C04：D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [C05：D1 Limits／Time Travel window](https://developers.cloudflare.com/d1/platform/limits/)
- [C06：Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [C07：R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [C08：R2 Get Started／subscription](https://developers.cloudflare.com/r2/get-started/)
- [C09：Static Assets configuration and bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [C10：D1 Wrangler commands／migrations／export](https://developers.cloudflare.com/d1/wrangler-commands/)
- [C11：Workers Wrangler commands／secrets／rollback](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [C12：Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [C13：Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [C14：Static Assets Headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [C15：R2 Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/r2/)
