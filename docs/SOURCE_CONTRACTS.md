# 官方來源契約與證據邊界

核對日期：2026-09-18。程式 commit `39594dc525ceccb69e31527798c66810b4517daf`。

實際來源驗證：<https://github.com/ray510/HK_APP/actions/runs/35366620214>，success。

| 來源 | 發布者 | 本輪觀察 | 語義狀態 |
|---|---|---|---|
| edb-school-directory | Education Bureau | UTF-8 BOM CSV，官方类别与字段已確認，三學段各5筆canary | 結構及正規化已驗證；重複校號隔離，session/campus未核實 |
| edb-kg-profiles | Education Bureau | 2025/26，962 records／104 columns，`^` delimiter | Adapter parsed；identity candidates未批准 |
| chsc-primary-profiles | Committee on Home-School Co-operation | 2025，507 records／118 columns，comma | Adapter parsed；不能假設有與EDB共用的numeric ID |
| chsc-secondary-profiles | Committee on Home-School Co-operation | 2025/2026，441 records／103 columns，comma | Adapter parsed；開設及擬開設欄位年份分開 |

這些年度版本是實際取得目錄內選定的繁中 CSV，不宣稱是各學校網站的最新版本，不直接映射成家長選擇的入學年。

## 核心資源

- S01：`https://www.edb.gov.hk/attachment/en/student-parents/sch-info/sch-search/sch-location-info/SCH_LOC_EDB.csv`
- KG：`https://www.edb.gov.hk/attachment/tc/edu-system/preprimary-kindergarten/free-quality-kg-edu/KGP_2025_tc.csv`
- Primary：`https://www.chsc.hk/datagovhk/psp_2025_tc.csv`
- Secondary：`https://www.chsc.hk/datagovhk/ssp_2025_2026_tc.csv`

來源 probe 仍從 data.gov.hk CKAN 目錄取得資源清單，年度 inspector 明確選擇繁中 CSV；不能把以上具體年度網址當永久的最新版本端點。

## 解析及身份規則

S01 保留 SCHOOL NO. 前導零，依已觀察的 ENGLISH CATEGORY 精確映射學段。未知類別不靠校名猜測。N.A. 網址是未知，不是可點擊網址。重複鍵隔離、特殊學校列未覆蓋；班別暫不由缺失值填成全日。

KG 學校編號＋校址編號只作來源內 key，不直接宣稱與 S01 key 等價。CHSC 原始 CSV 未提供已驗證的共同 numeric key；使用 row hash 定位 raw record，另經明確審核對應到已存在的 canonical school_id。名字及地址完全一致只產生候選，沒有自動批准。

所有年度欄位保留來源原文及 row/file hash。相對詞「上學年」「本學年」不自動換成年份；明示年份才入 reference_period。擬開設科目標示 planned。幼兒中心費用、半日／全日及各年級費用不可合併成一個沒有語義的學费。

## 證據及限制

Live workflow artifact 包括 raw、metadata、SHA-256、獨立 parser row-count 對照、coverage 與未批准 identity-review，保留7天。這是開發證據，不是持久備份方案。

需要更新 raw 或 parser 時，建立新證據，不改寫已發佈內容。缺欄、壞引號、重複列、未知編碼或 HTTP 200 HTML 錯誤頁不得靜默當成功。所有正式發布仍需另行審核及明確 publish。
