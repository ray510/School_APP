# 真實測試資料包與部署驗收

## 本輪結論

**真實資料 prepare 成功；遠端 deploy 因缺少憑證而停止，測試網址尚未上線。**

- 程式 commit：`36cee9c785b7046a20d792998db5a4df9bbbc684`。
- Workflow：**Real data and finpulsx test deployment**。
- Run：[35369033994](https://github.com/ray510/HK_APP/actions/runs/35369033994)。
- prepare job `105678337212`：`completed / success`。
- deploy job `105679050756`：`completed / failure`，已實際下載同一資料 artifact 並執行部署入口。
- 實際錯誤：`CLOUDFLARE_API_TOKEN is not available to the staging job`。
- 結果：`BLOCKED_MISSING_CREDENTIALS`；在 Cloudflare API 呼叫前停止，沒有建立 D1、沒有遠端資料匯入、沒有改 DNS 或 Custom Domain。
- 執行環境：Ubuntu 24.04.5，Node 24.20.0，pnpm 10.28.0，Wrangler 4.135.0。
- 資料包 ID：`f6350475fa412107c9da0c9c90c941d283b50c02213b0fc4c24689359b91c51d`。

此為 staging job 可取得憑證的實際結果，不推論使用者其他帳戶或電腦沒有憑證。以下本機資料驗收不能當成 finpulsx.win 上線驗收。

## 名錄來源資料

S01 官方名錄原始 3,496 筆，通過本次明確校類與唯一來源鍵檢查後收錄 **3,302 筆來源紀錄**，排除 **194 筆**。排除規則包括未納入本輪的校類、不明／重複来源鍵及結構驗證失敗；逐筆原因在 `artifacts/test-site/exclusions.json`，不由總數反推原因分布。

| 學段 | 收錄來源紀錄數 |
|---|---:|
| 幼稚園／幼稚園暨幼兒中心 | 2,156 |
| 小學 | 616 |
| 中學 | 530 |
| 合計 | 3,302 |

這些是來源紀錄數，**不是合併校址／班別後的獨立學校總數**，也不是招生名額。班別 UNKNOWN、校址未核實、學費未知等狀態仍保留。

原始 hash：`e21ae78ecf8ba0e118c0117b4932dc63d76632ab71fff9dfb6203f9020666795`。本輪擷取：`2026-09-18T16:32:42.309Z`。資料發布 scope 為 `partial`，不是 full。

## 年度概覽原文

| 來源版本 | 原始紀錄 | 欄位 | 解析分隔 |
|---|---:|---:|---|
| 幼稚園 2025/26 | 962 | 104 | `^` |
| 小學概覽 2025 | 507 | 118 | `,` |
| 中學概覽 2025/2026 | 441 | 103 | `,` |
| 紀錄合計 | 1,910 | — | — |

三份原始檔已依 metadata hash 核對，Python 與 TypeScript 對同一原始檔的紀錄數一致；輸出網站的 index 與原文 JSON 在 Chromium 驗收時再次核對筆數／欄位數。

這批年度資料由 `/source-reference` 展示，使用 `UNLINKED_SOURCE_RECORD` 標籤，沒有偽造跨來源身份審核。來源版本是本次 CKAN 目錄所列選定 CSV，不宣稱等於學校網站最新概覽或 2027 入學招生安排。

公開招生事件：**0**。合成測試紀錄：**0**。沒有用虛構招生資料填充日曆。

## 已實際通過

- Frozen install、四個 package 型別檢查、ESLint。
- Node 原生回歸測試 **59 passed / 0 failed**。
- Vitest **100 passed / 0 failed**，7 個檔案。
- staging 前端建置、禁止索引 metadata、原文來源頁。
- 套用四份 migration 後，以 Node SQLite 執行真實資料 SQL、完整重播、檢查筆數及外鍵。
- 真正本機 D1 套用 migrations 001–004，匯入 **13,225 條 SQL**。
- workerd HTTP smoke **10 checks PASS**，`data_status=published`。
- Chromium 真實資料驗收 **2 passed**（桌面及手機）；每個包含三學段 API、無合成資料、比較頁、年度原文頁、三個來源原文筆數／欄位數。

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

[school-test-deployment-result](https://github.com/ray510/HK_APP/actions/runs/35369033994/artifacts/10557880241)

- Artifact ID：`10557880241`。
- 只含實際 `deployment-result.json` 阻塞結果；沒有虛構 DB UUID 或成功網址。
- `writes_performed=false`；未執行 provider 讀寫。

## 解除阻塞

請參考 [TEST_SITE_DEPLOYMENT.md](TEST_SITE_DEPLOYMENT.md)。將有效、範圍受限的 Cloudflare Token 安全放入 HK_APP 的 staging environment 或 repository Actions secret `CLOUDFLARE_API_TOKEN`，然後對上述 run 執行 **Re-run failed jobs**。

Artifact 有效期間會重用已通過驗收的資料包，只重跑部署；不需要重新設計網站或人手逐批匯入。Cloudflare 帳戶／zone／實際權限／額度／DNS 衝突／HTTPS 驗收仍需在取得憑證後真正執行，不承諾加上任意 Token 就一定通過。
