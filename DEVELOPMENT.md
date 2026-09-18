# 香港年度選校資訊平台｜開發規格

> 專案代號：`hk-school-guide`  
> 文件版本：1.0｜編寫及官方文件核對日期：2026-09-18  
> 語言：繁體中文（zh-HK）｜業務時區：Asia/Hong_Kong  
> 配套文件：同一目錄的 `DEPLOY_CLOUDFLARE.md`

**本文件是待實作的開發規格，不是已完成的系統或部署報告。** 文件內的資料表、API、`pnpm school ...` 指令及驗收腳本，均須由 Coding Agent 實作及測試。已核對官方資料目錄和 Cloudflare 文件；未宣稱已下載完整學校資料、驗證所有來源欄位或完成任何雲端部署。

---

## 1. 產品目標與第一版決策

建立一個每年可以繼續更新的香港選校資訊網站，涵蓋：

- 幼稚園：首輪重點為 K1。
- 小學：首輪重點為 P1。
- 中學：首輪重點為 S1。

主要流程：**選入學學年 → 選學段 → 搜尋／篩選 → 並排比較 → 收藏 → 查看已核實招生日期 → 私人記錄申請進度。**

平台提供資料整理和條件比較，不替家長作升學決定，不提供學校優劣排行榜、錄取概率或自動報名。

### 1.1 明確採用的架構

| 項目 | 第一版決策 |
|---|---|
| 前端 | Vue 3、TypeScript、Vite、Vue Router；需要時使用 Pinia |
| 線上後端 | TypeScript Cloudflare Worker；小型路由器可用 Hono，須鎖定版本 |
| 部署 | 一個 Worker 同時提供 Static Assets 及 `/api/*`，不另設 Pages 專案 |
| 線上資料庫 | Cloudflare D1，local／staging／production 隔離 |
| 大型資料清理 | 本機 Node.js／TypeScript CLI；不在免費 Worker 解析整份年度 CSV／PDF |
| 原始資料 | 基線存於本機受管理的 archive；R2 為明確同意後才啟用的選項 |
| 使用者帳戶 | 第一版沒有家長登入系統；收藏、私人筆記及申請狀態存瀏覽器 |
| 管理方式 | 第一版以本機審核及發佈 CLI 操作；沒有公開管理登入頁 |
| 通知 | 第一版為站內事件清單及下載 `.ics`；不是主動電郵／WhatsApp 通知 |
| AI | 不作必需依賴；不可用 AI 自行決定招生日期或把未核實資料變成已核實 |
| 成本目標 | 優先維持 Workers／D1 Free 配額內；不自動啟用任何付費服務 |

本機 CLI 是開發／營運工具，不需要永久開啟伺服器。基線更新模式是**營運者執行更新、核實後發佈**，不是無人值守的全自動招生監察。當地機器關閉時不會更新；介面必須顯示最後成功資料日期。

### 1.2 不要混用兩套部署方式

本專案選擇「一般 Vite build + Wrangler」；**不加入 `@cloudflare/vite-plugin`**。前端輸出固定為 `apps/web/dist`，Worker 入口為 `apps/worker/src/index.ts`，根目錄只有一份 `wrangler.jsonc`。不要再加 Pages Functions、第二個前端網域或另一套 API 部署。

這是為了讓本機、部署目錄及 `--env staging/production` 的行為容易核對，不是聲稱另一種方式不能使用。[CF-01][CF-02]

---

## 2. 範圍與交付邊界

### 2.1 MVP 必須完成

| 編號 | 功能 | 最低要求 |
|---|---|---|
| F01 | 三學段名錄 | 可分別瀏覽 KG／PRIMARY／SECONDARY，明示資料涵蓋情況 |
| F02 | 年度選擇 | 入學學年與概覽版本分開；未知當屆資料不得以舊年份冒充 |
| F03 | 搜尋篩選 | 中英文校名、地區、辦學類別；學段特定條件按已驗證來源啟用 |
| F04 | 學校資料頁 | 基本資料、年度資料、來源、資料時期、核實狀態 |
| F05 | 並排比較 | 同一學段 2–4 個校址／班別單位；沒有資料與免費必須分清 |
| F06 | 私人選校清單 | 瀏覽器收藏、私人備註、申請狀態，可匯出／匯入 JSON |
| F07 | 招生事件 | 僅已通過審核的事件可成為「下一個重要日期」 |
| F08 | 行事曆匯出 | 選取已核實事件後下載 `.ics`；清楚說明並非訂閱及自動同步 |
| F09 | 年度變更 | 有可比版本才顯示欄位差異；不作進步／退步評分 |
| F10 | 資料營運 | 來源 registry、live probe、版本存檔、差異、審核、批量匯入、發佈、回滾 |
| F11 | 可部署與測試 | 本機端到端測試、staging 小樣本、production 明確部署關卡 |

三學段可先提供名錄及比較；年度招生營運先以小一為深入試行範圍。幼稚園／中學尚未覆蓋的事件顯示「本平台尚未核實」，不得暗示沒有招生。

### 2.2 明確排除

首版不做家長雲端帳戶、兒童名冊、成績表上載、證件儲存、代報名、付款、公開評論、學校排名、虛構 Banding、錄取率預測、通勤時間預測、地理位置追蹤或自動定位。

PN／N 班、插班、特殊學校的專門收生程序、國際課程的複雜申請流程，可保留資料分類和官方連結，但不宣稱已完整支援。電子郵件／推播、家庭同步、地圖及 R2 雲端 archive 另列後續範圍。

---

## 3. 來源清單與證據要求

### 3.1 已確認的官方目錄

以下 `source_id` 是本專案內部識別，不是政府 API 欄位名稱。

| source_id | 官方資料目錄 | 目錄更新頻率 | 用途 |
|---|---|---|---|
| `edb-school-directory` | 教育局 School Location and Information | 每月 | 基本名錄、地理位置及學校類別 [S01] |
| `edb-kg-profiles` | 幼稚園及幼稚園暨幼兒中心概覽 | 每年 | 幼稚園年度資料 [S02] |
| `chsc-primary-profiles` | Primary School Profiles | 每年 | 小學年度資料 [S03] |
| `chsc-secondary-profiles` | Secondary School Profiles | 每年 | 中學年度資料 [S04] |
| `edb-admission-notices` | 由營運者逐項登記的教育局當屆招生頁 | 按公告 | 共同程序、當屆安排 |
| `school-admission-pages` | 已確認屬該校的官方招生／開放日頁 | 按學校 | 校本招生事件及文件 |

下載 URL、resource ID、欄名、編碼和最新概覽版本，必須在 Phase 0／1 重新確認。**不要把目錄網址當 JSON API；不要假設目錄上的第一個資源就是最新版本。** 選資料須同時考慮語言、格式、所屬年度及發布機構。

資料字典可以協助理解欄位，但未經實際下載和解析測試，不可標記 `LIVE_VERIFIED`。若網站資料比可下載檔案新，分開保存兩者時期，不悄悄覆蓋。[S01–S04]

### 3.2 來源狀態

```text
DISCOVERED → CONTRACT_VERIFIED → LIVE_VERIFIED
                                  ↓
                      STALE / DEGRADED / BLOCKED
```

- `DISCOVERED`：找到目錄或候選網址。
- `CONTRACT_VERIFIED`：閱讀規格並建立映射，但不代表網路下載成功。
- `LIVE_VERIFIED`：記錄下載時間、HTTP 狀態、content-type、hash、實際欄位、筆數及解析測試結果。
- `STALE`：資料時期或成功檢查時間超出來源專屬門檻。
- `BLOCKED`：授權、網路、schema 變動或缺少資源阻擋；保持 last-good，不補造新資料。

`last_checked_at`、`last_successful_fetch_at`、`source_reference_period`、`last_human_reviewed_at` 必須分開。今天下載到舊概覽，不代表內容是今天的資料。

### 3.3 Source registry 契約

`config/sources.yaml` 每項至少包含：

```yaml
source_id: edb-school-directory
catalog_url: https://data.gov.hk/en-data/dataset/hk-edb-schinfo-school-location-and-information
publisher: Education Bureau
preferred_language: zh-HK
resource_selection: explicit-reviewed-resource
resolved_resource_url: null
expected_update: monthly
parser_id: edb-directory-v1
contract_status: DISCOVERED
enabled: false
allowlisted_hosts: []
max_response_bytes: 20971520
connect_timeout_ms: 10000
request_timeout_ms: 30000
max_attempts: 2
```

`resolved_resource_url` 和 `allowlisted_hosts` 須由 probe 真實結果補上；未知不是放行。上例 `20 MiB` 是本機單檔安全上限的設計值，不是官方檔案大小；若實際檔案更大，經記錄後調整，不可靜默截斷。

### 3.4 來源、引用與授權

每個公開重要欄位必須可追溯至來源 URL、原文／欄位定位、版本、取得日期及內容 hash。學校自述保留「學校於概覽表示」等來源屬性，不轉換成獨立認證。

DATA.GOV.HK 使用條款要求遵守相關條件及來源／知識產權署名；另接學校網站時須另核對使用條款。不要假設校徽、照片和第三方文章都可隨資料一併重用。[S05]

---

## 4. 年份、學校識別與資料語義

### 4.1 入學年份不是資料年份

```ts
type SchoolLevel = 'KG' | 'PRIMARY' | 'SECONDARY';
type EntryGrade = 'K1' | 'P1' | 'S1';

type AcademicYear = {
  startYear: number;
  endYear: number; // 必須等於 startYear + 1
  label: string;   // 程式生成，例如 2027/28；不是已核實招生日期
};
```

必須分開：

| 欄位 | 意義 |
|---|---|
| `entry_year_start` | 家長希望入學的學年開始年份 |
| `profile_edition` | 來源概覽的原始版本標籤 |
| `source_reference_period` | 個別欄位實際描述的時期；不同欄位可不同 |
| `official_cycle_label` | 保留官方收生程序原始名稱，不靠 regex 猜入學年 |
| `source_published_at` | 來源公布時間；不知道則 null |
| `fetched_at` | 平台取得資料的 UTC 時間 |
| `reviewed_at` | 人工核實時間 |
| `starts_on / ends_on` | 只提供日期的事件 |
| `starts_at / ends_at` | 來源確有時分時才提供的事件時間 |

入學年份下拉選單可以包含未來學年，但必須分開「可以選擇」與「已有資料」。未來學年沒有公告時，顯示「當屆尚未核實」，可另展示標明版本的最近概覽作背景。

禁止將上一年的截止日期加一年；禁止把概覽出版年份直接當成收生年份。

### 4.2 學校與校址不可只靠名稱去重

內部使用穩定的 `school_id`；另設 `campus_id` 及 `session_code`。原始來源的 record ID 全部以字串保存，保留前導零。

校名相似、地址相同、辦學團體相同，均不足以自動合併。不同學段、校址、上午／下午／全日班可能需要不同比較單位。搬遷和改名保留歷史，不換掉既有收藏識別。

跨來源 mapping 須保存依據、mapping 版本、人工核實狀態。模糊匹配只建立候選；未核實衝突進 quarantine，不自動選一個答案。

### 4.3 欄位值狀態

```ts
type ValueState =
  | 'known'
  | 'not_provided'
  | 'not_applicable'
  | 'not_yet_announced'
  | 'not_verified'
  | 'conflict';

type FieldValue<T> = {
  value: T | null;
  state: ValueState;
  referencePeriod: string | null;
  evidenceIds: string[];
};
```

`known` 不等於「官方保證永遠正確」。`stale` 是另一個新鮮度標記，不能掩蓋原值狀態。零元費用、沒有提供費用及不適用必須顯示不同文字。

### 4.4 金額與日期規則

費用用整數港仙或精確 decimal 字串，不能用浮點數做總和。學費保留年度、班別、付款期數、包含項目及來源；項目未齊不能顯示為完整全年成本。

只提供日期而沒有時分的截止日，不得自動補「23:59」。當天提示「今日截止，時間請核對官方安排」，其後可顯示「所列日期已過」，不等同宣告學校不再接受任何申請。

全天 `.ics` 使用 `VALUE=DATE`，`DTEND` 採不包含的翌日；有確切時分的事件先按 Asia/Hong_Kong 轉換成 UTC，輸出帶 `Z` 的 DTSTART／DTEND。未知、衝突或未審核日期不提供正式行事曆匯出。

---

## 5. 介面與使用流程

### 5.1 路由

| 路由 | 內容 |
|---|---|
| `/` | 入學學年與學段入口，資料更新及覆蓋提示 |
| `/schools` | 可分享的篩選 URL；列表模式優先 |
| `/schools/:schoolId` | 學校、校址、班別選擇；來源及年度資料 |
| `/compare` | 同學段最多四個比較單位 |
| `/shortlist` | 只在本機保存的私人選校清單 |
| `/calendar` | 公開核實事件＋使用者本機私人事件，視覺上清楚分開 |
| `/sources` | 來源、版本、最後成功處理時間、覆蓋及限制 |
| `/about` | 非官方平台聲明、資料更正聯絡方式、隱私說明 |
| `/404` | 前端找不到頁面狀態 |

第一版沒有 `/admin` 管理 UI。管理 API 的權限不可依賴「網址沒有人知道」。

### 5.2 視覺與互動

繁體中文、手機優先、清晰表格與卡片。桌面比較表固定第一欄；手機採學校切換或橫向可操作比較，不將四欄縮成難讀小字。

所有重要狀態須同時有文字，不單靠顏色。完整支援鍵盤操作、focus、表單 label、錯誤提示和足夠對比。採本地／系統字體，不依賴外部字體服務。

不得將測試學校混入 production。Demo 資料限 local／staging，所有 demo 頁清楚標記「測試資料」，且不得使用真實學校名字搭配虛構費用或截止日期。

### 5.3 收藏及私人資料

IndexedDB 為主要儲存；小型偏好可用 localStorage。儲存 key 包含 schema version。

```ts
type ShortlistEntry = {
  schoolId: string;
  campusId: string | null;
  sessionCode: string | null;
  level: SchoolLevel;
  entryYearStart: number;
  status: 'considering' | 'preparing' | 'applied' | 'waiting' | 'result_received';
  privateNote: string;
  updatedAt: string;
};
```

介面明示：「資料只存在此瀏覽器，清除網站資料或更換裝置可能遺失。」提供匯出、匯入、刪除全部；匯入需 schema、大小、字串長度驗證，預覽合併衝突，不靜默覆蓋。

不得上傳私人筆記至 API、日誌、分析工具或錯誤監控。不得在查詢字串放學生姓名、成績或家庭資料。第一版不需要兒童姓名、生日、身份證明或地址。

### 5.4 搜尋與比較規則

先按 level 和公開 release 範圍取資料，再按 district／funding 等已驗證條件查詢。名稱搜尋保留中英文別名及 Unicode 正規化，但顯示名稱保留原文。

第一版可用參數化 SQL 的 `instr(normalized_name, ?)` 處理 substring；必須承認 substring 不會自然使用普通 B-tree 名稱索引，量測 `rows_read`。不可宣稱加一個 index 就解決所有模糊搜尋成本。

每頁預設 20、最多 40；搜尋字串長度及 UTF-8 位元組數設上限；不提供任意欄位排序。不逐請求全表 `COUNT(*)`，統計優先由 release 預先產生。

比較頁每次請求最多 4 個 item，固定同一 level、同一 release context；跨學段比較回傳明確錯誤。舊概覽作背景時，醒目顯示版本不同，不建立虛假「當屆相同口徑」。

### 5.5 SEO 與分享邊界

MVP 是 SPA，應有基本 title、description、canonical、robots 和 sitemap。**不宣稱已做到逐校完整 SSR／SEO。** 大規模搜尋曝光前另做 SSG 評估，使用相同已發佈資料快照生成公開學校頁，避免 runtime SSR 增加免費 Worker CPU。

Staging 設 `noindex`，不公開提交 sitemap。網址的 school ID 可公開，私人選校筆記不進 sitemap、網址或分享預覽。

---

## 6. 資料模型與發佈一致性

### 6.1 表格契約

實作 SQL migration 時須逐項落實以下契約；這是 schema 設計，不是可以直接套用的 SQL 檔案。

| 表 | 主鍵／唯一性 | 用途 |
|---|---|---|
| `sources` | `source_id` | 來源設定與目前健康摘要 |
| `source_snapshots` | `snapshot_id`；來源＋raw hash＋parser version 唯一 | 原始版本及解析依據 |
| `school_identities` | `school_id` | 穩定學校識別；不直接存會隨 release 改變的公開介紹 |
| `identity_mappings` | 來源＋原始 record key＋mapping version | 跨來源／校址／班別對照 |
| `profile_versions` | `profile_version_id`；item key＋semantic hash 唯一 | 不可變的校址／班別概覽內容 |
| `admission_cycles` | `cycle_id` | entry year、level、grade、官方標籤和途徑 |
| `event_versions` | `event_version_id`；event ID＋semantic hash 唯一 | 不可變招生事件版本 |
| `release_manifests` | `release_id` | 所屬 channel、狀態、hash、筆數、scope、驗證摘要 |
| `release_items` | release ID＋item key | 將該 release 的公開項目指向不可變版本 |
| `release_heads` | `channel` | 目前公開 release ID、CAS revision |
| `import_chunks` | release ID＋chunk sequence | chunk hash、重試冪等和執行統計 |
| `review_decisions` | `decision_id` | 人工審核者、對象 hash、決定、時間、證據 |
| `audit_events` | `audit_id` | 匯入／審核／發佈／回滾紀錄；不記一般瀏覽 |

`profile_versions` 的可索引欄位：level、school_id、campus_id、session_code、district_code、funding_type、normalized_name；較少查詢的欄位放有 schema 的 JSON。證據可存去重 references 和 bounded JSON，不必為每個欄位都建立一行造成寫入膨脹。

`item_key` 明確由校址、學段、班別的穩定識別組成，不是每年重新生成的顯示名稱。

### 6.2 分 channel 發佈，避免一次事件更新重寫所有學校

建議 channel：

```text
profiles:KG
profiles:PRIMARY
profiles:SECONDARY
events:<cycle_id>:<admission_route>
```

某個小學招生事件變更，只更新其事件 channel，不重新寫入全港三學段名錄。名錄新 release 可引用沒改變的 `profile_versions`，不複製整段文字。

每個 release 宣告 scope：全量、指定地區或 canary，以及覆蓋筆數。**15 筆 canary 不可發佈到原本全量 channel 而把其餘學校隱藏。** Canary 使用獨立測試 channel 或 staging；production 必須驗證預期完整 scope。

### 6.3 狀態機

```text
DRAFT → VALIDATING → READY_FOR_REVIEW → APPROVED → PUBLISHED
             ↓              ↓             ↓
          REJECTED        REJECTED        REVOKED
```

資料匯入和「可以公開」是兩件事。公開 API 只能從 `release_heads` 指向的已發佈 release 讀取，不准 query「最新插入的資料」直接顯示。

首版的基本名錄可由營運者在 source-level 審核後批准整批；**日期、收費、資格及錄取準則的變動需要逐項證據核實**。審核結果綁定內容 hash；資料改動後舊批准不能沿用。

### 6.4 原子切換及回滾

發佈要求 `expected_previous_release_id` 和 `expected_revision`，使用 compare-and-swap。並行發佈或過期 client 得 `409 RELEASE_CONFLICT`，不得蓋過較新 release。

D1 `batch()` 提供交易式批次執行；仍須自行設計條件 SQL，處理 conditional UPDATE 影響 0 行的情況，不能把「SQL 沒有 exception」當成成功發布。[CF-08]

切換 head、寫發佈審計及必要狀態變更必須一致；不可在可失敗的後續請求才補審計。先在本機測試並行、重試、失敗中斷和零行更新。

回滾只切回同 channel 的先前有效 release；不刪除新版本、不還原原始 archive、不改官方來源。程式回滾與資料回滾獨立，詳見部署文件。

### 6.5 保留策略

保留目前及上一個可用 release、各學年需要的公開年鑑版本，以及必要審核／原始證據。舊 staging／失敗 chunk 依明確策略清理，不每日自動刪寫。

未被任何 release 引用的中間資料才可列入垃圾收集候選；清理先產生 dry-run 報告並計入 D1 writes。不得刪除 last-good 或現時用於公開事件的證據。

---

## 7. API 契約

### 7.1 公開 API

全部同源，GET 為主，不接受任意來源 URL 作代理。

| Method | 路徑 | 要求 |
|---|---|---|
| GET | `/api/v1/health` | Worker／DB readiness、environment、schema version、是否有公開 release；不洩露帳戶 ID／秘密 |
| GET | `/api/v1/manifest` | 各 channel head、版本、覆蓋及資料狀態 |
| GET | `/api/v1/schools` | level 必填；district、funding、q、cursor、limit 可選 |
| GET | `/api/v1/schools/:id` | 校址／班別及有來源的內容，可指定 release context |
| GET | `/api/v1/compare` | IDs 與 units 上限 4，level、entry year、release context |
| GET | `/api/v1/cycles` | 已建立的入學程序，不把 UI 未來年份當成已知程序 |
| GET | `/api/v1/events` | cycle、school、日期區間；只回傳可公開核實版本 |
| GET | `/api/v1/changes` | 同校可比欄位版本差異，限制範圍及筆數 |
| GET | `/api/v1/sources` | 公開來源說明，不暴露本機 archive 路徑、內部審核員資料 |

日期與 release 的 query 參數用 runtime schema 驗證，不只 TypeScript 型別。

回應 envelope：

```json
{
  "data": [],
  "meta": {
    "request_id": "generated-at-runtime",
    "environment": "staging",
    "channel": "profiles:PRIMARY",
    "release_id": null,
    "data_status": "not_published",
    "next_cursor": null
  }
}
```

錯誤採 `{ "error": { "code", "message" }, "meta": { "request_id" } }`。禁止向公眾輸出 SQL、stack trace、token、完整原始文件或個人審核身份。

重要狀態：`400 VALIDATION_ERROR`、`401 UNAUTHORIZED`、`403 FORBIDDEN`、`404 NOT_FOUND`、`409 RELEASE_CONFLICT`、`413 PAYLOAD_TOO_LARGE`、`503 DATA_UNAVAILABLE`。資料庫不可用時不回假空名單或假 `200 healthy`。

### 7.2 管理 API：只供 CLI，不供前端持有 token

| Method | 路徑 | 角色 |
|---|---|---|
| POST | `/api/v1/admin/releases` | importer 建立 staged manifest |
| PUT | `/api/v1/admin/releases/:id/chunks/:sequence` | importer 匯入一批 |
| POST | `/api/v1/admin/releases/:id/validate` | importer 取得完整性結果 |
| GET | `/api/v1/admin/releases/:id/report` | importer 或 reviewer |
| POST | `/api/v1/admin/releases/:id/approve` | reviewer，綁定審核內容 hash |
| POST | `/api/v1/admin/releases/:id/publish` | reviewer，附 CAS 版本 |
| POST | `/api/v1/admin/channels/rollback` | reviewer，指定 channel 和先前 release |

所有管理寫入都要求 `ENABLE_ADMIN_WRITE === 'true'`，並驗證對應角色的 bearer token。缺少 secret 時 fail closed。Import token 不可 approve／publish／rollback。

Worker 只保存 `IMPORT_TOKEN_SHA256`、`REVIEW_TOKEN_SHA256`，運行時 hash 輸入 bearer token，採經測試的固定時間比較方法。Token 至少 32 隨機 bytes；production／staging 分開；不寫在 URL、前端、Git 或 log。

每批至多 **10 items 且 body ≤32 KiB，先觸及者為準**；body 須串流有上限讀取，不能只相信 Content-Length。較大合法 item 應重新設計分段／精簡證據，不能偷偷提高 Worker CPU 限額。

單一 D1 SQL 查詢最多 100 個 bound parameters，Free 每次 Worker invocation 的 D1 query 上限為 50；不要把 10 個多欄位 items 直接拼成超額 multi-row INSERT。採有上限的 prepared statement batches，每次預算建議不超過 30 statements，並把 identity、membership、receipt 和 audit 計入。單一 batch 仍受各 statement 的限制，不能靠 batch 逃過限制。[CF-07]

CLI 傳送 bearer token 前必須核對 base URL 與營運者登記的 environment／hostname allowlist一致；不得跟隨跨 host redirect 攜帶 token，也不能只因匿名 health 自稱 production 就信任未知主機。

### 7.3 快取

靜態 assets 由 Cloudflare 服務。公共 API 只快取通過驗證的成功 GET；admin、health、錯誤及任何授權請求皆 `no-store`。

Cache key 包含 canonical query、locale、channel、release ID；名單和比較使用一致 release context。head／manifest 允許最多 60 秒明示過渡；舊頁仍引用完整舊 release，不能混用新舊欄位。客戶端見 head 改變提示重新載入。

Cloudflare Cache API 是資料中心本地快取，不是全球一致資料庫，不能靠 `cache.delete()` 宣稱即時全球清除。[CF-09] 發佈後以 release-key 隔離、短 manifest TTL 和明確 stale 顯示控制一致性；撤回重大錯誤須另有已測試的緊急失效／路由暫停程序。

---

## 8. 本機資料管線

### 8.1 處理流程

```text
受允許官方來源
  → fetch／保存 raw bytes + headers + SHA-256
  → parser + encoding/schema 檢查
  → identity mapping
  → canonical normalize
  → semantic diff
  → quarantine / review package
  → 人工審核（日期、費用、資格）
  → immutable release bundle
  → 小批次 authenticated import
  → validate
  → approve
  → CAS publish
```

來源 HTTP 200 但內容是錯誤 HTML，不算成功。CSV 支援 BOM、引號內換行、原始空值；編碼、日期及特殊符號以真實 fixture 驗證。PDF 處理先讀文字層，必要時人手核實；OCR 不是默認依賴。

原始 bytes 不因資料清理而修改。raw hash 與 semantic hash 分開；取得時間和重排欄位不應令相同業務內容全部變更。計算 semantic hash 排除 fetched_at、request ID 等運行時欄位。

### 8.2 檔案與 bundle

```text
archive/<source_id>/<sha256>/raw.bin
archive/<source_id>/<sha256>/metadata.json
artifacts/probes/<run_id>.json
artifacts/reviews/<review_id>/diff.json
artifacts/reviews/<review_id>/review.html
artifacts/releases/<release_id>/manifest.json
artifacts/releases/<release_id>/chunks/000001.json
artifacts/releases/<release_id>/approval.json
artifacts/imports/<run_id>/receipts.jsonl
```

上述檔案不在 `apps/web/public`，不隨靜態站點上傳，通常加入 `.gitignore`。保留小型已核准測試 fixture 於 `tests/fixtures`，不得含私人資料。

manifest 包含 schema version、channel、scope、entry year（適用時）、profile editions、item count、chunk count、每 chunk hash、來源 snapshots、normalizer version、review requirements、created_at。

### 8.3 冪等與缺失保護

相同 release＋sequence＋hash 重試，回傳既有 receipt，不重寫 profile。相同 key 不同 hash 回 `409`，不覆蓋。網路 timeout 後先查 status／receipt 再決定重送。

未變 raw 仍可記一次低成本成功檢查摘要，但不可重新生成全部 profile rows。空檔、筆數突降或欄位消失進 quarantine，不解釋為全港學校停辦；來源停辦狀態必須有直接依據。

預設兩次總嘗試、有限退避、每 host concurrency 1；尊重 robots、網站條款及 Retry-After。不繞過 CAPTCHA、登入、封鎖或存取限制。

### 8.4 原始資料保存的基線限制

`ARCHIVE_MODE=local` 時，雲端只持有公開 normalized data、bounded evidence、hash 及來源連結；**不是完整雲端 raw archive**。發佈之前必須在另一個由營運者控制的位置完成本機 archive 備份，記錄備份驗證及 hash。

沒有 archive 備份就不得將資料標記為可重播。若本機 raw 及備份遺失，系統仍可能顯示公開資料，但不能聲稱可重現原始解析。

R2 啟用另需成本和 binding 關卡；免費額度不等於無超額收費風險。[CF-05][CF-06]

---

## 9. Cloudflare 資源預算

官方限制核對日為 2026-09-18，部署前須再次核對：

| 項目 | 官方 Free 基線 | 本專案保護設計 |
|---|---|---|
| Worker 動態請求 | 100,000／日 | 靜態優先；不每次載入寫入 DB |
| Worker HTTP／Cron CPU | 每次 10 ms | 重型 parse/hash/diff 放本機，小批量 cloud import |
| D1 rows read | 5,000,000／日 | 索引、快取、分頁、避免反覆全表掃描 |
| D1 rows written | 100,000／日 | 帳戶總量預檢、canary、測量索引及審計成本 |
| D1 儲存 | 單 DB 500 MB、帳戶總計 5 GB | 分清單庫與總額；保留策略須量測 |

上述來自 Cloudflare 官方文件，不是專案保證吞吐量。[CF-03][CF-04][CF-07]

### 9.1 預算閘門

- 預設每次一般遠端 import 最多 10,000 measured writes；每個初次 canary run 最多 2,000；多次執行仍須合併計入帳戶用量。這是專案保守值。
- 帳戶至少預留 20,000 writes；必須包括其他專案、staging、migration、index、審核及清理成本。
- account total 不可取得時，不填 0；remote 寫入阻擋，使用營運者從官方 Dashboard 輸入的近期觀察值補足。
- 觀察檔記 account ID、UTC window、observed_at、rows read/written、來源。TTL 預設 15 分鐘，並考慮分析延遲和正在運行的其他寫入者。
- 同一批次由單一營運 runner 執行；匯入期間不併行進行 migration／其他本專案寫入。跨專案併行無法完全控制時增加預留或停止。
- D1 每次結果的 `meta.rows_read / rows_written` 累計至 receipt；索引、audit 和失敗重試成本不能忽略。[CF-03]
- application budget 只是防呆，不能硬性鎖住整個 Cloudflare 帳戶；不可宣稱絕對防止超額。
- 超額即停止；不要建立新 DB「繞過」帳戶日限額，不無限重試，不自動升級計劃。

D1 免費日額在 UTC 00:00 重設，即香港 08:00。[CF-03] 重設後先讀帳戶新用量再恢復，不盲目把昨天 job 自動跑完。

---

## 10. 安全、私隱與操作防呆

公開面只提供已發佈資料；沒有匿名寫入 endpoint。所有 SQL 使用 prepared statements，動態排序白名單。校名、官方說明及備註一律當不可信輸入，不用 `v-html` 直接渲染來源內容。

外部連結只接受核實過的 `http/https`，拒絕 javascript/data URL。新增 school host 需人工核對；本機抓取需限制 redirect 次數及重新驗證每一跳主機／私有 IP，防止 SSRF。Worker 不提供任意 URL fetch API。

管理 API 使用 role token、method、body/schema、idempotency、feature flag 多重限制；所有變更皆 audit。HTTP CORS、robots、隱藏網址或瀏覽器登入頁不是授權控制。

日志預設記 request ID、route template、status、duration、D1 aggregate metrics、release ID，不記 bearer token、request body、家長筆記或完整 query。失敗驗證不要每次寫 D1，防止濫用寫爆配額。

公眾來源更正先以聯絡方式處理；若日後建立表單，另設 spam／權限／資料保留設計，不在本版偷偷加匿名 DB 寫入。

---

## 11. Repository 與指令契約

```text
hk-school-guide/
├─ DEVELOPMENT.md
├─ DEPLOY_CLOUDFLARE.md
├─ AGENTS.md
├─ package.json
├─ pnpm-workspace.yaml
├─ pnpm-lock.yaml
├─ wrangler.jsonc
├─ apps/
│  ├─ web/                  # Vue + Vite；輸出 dist/
│  └─ worker/src/           # fetch、API、auth、repository、scheduled（預設禁用）
├─ packages/
│  └─ contracts/src/        # Zod schemas、API types、year/date/value state
├─ tools/
│  └─ cli/src/              # probe、parse、diff、review、import、publish、rollback
├─ config/
│  ├─ sources.yaml
│  ├─ mappings/
│  └─ cycles/               # 已核實當屆設定；不是推算生成
├─ migrations/             # 唯一 migration 目錄
├─ tests/
│  ├─ fixtures/
│  ├─ unit/
│  ├─ worker/
│  └─ e2e/
├─ scripts/
│  ├─ smoke.ps1
│  └─ verify-doc-commands.mjs
├─ docs/
│  ├─ STATUS.md
│  ├─ SOURCE_CONTRACTS.md
│  ├─ SOURCE_COVERAGE.md
│  ├─ ARCHITECTURE_DECISIONS.md
│  └─ RUNBOOK.md
└─ artifacts/               # ignore，部署與處理證據
```

### 11.1 Root scripts（實作後才可執行）

| Script | 必須做的事 |
|---|---|
| `pnpm dev:web` | Vite 5173，`/api` proxy 到本機 8787 |
| `pnpm dev:worker` | `wrangler dev --env local --port 8787 --persist-to .wrangler/state` |
| `pnpm build:web` | 依 `SCHOOL_BUILD_ENV` 建置 `apps/web/dist` 及 build-info／robots／headers；不連遠端、不改 DB |
| `pnpm typecheck` | 前後端及 CLI 型別檢查 |
| `pnpm lint` | 所有 TypeScript／Vue 檢查 |
| `pnpm test` | 非互動 unit + 本機 Worker/D1 integration tests |
| `pnpm test:e2e` | Playwright；使用隔離本機測試 DB |
| `pnpm school --help` | 本專案 CLI 命令列表，底層 `tsx tools/cli/src/index.ts` |

`SCHOOL_BUILD_ENV` 只接受 `local / staging / production`，未設定時預設 local；production 部署必須確認 dist 的 build-info 與目標環境一致。生成 Worker 型別應使用鎖定 Wrangler 的 `wrangler types`，不要手寫與 binding 不符的 Env。

**不要建立名為 `deploy`、實際會順便 seed／backfill／migration 的黑盒指令。** 部署步驟依配套文件明確分開。

### 11.2 CLI 子命令（本專案需實作，非 Wrangler 內建）

```text
pnpm school source probe --all --out <report.json>
pnpm school source build --source <source_id> --scope <full|canary> [--limit <n>] --out <bundle-dir>
pnpm school review prepare --bundle <bundle-dir>
pnpm school review approve --bundle <bundle-dir> --reviewer <operator-id>
pnpm school quota check --environment <staging|production> --observation <json>
pnpm school import plan --bundle <dir> --environment <env> --quota-observation <json>
pnpm school import run --bundle <dir> --base-url <url> --environment <env>
  --quota-observation <json> --max-writes <n> --max-items <n>
pnpm school release validate --release-id <id> --base-url <url> --environment <env>
pnpm school release approve --release-id <id> --approval-file <json>
  --base-url <url> --environment <env>
pnpm school release publish --release-id <id> --expected-revision <n>
  --base-url <url> --environment <env>
pnpm school release rollback --channel <channel> --to-release <id>
  --expected-revision <n> --base-url <url> --environment <env>
pnpm school fixture seed --environment local
pnpm school config check --environment <env> [--remote]
pnpm school smoke --base-url <url> --environment <env> [--expect-published]
```

`source build` 輸出 one-source／one-channel bundle；`--scope canary --limit 5` 建立清楚標記的小樣本，`--scope full` 不允許用 limit 靜默截斷。`--max-items` 只限制 runner 嘗試數，不會自動把全量 manifest 改成可發佈小樣本。Canary 必須有獨立 manifest 和 scope。

需要 token 的 CLI 從當前 process 的 `SCHOOL_IMPORT_TOKEN`／`SCHOOL_REVIEW_TOKEN` 讀取，不接受命令列明文 `--token`。任何 production 寫入另要求 `--confirm-production`，缺少即失敗；本機 fixture 永不支援此參數。

`config check` 需檢查 DB ID、environment、feature flags、資源隔離、未替換 placeholder、secret 不在前端、archive 設定、build 目錄。它不可以自行建立雲端資源。

---

## 12. 分階段實作計劃與驗收

### Phase 0｜現況及來源核實

先讀現有 repo、AGENTS、兩份文件，檢查 git status，保留使用者未提交修改。沒有 repo 則建立最小骨架，但不雲端部署。

產出架構決策、依賴版本、四個主要來源的真實 probe、未知欄位及 identity mapping 風險、成本預估方法。probe 只讀外部來源，不寫 production。

**完成門檻：** 每個來源有獨立狀態；未知如實 BLOCKED；不得靠虛構 CSV header 進入 LIVE_VERIFIED。第一輪 Coding Agent 到此停止，提交結果供核對。

### Phase 1｜骨架與本機資料底層

建立 pnpm workspace、Vue、Worker、contracts、本機 D1 migrations、health、API JSON 404、local fixture、測試。先建 profile/source/release 基礎表；之後 migration 增加 event/review，不修改已套用 migration。

**完成門檻：** 全新 clone 按文件可啟動；深層路由刷新正常；`/api/不存在` 回 JSON 404；fixture 清楚標為測試。

### Phase 2｜三學段名錄與比較

實作來源 normalizer、穩定 ID、來源證據、瀏覽、篩選、學校頁、最多四校比較。先本機匯入小樣本，再量測全量。

**完成門檻：** null／免費／不適用分開；搜尋量測 rows_read；不混合錯誤年度；每項主要欄位可查看來源。

### Phase 3｜私人清單與招生流程

實作 IndexedDB、匯出匯入、calendar、ICS、人工 review package、日期狀態及不同入學 route。沒有核實事件時必須展示正確空狀態，不能生成示範截止日期填充正式頁。

**完成門檻：** 私人資料不上網；ICS 日期邊界正確；未審核事件不出現在重要日期；當屆未公布不混用去年。

### Phase 4｜資料營運、成本與安全

實作小批量 import、idempotency、release CAS、審核權限、last-good、回滾、budget guard、archive 備份檢查及記錄。

**完成門檻：** 重播不增加業務版本；importer 無權 publish；並發發佈返回 conflict；migration／index／audit 成本有計入；配額未知時阻擋 remote write。

### Phase 5｜Staging 驗證

按照部署文件建立獨立 staging，只跑每學段最多 5 筆、最多 15 筆的初次 canary。相關事件用已核實小樣本或保持空，不虛構。

**完成門檻：** 真實 URL、DB、版本 ID、測試、API CPU、D1 costs、scope 覆蓋與限制均有證據；`wrangler deploy` 成功不等於資料驗收完成。

### Phase 6｜Production 上線

必須得到明確 production 執行指令；核对帳戶額度、staging 證據、備份、版本、審核範圍。先 disabled admin 狀態上線，再受控資料發佈。

**完成門檻：** 無 demo、無過期冒充、來源與隐私說明、noindex 設定正確、回滾已演練、營運模式和未覆蓋範圍明確。

---

## 13. 必須有的測試

| 類別 | 不能省略的案例 |
|---|---|
| 年度 | 概覽年份≠入學年份；未來學年無資料；不自動搬用去年事件 |
| 日期 | date-only、確切時分、跨年、全天 ICS exclusive end、未知截止時間 |
| 費用 | 0、null、不適用、不同班別／年度／期數；不完整總額不冒充完整成本 |
| 識別 | 前導零、同名不同校、同校不同址／session、改名、未核實 mapping |
| 解析 | UTF-8 BOM、引號內換行、不同編碼、200 HTML 錯誤頁、缺欄、重複行 |
| 發佈 | staged 不可見、審核 hash 不匹配、scope 意外縮小、canary 不可取代全量 |
| 併發 | head CAS 過期返回409；audit與head一致；timeout後重試不重寫 |
| 權限 | 無 token、錯 token、importer 冒 reviewer、flag 關閉、所有 hostname 一致 |
| 路由 | 瀏覽器導覽及 fetch 的 API 404 均為JSON，不被 SPA fallback 吃掉 |
| 私隱 | 筆記不進網路／logs；惡意匯入 JSON 被拒；本機清除有效 |
| 濫用 | SQL injection、XSS、巨型 body、任意 URL、redirect 至私有網路 |
| 預算 | index/write 放大、未知帳戶總量、達 budget 後停機、無限 retry 被禁止 |
| 回滾 | 程式舊版仍兼容 schema；資料 head 回切；raw 與審核記錄不刪除 |
| 快取 | release-key 分隔、admin不快取、過期manifest不混讀、撤回程序 |

使用真實來源 fixture 的測試與 synthetic fixture 分開。CI unit tests 不每次爬 live 官方網站；live probe 是顯式獨立作業。

Worker/D1 integration 使用當前官方支援的測試工具或本機 Wrangler，依鎖定版本驗證 API，不從舊文章抄過期 Vitest adapter。不能用 Node mock 通過就宣稱 workerd 行為已驗證。

---

## 14. Definition of Done 與交付證據

每個 task 完成後更新 `docs/STATUS.md`，包括變更檔案、執行指令、exit code、測試數量、真實資料來源、未完成項目、remote 是否曾寫入、讀寫成本及下一步。

狀態只可為 `NOT_STARTED / IN_PROGRESS / PASS / FAIL / BLOCKED / NOT_RUN`；未執行不得 PASS。部署／live data／效能分開報告，不能用單一綠燈遮蓋。

正式交付至少包含 source coverage report、data dictionary、schema migrations、測試、部署 runbook、rollback runbook、archive 備份方法、Git ignore／secret 檢查和最新成本觀察。

---

## 15. 可直接交給 Coding Agent 的起始指令

```text
請先閱讀 DEVELOPMENT.md 及 DEPLOY_CLOUDFLARE.md，再檢查現有 AGENTS.md、repo 結構、git status 和依賴。
本輪只執行 Phase 0：盤點現況、核對官方來源、記錄可取得的實際 schema、識別資料與部署風險。
不要一次生成整個平台，不要重設本文件已決定的範圍，不要改動不相關專案。
保留使用者既有修改；先測試，必要修改保持最小。
不得建立／更改 Cloudflare 雲端資源，不得 remote migration、seed、deploy、啟用 Cron 或付費產品。
不得把未測試項目寫成 PASS，不得把 fixture 當 production data，不得推算未知招生日期。
完成後交付 Phase 0 報告、SOURCE_CONTRACTS、ARCHITECTURE_DECISIONS、STATUS，並列出下一階段可執行任務。
若來源不能讀取，保留 BLOCKED 與原因，繼續可獨立完成的唯讀盤點，不虛構欄位或索引 ID。
```

---

## 16. 官方參考資料

以下連結核對於 2026-09-18。平台數字、資源格式與工具行為可能更新；執行者須重查並記錄實際版本。來源表提供資料存在及更新節奏證據，不代表已驗證完整資料內容。

- [S01：教育局學校位置及資料](https://data.gov.hk/en-data/dataset/hk-edb-schinfo-school-location-and-information)
- [S02：幼稚園及幼稚園暨幼兒中心概覽](https://data.gov.hk/tc-data/dataset/hk-edb-kgjoinkes-kg-profile)
- [S03：小學概覽](https://data.gov.hk/en-data/dataset/chsc-chsc-primary-school-profiles)
- [S04：中學概覽](https://data.gov.hk/en-data/dataset/chsc-chsc-secondary-school-profiles)
- [S05：DATA.GOV.HK 使用條款](https://data.gov.hk/en/terms-and-conditions)
- [CF-01：Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [CF-02：Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [CF-03：D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [CF-04：Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [CF-05：R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [CF-06：R2 Get Started](https://developers.cloudflare.com/r2/get-started/)
- [CF-07：D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [CF-08：D1 Database API／batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [CF-09：Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
