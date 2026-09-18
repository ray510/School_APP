# 香港年度選校平台｜來源契約 (Phase 0)

> 文件日期：2026-09-18  
> 狀態：Phase 0 初步驗證  
> 作者：Coding Agent (Claude Haiku 4.5)

---

## 1. 來源探測摘要

本文記錄四個主要官方資料來源的探測結果。每個來源的狀態分為：
- **LIVE_VERIFIED**: 已成功下載並解析，欄位已確認
- **DISCOVERED**: 找到目錄，但資源 URL 或內容尚需進一步驗證
- **BLOCKED**: 無法存取或存在已知問題

---

## 2. 來源詳細記錄

### S01: 教育局 School Location and Information

| 項目 | 值 |
|---|---|
| **source_id** | `edb-school-directory` |
| **目錄頁** | https://data.gov.hk/en-data/dataset/hk-edb-schinfo-school-location-and-information |
| **發佈機構** | Education Bureau (EDB) |
| **契約狀態** | `LIVE_VERIFIED` ✓ |
| **探測日期（UTC）** | 2026-09-18T09:01:29Z |
| **資源格式** | CSV, XLSX, JSON 可用 |

#### CSV 資源詳情

| 項目 | 值 |
|---|---|
| **解析 URL** | `https://www.edb.gov.hk/attachment/en/student-parents/sch-info/sch-search/sch-location-info/SCH_LOC_EDB.csv` |
| **HTTP 狀態** | 200 OK |
| **Content-Type** | application/octet-stream |
| **檔案大小** | ~1.9 MB (1,910,257 bytes) |
| **最後修改** | Mon, 31 Aug 2026 08:40:30 GMT |
| **編碼** | UTF-8 with BOM |
| **行數** | 未計數（待實作計數工具） |

#### CSV 欄位（前三欄已驗證）

```
SCHOOL NO., ENGLISH CATEGORY, 中文類別, ENGLISH NAME, 中文名稱, ENGLISH ADDRESS, 中文地址, LONGITUDE, ...
```

**已驗證欄位：**
- `SCHOOL NO.` - 學校編號（字串，保留前導零）
- `ENGLISH CATEGORY` - 英文校類
- `中文類別` - 中文校類
- `ENGLISH NAME` - 英文校名
- `中文名稱` - 中文校名
- `ENGLISH ADDRESS` - 英文地址
- `中文地址` - 中文地址
- `LONGITUDE`, `LATITUDE` - 坐標（推測）
- ...（其他欄位需完整解析確認）

**備註：**
- 檔案有 UTF-8 BOM，需要正確處理
- 所有校編號應作字串保存，避免前導零遺失
- 此檔案為本平台的基線名錄源

---

### S02: 幼稚園及幼稚園暨幼兒中心概覽

| 項目 | 值 |
|---|---|
| **source_id** | `edb-kg-profiles` |
| **目錄頁** | https://data.gov.hk/tc-data/dataset/hk-edb-kgjoinkes-kg-profile |
| **發佈機構** | Education Bureau (EDB) |
| **契約狀態** | `BLOCKED` ⚠️ |
| **探測日期（UTC）** | 2026-09-18T09:02:54Z |
| **發現狀態** | 目錄可訪問，內容提及 CSV，但直接資源 URL 未確認 |

#### 已知狀態

- 目錄頁 HTTP 200，大小 ~115 KB
- 頁面內容提及 CSV 格式
- 資源下載連結尚未從 HTML 直接提取（可能為動態載入或 data.gov.hk API）
- **未驗證**：實際 CSV/XLSX 資源的真實 URL、欄位結構、最新版本

#### 下一步行動

**Phase 1** 實作：
1. 手動訪問官方頁面，記錄實際下載 URL
2. 下載樣本檔案，完整解析欄位和編碼
3. 確認資料年份和更新頻率
4. 如無法取得，標記為 STALE 並記錄原因

**暫時設定：**
```yaml
source_id: edb-kg-profiles
contract_status: BLOCKED
enabled: false
reason: 'Resource URL not yet verified; data.gov.hk structure requires manual inspection'
```

---

### S03: Primary School Profiles

| 項目 | 值 |
|---|---|
| **source_id** | `chsc-primary-profiles` |
| **目錄頁** | https://data.gov.hk/en-data/dataset/chsc-chsc-primary-school-profiles |
| **發佈機構** | Chinese Secondary Schools Council (CHSC) / EDB |
| **契約狀態** | `BLOCKED` ⚠️ |
| **探測日期（UTC）** | 2026-09-18T09:02:56Z |
| **發現狀態** | 目錄可訪問，內容提及 CSV，但直接資源 URL 未確認 |

#### 已知狀態

- 目錄頁 HTTP 200，大小 ~124 KB
- 頁面內容提及 CSV 格式
- 資源下載連結尚未從 HTML 直接提取
- **未驗證**：實際資源 URL、欄位結構（特別是招生相關欄位）、資料年份

#### 已知風險

- 小學概覽可能涉及多個 entry grade（P1, P2, 插班等），需確認資料分類
- 不同校型（官立、津貼、直資）的資料完整性

#### 暫時設定

```yaml
source_id: chsc-primary-profiles
contract_status: BLOCKED
enabled: false
reason: 'Resource URL not verified; field structure for admission cycles unclear'
```

---

### S04: Secondary School Profiles

| 項目 | 值 |
|---|---|
| **source_id** | `chsc-secondary-profiles` |
| **目錄頁** | https://data.gov.hk/en-data/dataset/chsc-chsc-secondary-school-profiles |
| **發佈機構** | Chinese Secondary Schools Council (CHSC) / EDB |
| **契約狀態** | `BLOCKED` ⚠️ |
| **探測日期（UTC）** | 2026-09-18T09:02:58Z |
| **發現狀態** | 目錄可訪問，內容提及 CSV，但直接資源 URL 未確認 |

#### 已知狀態

- 目錄頁 HTTP 200，大小 ~125 KB
- 頁面內容提及 CSV 格式
- 資源下載連結尚未從 HTML 直接提取
- **未驗證**：實際資源 URL、S1 特定欄位、Banding 相關資料範圍

#### 已知風險

- 中學資料可能包含複雜的 entry route（中一、插班、International、DSE 預科等）
- Banding 資訊通常另行發佈，需確認本概覽是否涵蓋

#### 暫時設定

```yaml
source_id: chsc-secondary-profiles
contract_status: BLOCKED
enabled: false
reason: 'Resource URL not verified; S1 specific fields and admission routes need confirmation'
```

---

## 3. 未驗證的關鍵項目

按優先順序列出 Phase 1 必須確認的事項：

### 高優先級

1. **S02/S03/S04 的真實資源 URL**
   - 必須手動從 data.gov.hk 或官方網站確認
   - 不得猜測或假設

2. **編碼與特殊字元**
   - 所有 CSV/XLSX 的實際編碼（UTF-8, BIG5, 其他）
   - 香港繁體中文、方言字的處理

3. **資料年份標籤**
   - 每個來源的版本/年份欄位
   - 是否有多個版本並存

4. **欄位對應**
   - S01 的校編與 S02/S03/S04 的校編是否一致
   - 跨源 mapping 的可行性

### 中優先級

5. **重複與缺失**
   - 同一校是否在多個來源出現
   - 是否有遺漏的學校

6. **更新頻率**
   - 官方宣稱的更新週期 vs. 實際節奏
   - 每個來源的最新版本時間

7. **使用授權**
   - DATA.GOV.HK 使用條款詳細要求
   - 校方信息的歸屬標註

### 低優先級（後續功能）

8. **事件/招生日期資料**
   - 來源是否內含招生截止日期
   - 當屆通知是否另行發佈

9. **多媒體與補充資料**
   - 校徽、環境照片來源
   - 課程/財務詳情是否在本源內

---

## 4. 來源健康狀態機制

```
初始探測: DISCOVERED
     ↓
檢驗資源 URL → 成功：CONTRACT_VERIFIED
            → 失敗：BLOCKED
                ↓
驗證下載 → 成功：LIVE_VERIFIED
       → 失敗：STALE / DEGRADED / BLOCKED
```

**每個來源將記錄：**
- `catalog_url` - 官方目錄頁
- `resolved_resource_url` - 實際檔案 URL（驗證後填入）
- `last_checked_at` - 最後檢查時間
- `last_successful_fetch_at` - 最後成功取得時間
- `last_human_reviewed_at` - 最後人工審核時間
- `source_reference_period` - 資料所述的年份/時期

---

## 5. 使用条款與引用

所有來源均來自香港政府開放數據平台或教育局官方。

**參考資料：**
- [DATA.GOV.HK 使用條款](https://data.gov.hk/en/terms-and-conditions)
- [教育局官方網站](https://www.edb.gov.hk/)

**本平台的引用方式：**
- 每個公開欄位須可追溯至來源 URL、版本、取得日期
- 來源內容作為已驗證基線，不做自動轉換或推算
- 學校自述資訊保留「據官方概覽表示」等屬性

---

## 6. 後續步驟（Phase 1）

1. 實作 `pnpm school source probe --all` 指令
   - 自動探測四個來源
   - 記錄 HTTP metadata、檔案大小、hash
   - 產生詳細探測報告

2. 實作 CSV/XLSX 解析器
   - 處理 UTF-8 BOM、多編碼
   - 欄位自動偵測與驗證
   - 產生完整欄位目錄

3. 建立 `config/sources.yaml`
   - 四個來源的完整設定
   - 已驗證的 URL 與解析規則

4. 實作 cross-source identity mapping
   - 建立 `config/mappings/` 目錄
   - 手動審核的學校編號對應表

---

**文件簽名：**  
Coding Agent (Claude Haiku 4.5)  
Co-Authored-By: Claude Haiku 4.5 &lt;noreply@anthropic.com&gt;
