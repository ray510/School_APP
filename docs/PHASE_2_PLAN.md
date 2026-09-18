# 香港年度選校平台 │ Phase 2 執行計畫

> 日期：2026-09-18  
> Phase：2（三學段名錄與比較）  
> 狀態：計畫中

---

## 1. Phase 2 目標

**高級目標：** 實作三學段名錄搜尋、篩選、比較功能，建立穩定 ID 系統與來源映射。

**驗收條件（DEVELOPMENT.md §12.2）：**
- [ ] null／免費／不適用欄位值分開顯示
- [ ] 搜尋量測 rows_read，記錄查詢成本
- [ ] 不混合錯誤年度資料
- [ ] 每項主要欄位可查看來源

---

## 2. Phase 2 子任務分解

### Task 2.1：實作 CSV 解析器

**目標：** 從 S01 資源正確解析所有學校基本資料

**步驟：**
1. 建立 `tools/cli/src/parsers/csv-parser.ts`
   - 處理 UTF-8 BOM
   - 處理引號內換行
   - 欄位型別推斷
   - 編碼自動偵測

2. 測試：`tests/unit/parsers/csv-parser.test.ts`
   - BOM 檔案解析
   - 引號換行處理
   - 邊界情況（空值、特殊字元）

3. 驗收：
   - [ ] S01 CSV 完整解析
   - [ ] 欄位計數正確
   - [ ] 編碼正確（字碼名字無亂碼）

**預估：2-3 小時**

---

### Task 2.2：建立穩定 ID 系統

**目標：** 設計並實現 school_id, campus_id, session_code

**步驟：**
1. 建立 `packages/contracts/src/identity.ts`
   - school_id 生成規則（UUID v5 based on source record）
   - campus_id 生成規則
   - session_code 定義（AM/PM/ALL-DAY）

2. 實現 `apps/worker/src/lib/identity.ts`
   - school_id ← hash(source_id + source_record_key)
   - 不依賴名稱相似度
   - 確保穩定性（同輸入永遠同輸出）

3. 資料庫：
   - [ ] school_identities 表已有資料
   - [ ] identity_mappings 已建立跨源映射

**預估：2-3 小時**

---

### Task 2.3：實作本機 Normalizer

**目標：** 解析 S01 CSV → D1 profiles

**步驟：**
1. 建立 `tools/cli/src/normalizers/edb-directory.ts`
   - CSV → school_identities
   - CSV → profile_versions (JSON schema)
   - 包含來源證據（snapshot ID）

2. 驗證：
   - [ ] 所有校編號轉為字串（保留前導零）
   - [ ] 地理位置數據正確
   - [ ] 校類別分類正確（官立/津貼/直資/私校）

**預估：3-4 小時**

---

### Task 2.4：本機 Fixture 建立

**目標：** 建立可重現的本機測試資料

**步驟：**
1. 建立 `tools/cli/src/commands/fixture-seed.ts` 實現
   - 從 S01 CSV 抽取前 20 筆（各學段）
   - 明確標記為 TEST DATA
   - 寫入本機 D1

2. 檔案組織：
   - `tests/fixtures/s01-sample.csv` - 20 筆樣本
   - `tests/fixtures/identity-mappings.json` - 手動審核對應

3. 驗收：
   - [ ] `pnpm school fixture seed --environment local` 執行成功
   - [ ] 本機可查詢到 20 筆測試學校

**預估：2-3 小時**

---

### Task 2.5：API 搜尋端點實現

**目標：** `GET /api/v1/schools` 功能完整

**步驟：**
1. 擴展 `apps/worker/src/api/index.ts`
   ```
   GET /api/v1/schools?level=PRIMARY&q=聯校&district=香港&limit=20&cursor=...
   ```

2. Query 驗證（Zod）：
   - [ ] level 必填
   - [ ] q 最多 200 字元
   - [ ] limit 1-40，預設 20
   - [ ] cursor 分頁

3. DB 查詢：
   - 使用 `profile_versions` + `school_identities`
   - 記錄 rows_read（重要）
   - 排序邏輯

4. 回應：
   ```json
   {
     "data": [...],
     "meta": {
       "request_id": "...",
       "next_cursor": "...",
       "rows_read": 150
     }
   }
   ```

**預估：3-4 小時**

---

### Task 2.6：學校詳情頁

**目標：** 完整展示一所學校的資訊

**步驟：**
1. Worker API：`GET /api/v1/schools/:id`
   - 返回 school + 所有 profile 版本
   - 包含來源資訊
   - 標記已驗證 vs 未驗證

2. 前端頁面：`apps/web/src/views/SchoolDetail.vue`
   - 基本資料（名稱、地址、電話）
   - 辦學團體、校類別
   - 來源與資料時期顯示
   - 尚未核實項目清楚標記

3. 路由：`/schools/:schoolId`
   - 支援瀏覽器刷新
   - 404 處理

**預估：4-5 小時**

---

### Task 2.7：比較功能

**目標：** 同學段最多四校並排比較

**步驟：**
1. Worker API：`GET /api/v1/compare?ids=id1,id2,id3&level=PRIMARY`
   - 驗證同學段
   - 最多 4 個
   - 回應欄位清單

2. 前端頁面：`apps/web/src/views/Compare.vue`
   - 表格（桌面）/ 卡片切換（手機）
   - 欄位對齊顯示
   - 版本差異標記

3. 驗收：
   - [ ] 桌面表格固定第一欄
   - [ ] 手機可橫向操作
   - [ ] null/免費/不適用分開
   - [ ] 異學段查詢返回 400 error

**預估：4-5 小時**

---

### Task 2.8：私人清單（基礎）

**目標：** IndexedDB 收藏功能

**步驟：**
1. 前端 store：`apps/web/src/stores/shortlist.ts`
   - Pinia store
   - IndexedDB 持久化
   - 匯出/匯入 JSON

2. UI 元件：
   - 「加入清單」按鈕
   - 私人筆記欄位
   - 申請進度選項

3. 重要：
   - [ ] 資料絕不上傳至 API
   - [ ] 清除瀏覽器資料提示
   - [ ] schema version 管理

**預估：3-4 小時**

---

### Task 2.9：量測與優化

**目標：** 確保在 D1 Free tier 內運行

**步驟：**
1. 記錄搜尋成本
   - 典型查詢 (q=某校名) → rows_read
   - 篩選查詢 (district=香港) → rows_read
   - 分頁查詢 → cursor 效率

2. 索引評估
   - normalized_name 查詢成本
   - level + district 複合查詢

3. 優化決策
   - 是否需要額外索引
   - 預計每日讀寫量

**預估：2-3 小時**

---

## 3. 開發順序（相依性）

```
2.1 (CSV 解析)
  ↓
2.2 (穩定 ID)
  ↓
2.3 (Normalizer)
  ↓
2.4 (Fixture)
  ↓
2.5 (搜尋 API) ← 2.6 (詳情頁) ← 2.7 (比較)
  ↓
2.8 (清單)
  ↓
2.9 (量測)
```

**建議並行：** 2.5 和 2.6 / 2.7 可同時進行（API 優先）

---

## 4. 測試策略

### 單元測試
- CSV 解析：編碼、BOM、特殊符號
- 穩定 ID：輸入一致性
- Normalizer：欄位映射

### 整合測試
- 本機 fixture seed → DB 查詢
- 搜尋 API → 正確結果 + rows_read
- 比較 API → 多校協調

### E2E 測試
- 首頁 → 搜尋 → 詳情 → 比較
- IndexedDB 操作（匯出/匯入）

---

## 5. 完成門檻檢查清單

- [ ] CSV 解析完全正確（欄位、編碼、大小）
- [ ] 穩定 ID 一致可重現
- [ ] `pnpm school fixture seed` 可執行
- [ ] 搜尋 API rows_read 有記錄
- [ ] null/免費/不適用 UI 分開
- [ ] 所有主要欄位有來源連結
- [ ] 不混年度資料
- [ ] 搜尋效能量測完成

---

## 6. 風險識別

| 風險 | 影響 | 緩解 |
|---|---|---|
| CSV 編碼問題 | 資料亂碼 | 早期測試實際檔案 |
| D1 rows_read 超額 | 開發中超限 | 預設 limit=20，量測 substring 成本 |
| ID 碰撞 | 同校重複 | 用 UUID v5 base on source key |
| 跨源資料不一致 | Mapping 複雜 | 手動審核小樣本優先 |

---

## 7. 時間預估

| 任務 | 預估 | 備註 |
|---|---|---|
| 2.1 CSV 解析 | 2-3h | 含測試 |
| 2.2 穩定 ID | 2-3h | 設計+實現 |
| 2.3 Normalizer | 3-4h | 含驗證 |
| 2.4 Fixture | 2-3h | 資料準備 |
| 2.5 搜尋 API | 3-4h | 含查詢優化 |
| 2.6 詳情頁 | 4-5h | Vue 元件 |
| 2.7 比較 | 4-5h | 桌面+行動 |
| 2.8 清單 | 3-4h | IndexedDB |
| 2.9 量測 | 2-3h | 成本分析 |
| **總計** | **26-34h** | 約 3-4 工作日 |

---

## 8. 開始條件

- [ ] Phase 1 已完成並驗收
- [ ] `pnpm install` 可執行
- [ ] 本機 D1 可用
- [ ] S01 CSV 已下載至 `tests/fixtures/s01-sample.csv`
- [ ] TypeScript 型別檢查通過

---

**下一步：** 確認開始條件後執行 Task 2.1

Co-Authored-By: Claude Haiku 4.5 &lt;noreply@anthropic.com&gt;
