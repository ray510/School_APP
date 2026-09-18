# 香港年度選校平台｜架構決策 (Phase 0)

> 文件日期：2026-09-18  
> 狀態：Phase 0 初步審視  
> 作者：Coding Agent (Claude Haiku 4.5)

---

## 1. 核心架構選擇

### 1.1 技術棧確認（來自 DEVELOPMENT.md §1.1）

| 層級 | 選擇 | 理由 | 狀態 |
|---|---|---|---|
| **前端** | Vue 3 + TypeScript + Vite | 官方標準，含類型安全 | ✓ 已決定 |
| **線上後端** | Cloudflare Worker (Hono) | 無伺服器，免費配額合適 | ✓ 已決定 |
| **資料庫** | Cloudflare D1（SQLite） | Free tier 支援，遷移友善 | ✓ 已決定 |
| **資料清理** | 本機 Node.js/TypeScript CLI | 避免 Worker CPU 超載 | ✓ 已決定 |
| **原始資料** | 本機 archive（選配 R2） | 保留完整源，可重播 | ✓ 已決定 |
| **使用者帳戶** | 無登入系統（第一版） | 降低複雜度，用 IndexedDB | ✓ 已決定 |
| **管理界面** | CLI 命令行 + 本機審核 | 避免公開登入漏洞 | ✓ 已決定 |

**架構風險評估：**
- ✓ 技術選擇明確，已鎖定版本
- ⚠️ D1 Free tier 限額需監控（每日 5M reads、100K writes）
- ⚠️ Worker CPU 10ms 限制，大檔解析需本機完成

---

### 1.2 部署環境隔離

```
環境       Worker 名稱                   D1 DB 名稱                    管理寫入
────────────────────────────────────────────────────────────────────────
local      (dev 模式)                    hk-school-guide-local         禁用
staging    hk-school-guide-staging       hk-school-guide-staging-db    可開啟（受控窗口）
production hk-school-guide               hk-school-guide-production-db 禁用（除發布窗口）
```

**決策原因：**
- 三層隔離避免測試資料洩漏到生產
- 各環境獨立 token、feature flag、DB
- 支援 staging canary 驗證成本模型

---

## 2. 資料模型決策

### 2.1 年份與學年語義

**決定：嚴格分離**
- `entry_year_start` - 入學年份（例 2027 表 2027/28 學年）
- `profile_edition` - 概覽版本標籤（例 2026/27、2027/28 per 來源）
- `source_reference_period` - 個別欄位有效期（可與 profile_edition 不同）
- 禁止從概覽年份自動推算收生年份

**風險：** 跨來源資料可能使用不同年份標籤系統，需映射層

---

### 2.2 學校身份識別

**決定：穩定 ID + 校址/班別分層**
```
school_id (穩定)
  ├─ campus_id (校址)
  │   └─ session_code (上午/下午/全日)
  └─ (來源原始 key，字串保留)
```

**理由：**
- 同名不同址、同校多址、改名遷移均需追蹤
- 跨來源 mapping 不依賴名稱相似度
- 收藏/比較單位明確

**已知衝突：**
- 幼稚園可能無校址細分，設計需向下相容
- 中學 S1 可能有多個 entry route，session_code 擴展空間保留

---

### 2.3 欄位值狀態模型

```typescript
type ValueState = 
  | 'known'              // 已取得具體值
  | 'not_provided'       // 源未提供
  | 'not_applicable'     // 不適用此校/學年
  | 'not_yet_announced'  // 官方尚未公告
  | 'not_verified'       // 取得但未人工審核
  | 'conflict'           // 多源衝突
```

**決定：UI 必須區分顯示**
- 「$0」vs「未提供」vs「不適用」不可混淆
- 每個欄位值需附帶 state + reference period + evidence IDs

**實作成本：**
- 每個 profile 欄位增加 metadata，DB 設計需微調
- API response envelope 需 `meta` 層支援 stale 標記

---

### 2.4 金額與日期規則（嚴格執行）

**金額：**
- 整數港仙或 decimal 字串，禁止浮點
- 不允許部分年度成本顯示為「完整全年」

**日期：**
- 無時分的截止日期禁止自動補「23:59」
- 當天截止提示「時間請核對官方」，非「已截止」
- `.ics` 日期-only 使用 `VALUE=DATE` 及排他尾日
- 有確切時分優先用 Asia/Hong_Kong → UTC

**衝擊：**
- 開發時需日期工具庫支援 offset-aware handling
- 測試需覆蓋跨年、月末日、夏令時邊界

---

## 3. API 設計決策

### 3.1 公開 API 路由

**決定：GET 為主，同源，小分頁**

| 路徑 | 參數 | 回應樣本 |
|---|---|---|
| `/api/v1/health` | 無 | `{data: {environment, schema_version, readiness, public_release_id}}` |
| `/api/v1/manifest` | 無 | `{data: {channels: [{head: release_id, version, updated_at, ...}]}}` |
| `/api/v1/schools` | level (必), q, district, funding, cursor, limit | `{data: [...], meta: {next_cursor, rows_read, ...}}` |
| `/api/v1/schools/:id` | 可選 release context | 包含 profile + sources + evidence |
| `/api/v1/compare` | ids (≤4), level, release context | 固定同學段 |
| `/api/v1/events` | cycle, school, date range | 僅公開核實版本 |
| `/api/v1/sources` | 無 | 公開說明，不洩露內部路徑 |

**決策理由：**
- GET only 便於 CDN 快取，避免複雜 cache key
- 必填參數限制查詢規模（level 防止跨學段混淆）
- 分頁上限 40 避免 D1 rows_read 爆炸

**未決事項：** 
- ⚠️ `/api/v1/changes` 的版本 diff 實作複雜度未評估
- ⚠️ search substring 成本（`instr(normalized_name, ?)` 無 index）

---

### 3.2 管理 API：角色與權限

**決定：兩個獨立 token，三角驗證**

```
importer token → 可 create + import + validate releases
reviewer token → 可 approve + publish + rollback
```

**驗證策略：**
1. Worker 內 hash 比對（SHA-256 fixed-time）
2. 方法白名單（POST/PUT 需明確 enable flag）
3. 無 bearer token 明文記錄、無 URL 參數傳遞

**已知限制：**
- CLI 需核對 `SCHOOL_IMPORT_TOKEN` 環境變數，不接受命令列
- 一批最多 10 items 或 32 KiB，先達者為準
- D1 單次最多 100 bound parameters，batch 不逃逸該限制

---

## 4. 資料發佈一致性決策

### 4.1 不可變版本與原子切換

**決定：Semantic hash + CAS (compare-and-swap)**

- `profile_versions` 內容一旦寫入不可改
- `release_items` 指向不可變版本
- 發佈需 `expected_previous_release_id` + `expected_revision`

**目的：**
- 避免「某次發佈無意中改了過去的資料」
- 支援可靠回滾

**成本考量：**
- 每次欄位變更產生新 version row（寫入膨脹風險）
- 需預先量測索引開銷

---

### 4.2 Channel-based 隔離發佈

**決定：按學段和事件分 channel**

```
profiles:KG
profiles:PRIMARY
profiles:SECONDARY
events:CYCLE_ID:ADMISSION_ROUTE
```

**好處：**
- 小學招生日期變更不觸發全港三學段重寫
- 名錄新 release 可引用未改欄位的舊 version

**已知困難：**
- ⚠️ UI 需正確處理不同 channel 的 release 混用
- ⚠️ 名錄+事件的聯合查詢可能需跨 channel 協調

---

## 5. 成本預算與監控

### 5.1 D1 Free 配額模型

官方限制（截至 2026-09-18）：

| 項目 | 日限額 |
|---|---|
| rows read | 5,000,000 |
| rows written | 100,000 |
| storage per DB | 500 MB |

**本專案保守設計：**
- 預設單次 import ≤10,000 writes，初次 canary ≤2,000
- 帳戶預留最少 20,000 writes（含其他專案 + staging）
- 索引、audit、migration 成本需逐次量測

**已識別風險：**
- ⚠️ `normalized_name` substring search（`instr(...)`）無 index，每次掃描可達 O(n) reads
- ⚠️ release heads 頻繁查詢，需快取策略
- ⚠️ D1 索引寫入成本（create index 計入 writes？需確認）

### 5.2 監控策略

**決定：預檢 + 觀察後驗證**

1. 匯入前：`pnpm school quota check --observation <json>`
   - 需營運者手動從 Cloudflare Dashboard 記錄當前用量
   - 無法自動取得帳戶總量（API 限制）

2. 匯入中：每個 receipt 記錄 rows_read/written

3. 超額保護：
   - 達預設上限即停止，不自動升級計劃
   - UTC 00:00 (HK 08:00) 重設前不盲目重試

---

## 6. 安全與私隱架構決策

### 6.1 SQL Injection 防護

**決定：Prepared statements 必須**
- 所有查詢使用 bind parameters
- 動態排序用白名單，禁止直接 concat

### 6.2 XSS 防護

**決定：來源內容當不可信輸入**
- 校名、官方說明不用 `v-html` 直接渲染
- 外部連結只接受核實過的 http/https
- 禁止 javascript:, data: URL

### 6.3 私人資料隔離

**決定：IndexedDB 本地只存，不上網**
- 使用者筆記禁入日誌、分析、錯誤監控
- 查詢字串無學生姓名、成績、家庭資訊
- 第一版不需兒童身份資料

**成本：**
- ⚠️ 匯出/匯入 JSON 需 validation（schema、大小、長度限制）
- ⚠️ 瀏覽器清除資料無提前警告，使用者需明示「清除可能遺失」

---

## 7. 技術棧版本鎖定

**決定：明確鎖定，不浮動**

示範（Phase 1 實作時確認實際版本）：

```json
{
  "node": "24.x",
  "pnpm": "9.x",
  "wrangler": "3.x (具體版本待定)",
  "vue": "3.4.x",
  "vite": "5.x",
  "typescript": "5.x"
}
```

**原因：**
- 部署可重現性
- Cloudflare 更新不自動升級
- 破壞性變更需測試後手動決策

**責任：**
- Phase 1 需建立 `package.json` + `pnpm-lock.yaml`
- CI 用 `--frozen-lockfile` 禁止自動升級

---

## 8. 已延期（非 MVP）的架構決策

| 功能 | 理由 | 預計 Phase |
|---|---|---|
| 家長雲端帳戶 | 認證成本高，暫用 IndexedDB | 後期 |
| 推播通知 | Cloudflare Email Routing 尚在評估 | 後期 |
| 地圖集成 | 第三方 API 成本，先暫時連結 | 後期 |
| R2 原始 archive | Free tier 無超額保護，延後啟用 | 明確批准後 |
| Cron 自動更新 | Worker CPU 10ms 不足，保持本機手動 | Phase 6 後評估 |
| SSR/SSG 完整 SEO | MVP 先 SPA + robots，量測後決策 | Phase 後期 |

---

## 9. 架構審查檢查清單

### 設計決策核查

- [x] 技術棧已明確指定
- [x] 三層環境已隔離設計
- [x] 資料年份語義已定義
- [x] API 路由已設計
- [x] 管理 API 角色已定義
- [x] 成本監控方法已說明
- [x] 安全防護措施已列舉

### 實作風險（待 Phase 1 評估）

- [ ] D1 索引建立成本量測
- [ ] substring search 性能基準
- [ ] Worker CPU 分解析成本評估
- [ ] 跨源 mapping 複雜度設計
- [ ] 版本 diff 算法複雜度
- [ ] release CAS 並發衝突測試

### 依賴決定

- [ ] `pnpm-lock.yaml` Phase 1 建立
- [ ] Wrangler types 生成規則 Phase 1 確認
- [ ] D1 migrations 架構 Phase 1 實作
- [ ] 測試框架選擇 Phase 1 決議

---

## 10. 後續決策點

| 決策 | 觸發條件 | 責任 |
|---|---|---|
| 啟用 R2 | 明確成本評估後、帳戶批准 | 營運者 |
| 啟用 Cron | CPU 成本量測 + 可靠性驗證 | Phase 後期評估 |
| 自訂網域 | staging canary 完成、生產業務啟動 | Phase 5 後 |
| CI/CD 自動化 | 部署流程穩定、人工審查減少 | Phase 6 後 |

---

**文件簽名：**  
Coding Agent (Claude Haiku 4.5)  
Co-Authored-By: Claude Haiku 4.5 &lt;noreply@anthropic.com&gt;
