# 分類與分析頁交付紀錄 — 2026-09-19

## 現況

**官方分類拆分及確定性分析頁已部署正式站；JEV 串接程式已提交，但實際模型分析因缺少推論憑證而未執行。**

不得將 workflow 的 success 或網站 LIVE_VERIFIED 解讀成 JEV 已產生真實標籤。這兩個驗收範圍分開記錄。

- 正式分析頁：https://schools.finpulsx.win/analytics
- 搜尋及分類：https://schools.finpulsx.win/schools
- 程式 commit：`51894cd528afc53740fdef12fcb07618194835c3`
- 分支：`release/full-catalog`
- Workflow：[Full official catalog production release — 35434941445](https://github.com/ray510/HK_APP/actions/runs/35434941445)
- prepare job `105875897881`：success。
- publish job `105876198843`：success，含部署後正式域名瀏覽器驗收。
- HTTPS／版本驗收：`LIVE_VERIFIED`，`2026-09-19T09:35:12.653Z`，香港時間 **17:35:12**。
- 資料 ID：`b8c870ee938ed2abbe2b3bb4a385b6a34770784998fd3a5e2318cce06f9aaea6`。

本文件更新較早 README 第4節的「分類待修正」歷史狀態；現行三維分類已實作及驗收，但不代表所有來源身份或未公布資料都已核实。後續本文件的 commit 不等於線上程式再次部署。

## 已上線的分類修復

`funding_type`、`kg_operator_type`、`kg_scheme_participation` 分開，不使用 AI 或校名猜測。

中小學保留官立、資助、直資、私立等官方資助分類；幼稚園卡片優先呈現營辦性質及教育計劃，不再把「私人營辦」「非牟利」「政府資助」混成同一個標籤。詳情頁提供原始欄位、原值、來源版本、來源行號及證據。

原始欄位不修改，未知不預設私立，同來源衝突不採最後寫入值，有名錄時不以歷史概覽覆蓋資助分類。沒有相同校址年度資料的紀錄仍保留未知，不以同名校址硬補。

實際資料核對：上水惠州公立學校、粉嶺公立學校為 AIDED；粉嶺官立中學為 GOVERNMENT。公開搜尋的篩選器已分為官方資助類別、幼稚園營辦性質、幼稚園教育計劃。

### 單一來源版本的統計例子

以下為本次來源紀錄數，不是獨立學校數：

| 來源 | 分布 |
|---|---|
| 小學概覽2025（507筆） | 資助420、官立33、直資21、私立33 |
| 中學概覽2025/26（441筆） | 資助354、官立29、直資56、按位津貼2 |
| 幼稚園概覽2025/26（962筆）：營辦性質 | 非牟利792、私立獨立170 |
| 幼稚園概覽2025/26：教育計劃 | 有參加718、沒有參加243、申請審核中1 |

## 分析頁功能

`/analytics` 可選資料來源版本、學段及地區，顯示原始來源紀錄分母、分類分布、文字標籤處理狀態、逐筆證據入口及 JSON 匯出。數量與百分比由程式計算，不交給模型。

每次只統計一份來源版本，未分析、未提及、明確否定、待覆核及 API 錯誤分開。未因新增 AI 欄位刪除或限制全量名錄。沒有學校排名、錄取機率或泛用聊天機械人。

所有5406筆原始來源紀錄、1910筆年度來源紀錄及原始欄位已再次獨立核對。零排除、零合成。四份原始CSV hash與前一正式發布一致；3580個顯示組ID亦保持相同，未因本輪分類修正變更私人清單所指的ID。

## JEV 的實際執行結果：尚未分析

本輪 production job 的分析步驟實際取得以下結果：

```json
{
  "provider": null,
  "status": "PARTIAL_OR_UNAVAILABLE",
  "reason": "MISSING_INFERENCE_CREDENTIALS",
  "status_counts": {"NOT_ANALYZED": 1910},
  "usage": {"requests": 0, "input_tokens": null, "output_tokens": null}
}
```

`TYPESAFE_API_KEY`、`OPENROUTER_API_KEY`、`JEV_CLOUDFLARE_API_TOKEN` 在該 step 均為空。這只是本次 production job 的可用性結果，不推論使用者其他帳戶或電腦没有金鑰。既有 Cloudflare 網站部署憑證仍正常，沒有把它擅自當成推論憑證。

六種文字標籤各1910筆，共11460個處理狀態均為 NOT_ANALYZED；**不是11460個模型已確認的結論**。沒有任何模型呼叫、合成結果或假引文。內附8個繁中線上模型canary也未執行；本次Python的15項測試屬本機分類及契約測試，不是模型準確率測試。

### 已提交的 JEV 能力

實作 TypeSafe / OpenRouter / Cloudflare adapter、固定 Choice 與證據片段ID、逐字引文驗證、來源與問題版本快取、用量記錄、有界重試及預算。六個主題是課後學習支援、非華語支援、特殊教育需要支援、英文延伸活動、STEM／科技探究活動、家校合作。

固定模型門檻只是初始工程設定。仍需實際APIcanary、批量執行與人工標註驗證，不能宣稱真實學校分析已校準。詳見 [ANALYTICS_AND_JEV.md](ANALYTICS_AND_JEV.md)。

### 啟用方式

將可用的 TypeSafe 推論 key 存入本repo的 production environment 或 repository Actions Secret `TYPESAFE_API_KEY`；使用 OpenRouter 則為 `OPENROUTER_API_KEY`。不要將 key 貼入對話、PR、程式碼或前端。

Cloudflare 推論使用獨立 `JEV_CLOUDFLARE_API_TOKEN`，並提供帳戶ID與已確認的 `JEV_INPUT_USD_PER_MILLION` 價格；不靜默沿用部署 Token。

加入其中一個可用provider憑證後，可對上述 run 選 **Re-run all jobs**。不能只重跑 publish，因為模型分析是在 prepare。每次的模型結果、預算及驗收均須按新run attempt核對；加入任意key不保證通過。現有workflow模型預算設定US$1、最多2200次請求，不會自動加值或升級方案。

## 實際通過的驗收

| 項目 | 本輪結果 |
|---|---|
| Frozen install / TypeScript / ESLint | PASS |
| Node regression | 70 passed，0 failed |
| Vitest | 116 passed，9個測試檔 |
| Python分類與JEV契約 | 15 tests OK，沒有真實模型呼叫 |
| 全量原文核對 | 5406筆、四來源、零排除、零合成 |
| 分類證據及分析分母核對 | PASS，5406個來源紀錄及11460個明確未分析狀態 |
| 本機 workerd + desktop/mobile Chromium | 8 passed（28.7秒） |
| 正式域名 HTTPS / data ID | LIVE_VERIFIED |
| 正式域名 desktop/mobile Chromium | 8項流程所屬step成功，含分類、分析頁、原文、比較及私人筆記 |
| JEV真實推論／人工校準 | NOT_RUN / BLOCKED_MISSING_INFERENCE_CREDENTIALS |

本輪沒有再次執行獨立Python SQLite發佈套件；正式資料路徑沒有D1，不把較早測試當成今次實跑。線上結果来自實際GitHub Actions runner；ChatGPT web工具無法獨立載入該域名，未宣稱在使用者Windows實機或其他瀏覽器測試。

## 備份及範圍

同版資料已封存在 [school-data-b8c870ee938ed2ab](https://github.com/ray510/HK_APP/releases/tag/school-data-b8c870ee938ed2ab)，Release ID `392014533`、asset `574488638`，10,713,264 bytes，SHA256：

`bc9bbf202270fb2327125af86a61f34f32a299d087391af4531807d1f64b17d8`

本輪artifact：
- `full-catalog-production-package`：10581407999，42,949,884 bytes，SHA256 `fe9645989d825c682443f888d16db15c71dc5824b2249e775ded06f4792b1cd1`。
- `full-catalog-production-live`：10581283248，1,316,408 bytes，SHA256 `358213d978f67caa50b31981603a5aed46e8b2e7dc6cf649e147bb947d36c173`。

兩個artifact到期日為2026-12-18T09:31:43Z。GitHub Release另行保留，但不宣稱永久不可刪。

只有production Worker與靜態資產更新；D1寫入0、新DB0。沒有更改 staging、其他網站、付款方案或排程，也沒有合併main。私人筆記仍只在瀏覽器IndexedDB，不送往模型。
