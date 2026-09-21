# Worker 與 API 責任劃分計劃

狀態：milestone 1 已完成 GitHub merge、指定 school-source artifact 審核、production deploy 及 live acceptance。資料候選的人工內容覆核及真人家長 usability test 仍是獨立未完成範圍。本文固定每個 Cloudflare Worker、公開 hostname、資料儲存及部署 workflow 的責任，避免正式幼稚園資料誤接測試 D1，或由多個 Worker 爭用同一 hostname。

## 決定

新的幼稚園只讀 API 應由既有 `hk-school-guide-production` 提供，繼續使用已核對、版本化的 production assets。現階段不建立第三個公開 Worker、不為正式站新增 D1，亦不在使用者請求期間即時擷取校網。

## 現有 Worker ownership

| Worker／設定 | Host／用途 | Entry point | 儲存及 binding | API 責任 |
|---|---|---|---|---|
| `hk-school-guide-production` | `schools.finpulsx.win` 正式站 | `apps/worker/src/production.ts` | `ASSETS` → `apps/web/dist-production`；沒有 D1、R2、KV | 正式健康檢查，以及本計劃新增的幼稚園只讀 API |
| `hk-school-guide-test` | `schools-test.finpulsx.win` 測試／pilot | `apps/worker/src/index.ts` | `ASSETS` + isolated test D1 | 現有 `/api/v1/schools`、年度概覽、比較、事件、來源及 manifest API |
| `hk-school-guide-local` | 本機 workerd | `apps/worker/src/index.ts` | local assets + local D1 | migration、publication、API 及瀏覽器驗收；不代表 production |
| `hk-school-guide-staging` | `wrangler.jsonc` 的 staging 設定 | `apps/worker/src/index.ts` | staging assets + placeholder D1 | 設定模板；沒有本計劃授權的正式 hostname ownership |
| `hk-school-guide-do-not-deploy` | `wrangler.jsonc` 預設安全 guard | `apps/worker/src/index.ts` | 無可用 production binding | 不得部署 |

`wrangler.jsonc` 內名為 `hk-school-guide` 的 production environment 不是目前正式站的部署權限來源。正式站只可經 `scripts/production-deploy.mjs` 產生的 config 更新 `hk-school-guide-production`。

## 資料及請求流向

| 階段 | 負責元件 | 輸入 | 輸出 |
|---|---|---|---|
| 逐校發現及擷取 | `.github/workflows/kg-parent-school-sources.yml` | 1,025 張既有幼稚園卡、校方公開網址 | 具 hash、時間、狀態及失敗原因的 CI artifact |
| 審核及建置 | `.github/workflows/kg-parent-release.yml` | 指定的 source run artifact、既有 base artifacts | `kg-parent-manifest.json`、compact index、逐校 JSON、下載包 |
| 正式發佈 | `scripts/kg-parent-deploy.mjs` → `scripts/deploy-official-eight.mjs` → `scripts/production-deploy.mjs` | 已封存及通過 verifier 的 `dist-production` | `hk-school-guide-production` 新版本 |
| 公開讀取 | `apps/worker/src/production.ts` | 同源 GET／HEAD 請求 | 分頁摘要或單校完整資料 |
| 家長介面 | `apps/web/src/full/kg/KGParentPage.vue` | 正式幼稚園 API | 列表、比較、詳情及逐校來源狀態 |

測試 Worker 的 D1 publication streams 不會成為 production 幼稚園 API 的 fallback。正式 bundle 不存在、版本不一致或檔案無法解析時，API 必須回傳明確錯誤，不可改讀測試資料。

## API milestone 1

### `GET /api/v1/kindergartens`

用途：取代瀏覽器一次下載整個 1,025 校索引。

允許參數：

- `district`：精確地區名稱。
- `q`：校名或地址搜尋，Unicode NFKC 正規化，最多 200 字元。
- `limit`：預設 12，上限 40。
- `cursor`：綁定 `bundle_id`、搜尋條件及最後位置的不透明游標。
- `ids`：最多 50 個學校或 alias ID，供私人清單及比較頁解析；不可與 `cursor`、`district` 或 `q` 混用。

回應：

- `data`：當頁 `KGSummary[]`。
- `meta.bundle_id`：實際讀取的 immutable bundle。
- `meta.total`：本次篩選的完整結果數，不是當頁筆數。
- `meta.next_cursor`：下一頁游標或 `null`。
- `meta.districts`：本 bundle 的可用地區清單。
- `meta.parent_cards` 及 `meta.source_groups`：供前端核對 1,025 張卡及 1,759 個原有來源分組。

### `GET /api/v1/kindergartens/:id`

用途：載入單校完整 `KGSchool`。API 先以 compact index 將 canonical ID 或 alias 解析為同一張卡，再讀取該 bundle 的 `schools/<canonical-id>.json`。

限制：

- 只接受 `school_` 加 24 個十六進制字元。
- 不接受任意路徑、檔名、URL 或 bundle ID。
- 回應必須帶實際 `bundle_id`，學校 JSON 的 ID 必須與解析結果一致。
- 找不到學校回傳 404；資料版本或 asset 不可用回傳 503；其他 HTTP method 回傳 405。

共同入學事件檔及完整資料下載在 milestone 1 維持現有靜態資產路徑。它們不是目前列表超時的根因，未有需要不新增 endpoint。

## Action items

- [x] 在 `apps/worker/src/production.ts` 接入幼稚園只讀 routes；如路由邏輯令入口過長，只抽出一個 asset-backed handler，禁止建立通用 repository／service 層。
- [x] 從 `ASSETS` 先讀及驗證 `kg-parent-manifest.json`，再只讀 manifest 指向的 versioned index 或 school JSON。
- [x] 實作嚴格 query、ID、limit、cursor 及 response shape 驗證；錯誤回應保留 request ID，不回傳內部 exception 或 asset path。
- [x] 把 `KGParentPage.vue` 的列表改為 API 篩選及分頁，保留「再顯示 12 間」、總結果數、最多四校比較及 URL query 行為。
- [x] 以 `ids` mode 解析 IndexedDB 私人清單中的 school／alias IDs；私人筆記、兒童資料及進度不得放入 API、query string、log 或 analytics。
- [x] 將單校及比較頁改用 detail API；每次仍核對 canonical ID、bundle ID 及請求世代，避免舊請求覆蓋新頁面。
- [x] 保留現有靜態 JSON、ZIP、hash 及 verifier 作 source of truth、審計及 rollback；API 只是讀取投影。
- [x] 更新 production Playwright、Worker unit tests、HTTP integration tests 及部署 verifier。
- [x] 經 GitHub PR、CI、merge 後，只使用指定的成功 school-source run artifact 發佈 production；取消沒有該 artifact 的自動 release。
- [x] 部署後核對 commit、Cloudflare Worker Version ID、bundle ID、1,025 個唯一 ID、`NOT_RUN=0`、API 分頁總數、desktop/mobile journeys 及 D1 writes `0`。

## Validation matrix

| 驗收層 | 必須核對 |
|---|---|
| Unit | query 邊界、NFKC 搜尋、alias、cursor context、404／405／503、manifest mismatch |
| Build verifier | 1,025 張卡、1,759 aliases、逐校 JSON ID、compact index 少於 2 MiB、沒有在 list index 重複完整 classification |
| Local workerd | 使用 `artifacts/production/wrangler.production.json`，證明測試的是 `production.ts` 而非 D1 Worker |
| Browser | desktop/mobile 列表、地區、搜尋、分頁、詳情、比較、私人清單及 reload |
| Live HTTP | 同源 HTTPS、content type、request ID、bundle ID、總數、游標、無效輸入及未知學校 |
| Production release | exact Git SHA、Worker Version ID、source artifact run ID、archive、D1 writes `0`、rollback target |

## Risks and controls

- Route ownership：`schools.finpulsx.win` 只可由 `hk-school-guide-production` 擁有；deployment preflight 繼續拒絕 hostname takeover。
- Stale cursor：cursor 的 bundle 或 filter context 不一致時回傳 400，要求重新搜尋。
- Partial release：manifest、index、school JSON 任何一項版本不一致即 503，不混合兩個 bundle。
- Large response：固定 page limit；`ids` mode 有獨立上限；detail 每次只回傳一校。
- Evidence semantics：`CANDIDATE`、`REVIEW`、`NOT_FOUND`、`FETCH_FAILED` 保持原值；API 不把未知轉成零、全日班或未公布。
- Private data：正式 API 完全無寫入功能；IndexedDB 資料維持瀏覽器本地。

## Rollout and rollback

1. 先合併 API contract、Worker handler、前端及測試。
2. 等待 1,025 校 source run 完成並下載 artifact 作獨立審計。
3. 更新 implementation status，記錄實際 run ID、欄位狀態數及仍未找到／擷取失敗的範圍。
4. 手動執行 kindergarten production release，明確傳入成功的 source run ID。
5. 完成 local workerd、Cloudflare deployment、live API 及 desktop/mobile acceptance 才標記完成。
6. 若 API 或 UI 驗收失敗，回復上一個 `hk-school-guide-production` deployment；source artifact 及 D1 均不改寫。

## Open item

CodeGraph 尚未在目前 worktree 初始化。實作前可在獲准後執行 `codegraph init -i`，用作 route／frontend caller 影響檢查；沒有初始化亦不會改變本文的 Worker ownership 決定。
