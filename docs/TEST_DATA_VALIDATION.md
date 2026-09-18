# 真實測試資料包驗收

## 證據基準

- 程式 commit：`36cee9c785b7046a20d792998db5a4df9bbbc684`。
- Workflow：**Real data and finpulsx test deployment**。
- Run：[35369033994](https://github.com/ray510/HK_APP/actions/runs/35369033994)。
- 資料準備 job：`105678337212`，實際結果 `completed / success`。
- 執行環境：Ubuntu 24.04.5，Node 24.20.0，pnpm 10.28.0，Wrangler 4.135.0。
- 資料包 ID：`f6350475fa412107c9da0c9c90c941d283b50c02213b0fc4c24689359b91c51d`。

**prepare 成功不等於 deployment 成功。** Cloudflare 狀態以同一 run 的 `deploy` job 及 `deployment-result.json` 為準；不可由以下資料測試推論網址已上線。

## 名錄來源資料

S01 官方名錄原始 3,496 筆，通過本次明確校類與唯一來源鍵檢查後收錄 **3,302 筆來源紀錄**，排除 **194 筆**。其中包括本輪未納入的 162 筆特殊學校來源紀錄，以及 16 組重複來源鍵涉及的 32 筆紀錄。排除紀錄與原因保存在 `artifacts/test-site/exclusions.json`。

| 學段 | 收錄來源紀錄數 |
|---|---:|
| 幼稚園／幼稚園暨幼兒中心 | 2,156 |
| 小學 | 616 |
| 中學 | 530 |
| 合計 | 3,302 |

這些是來源紀錄數，**不是合併校址／班別後的獨立學校總數**，也不是招生名額。班別 UNKNOWN、校址未核實、學費未知等狀態仍保留。

原始 hash：`e21ae78ecf8ba0e118c0117b4932dc63d76632ab71fff9dfb6203f9020666795`。本輪擷取：`2026-09-18T16:32:42.309Z`。資料發布 scope 為 `partial`，不是 full。

## 年度概覽原文

| 来源版本 | 原始紀錄 | 欄位 | 解析分隔 |
|---|---:|---:|---|
| 幼稚園 2025/26 | 962 | 104 | `^` |
| 小學概覽 2025 | 507 | 118 | `,` |
| 中學概覽 2025/2026 | 441 | 103 | `,` |
| 紀錄合計 | 1,910 | — | — |

三份原始檔已依 metadata hash 核對，Python 與 TypeScript 對同一原始檔的紀錄數一致；輸出網站的 index 與原文 JSON 在 Chromium 驗收時亦再次核對筆數／欄位數。

這批年度資料由 `/source-reference` 展示，使用 `UNLINKED_SOURCE_RECORD` 標籤，沒有偽造跨來源身份審核。來源版本是本次 CKAN 目錄所列選定 CSV，不宣稱等於學校網站最新概覽或 2027 入學招生安排。

公開招生事件：**0**。合成測試紀錄：**0**。沒有用虛構招生資料填充日曆。

## 已實際通過

- Frozen install、四個 package 型別檢查、ESLint。
- Node 原生回歸測試 **59 passed / 0 failed**。
- Vitest **100 passed / 0 failed**，7 個檔案。
- 產生 staging 前端建置、禁止索引 metadata、原文來源頁。
- 套用四份 migration 後，以 Node SQLite 執行真實資料 SQL、完整重播、檢查筆數及外鍵。
- 真正本機 D1 套用 migrations 001–004，匯入 **13,225 條 SQL**。
- workerd HTTP smoke **10 checks PASS**，`data_status=published`。
- Chromium 真實資料驗收 **2 passed**（桌面及手機）；每個包含三學段 API、無合成資料、比較頁、年度原文頁、三個來源的原文筆數／欄位數。

HTTP 與瀏覽器測試在 `127.0.0.1:8787` 的真正 workerd 執行，**不是 finpulsx.win 遠端驗收**。既有 synthetic E2E 屬另一個 ordinary local-acceptance workflow，不與本輪真實資料混為一談。

## 已保存 artifact

[school-test-site-package](https://github.com/ray510/HK_APP/actions/runs/35369033994/artifacts/10557059428)

- Artifact ID：`10557059428`。
- 壓縮檔大小：16,938,294 bytes。
- Artifact ZIP SHA-256：`0233cd42c721ec9d1aff0a097572eb1fe0e676db8b2bfd144372bce04a0813cf`。
- 包含 2,019 個檔案：前端、年度原文 JSON、原始來源、SQL、manifest、coverage 及本機執行記錄。
- SQL 切成 67 塊，逐塊保留 SHA-256。
- 預算模型估算 69,040 rows written；**這是保守預算，不是實際 Cloudflare 帳單或遠端量測值**。
- Artifact 保留 30 天，非永久 production 封存。

## 下一道實際關卡

請參考 [TEST_SITE_DEPLOYMENT.md](TEST_SITE_DEPLOYMENT.md)。已驗證程式及真實資料包可供部署，但仍需 staging job 取得有效 Cloudflare Token，才能核對帳戶／域名／額度並嘗試遠端資源與 HTTPS 驗收。
