# 年度資料與招生事件：本機營運流程

本文件只描述此分支實作的命令。不是 production 執行授權。所有 import/publish 寫入只容許 local。

## 年度概覽

1. `pnpm school source probe --all --out artifacts/source-probe.json` 明確探測資料來源。
2. `python scripts/annual-source-inspection.py` 下載目錄所列繁中年度 CSV，保存 raw 與 metadata。幼稚園是 `^` 分隔；小學、中學使用逗號。
3. `pnpm exec tsx scripts/annual-adapter-validation.ts` 對照獨立解析筆數並產生未批准身份候選清單。此步不等於人工核实，更不會發佈。

查看 `archive/<source>/<sha>/raw.csv` 及同目錄 metadata。版本以來源原始標籤為準，不從入學年加减推算，也不將目錄最新 CSV 當成學校網站最新版本。

```powershell
pnpm school annual prepare --input PATH_TO_ANNUAL_RAW --baseline PATH_TO_S01_RAW --edition "Primary School Profiles 2025 (Traditional Chinese)" --out artifacts/annual-primary-review
```

準備會輸出 `identity-review.json`：只有姓名和地址完全相同才列候選，但不自動批准；重复校號不列為可自動選用的單一候選。

人工核對來源後，另建 JSON 檔，頂層只保留 `mappings`。範本的 instructions 說明不屬於正式 mapping 輸入。

```json
{
  "mappings": [
    {
      "record_hash": "REPLACE_WITH_64_CHARACTER_ROW_HASH",
      "edb_source_record_key": "EXACT_STRING_WITH_LEADING_ZEROS",
      "school_id": "EXACT_GENERATED_ID_FROM_REVIEW",
      "reviewer": "YOUR_OPERATOR_ID",
      "reviewed_at": "EXACT_UTC_REVIEW_TIME",
      "identity_verified": true
    }
  ]
}
```

以上是結構示例，不是可直接匯入的學校資料。每次最多 15 筆；沒有證據的配對保持未核實。

```powershell
pnpm school annual build --input PATH_TO_ANNUAL_RAW --baseline PATH_TO_S01_RAW --edition "Primary School Profiles 2025 (Traditional Chinese)" --mapping artifacts/reviewed-mappings.json --out artifacts/annual-primary-bundle
pnpm school annual import --bundle artifacts/annual-primary-bundle --reviewer YOUR_OPERATOR_ID --confirm-hash EXACT_MANIFEST_HASH --environment local
```

匯入後只是 APPROVED_NOT_PUBLISHED。需再用 `release publish`、指定 bundle 內 channel、目標 release 及原有 head/revision 作 CAS 發佈。年度 channel 獨立於基本名錄及收生事件，不會把舊年度概覽換成當屆入學公告。

學校詳情頁的「查看已審核年度概覽」只讀已審核、已發佈的資料。原始文字只以文字顯示，絕不以 v-html 執行。相對年份欄位保持 reference_period=null；明示 `2025_2026` 的欄位才記錄該時期。幼稚園幼兒中心收費不會誤當 K1 學費；不解析成單一學費的原始文字會保留原欄位。

## 招生事件

用 `AdmissionEvent` 合約準備 JSON：同一来源、學段、入學年及 route，附實際下載文件路徑和 SHA-256。只輸入日期時保留 date-only；不擅自填午夜或 23:59。個人面試時間不屬於官方事件。

```powershell
pnpm school event prepare --input artifacts/reviewed-events-input.json --out artifacts/event-review.json
pnpm school event import --input artifacts/reviewed-events-input.json --reviewer YOUR_OPERATOR_ID --confirm-hash EXACT_SUBJECT_HASH --confirm-events EVENT_ID_1,EVENT_ID_2 --environment local
```

每個 event ID 必須明確確認，原始檔 hash 必須一致，才會入庫。之後仍需要獨立 `release publish`。沒有正式來源事件時保持空，唔會補上示範日期。

## 發佈／回滾

首發 revision=0，previous 不填；已有 head 時必須指定 exact revision 和 `--expected-previous-release-id`。回滾用同一組 CAS 證據，目標必須是同 channel 的歷史已發佈版本。資料版本及審計不刪除。

## 建置與部署前本機檢查

`SCHOOL_BUILD_ENV` 支援 local/staging/production；預設 local。build-info、robots 及安全 headers 由 build 產生。非 production 一律不允許索引；production 也預設 noindex，需另明確開啟。

```powershell
$env:SCHOOL_BUILD_ENV = 'staging'
pnpm build:web
node scripts/deployment-preflight.mjs --environment staging --quota artifacts/account-quota.json --estimated-writes 5000
```

Quota JSON 要有 account_id、as_of、utc_day、coverage=`account_all_d1`、rows_written、daily_write_limit。本機檢查拒絕未填 DB ID、跨環境共用 DB、過期或非帳戶總量的觀察、資產環境錯配，以及未計足 headroom 的寫入預算。它不查遠端，也不能證明提供的觀察仍然有效；還需要 authenticated remote read-only checks 和 staging 驗收。
