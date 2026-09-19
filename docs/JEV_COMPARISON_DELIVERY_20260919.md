# JEV 學校比較正式交付 — 2026-09-19

## 已完成

正式站的2–4個同學段學校資料組比較，已加入JEV文字證據分析、共同提及、記載差異、待覆核狀態及JSON匯出。官方分類／時間／收費原文保持獨立對照。

正式入口：https://schools.finpulsx.win/schools?collection=annual 。選取同學段2–4項後按「比較已選」，進入 `/compare?ids=...`。

**此版使用已發布的真實TypeSafe `jev-1.13.0` 分析結果，由程式整理跨校對照；不是每次點擊都重新發起多校聯合模型推論。** 新JEV呼叫0次，不新增模型費用；沒有推定所有雲端運算免費。私人筆記不發送到模型或比較匯出檔。

## 版本與實際發布

| 項目 | 實際值 |
|---|---|
| 功能commit | `bb1ac62fcdb6da50f859be8161734e2aa9a2f054` |
| 最後修復及已部署commit | `c61afb2c9d7193e5bf9a46e6fce5800bb788b36d` |
| 工作分支 | `release/full-catalog` |
| Workflow | JEV school comparison release |
| 成功run | [35437031189](https://github.com/ray510/HK_APP/actions/runs/35437031189) |
| Prepare job | `105881337758`，completed / success |
| Publish job | `105881625657`，completed / success |
| Worker | `hk-school-guide-production` |
| Worker version | `e3ac9192-209f-47d6-9635-90a8e6839725` |
| HTTPS／資料版本驗收 | `LIVE_VERIFIED`，2026-09-19T10:21:14.956Z，香港時間18:21:14 |
| 後續正式域名瀏覽器驗收 | 12 passed，58.6秒；2026-09-19T10:22:37Z完成 |

後續文件commit不是新的線上程式部署。沒有合併main、force-push、修改staging、主站或其他子網域。

## 家長使用方式

1. 在「年度概覽」搜尋並選擇2–4項同學段紀錄，核對學校名稱及地址。
2. 按比較，先看「JEV 證據比較」，再看「官方資料比較」。
3. 六個主題為課後學習支援、非華語學生支援、特殊教育需要支援、英文延伸活動、STEM／科技探究活動、家校合作。
4. 可選同一來源版本，或篩選共同提及、記載差異、尚未能比較項目。
5. 展開「查看原文證據」可見原始文字、來源欄位、行號、版本、模型及官方來源入口。
6. 「匯出比較分析 JSON」保留本次data_id、選校ID、方法及證據，不含私人筆記。

沒有直接對應概覽的名錄項目，會提示查閱同名年度來源，不能自動借用不同校址資料。返回選校頁可重新選取；比較結果中的學校順序不按品質排序。

## 分析規則與限制

- 同一data_id；每次選定相同source_id及概覽版本。
- 每個模型結果必須與該校內的source_id、row、record_sha256完全一致。
- 引文以Unicode code point切片逐字核對，避免中文擴展字符／emoji的UTF-16 offset差異。
- 只採納原有工程門檻通過的判斷；REVIEW不因proposed_verdict是正面而變成已確認。
- 「均提及」不代表服務內容、時數、品質或現時安排相同。
- 「提及／未提及」只表示文字記載差異，不能稱某校獨有或另一校沒有。
- 有明確否定證據才可對照為原文記載相反；仍保留年份與來源限制。
- 缺概覽、版本不同、同版多筆、模型版本不明、INVALID_RESPONSE及API_ERROR均保留不確定。
- 不做學校排名、錄取概率、適合度分數或聊天機械人。

既有模型結果尚未經真人標註資料集校準；引用存在不等於模型語義判斷必然正確。資料原文不變，切換目標入學學年不會把歷史概覽重新標成當屆安排。

## 本次驗收

CI使用Ubuntu24.04.5／Node24.20.0／pnpm10.28.0／Wrangler4.135.0。相同測試套件在功能commit及最終修復commit的prepare均成功，沒有減少測試或放寬門檻。

| 範圍 | 結果 |
|---|---|
| frozen install、TypeScript、ESLint | PASS |
| Node regression | 70項通過 |
| Vitest | 137項通過，包括新增21項比較規則測試 |
| Python分類與模型契約 | 15項通過；不是新的真實推論測試 |
| 原始來源逐行逐欄核對 | 5,406筆、四來源、零排除、零合成 |
| 既有模型狀態／引文核對 | 11,460個狀態及7,881段引用保持原狀 |
| 真正本機workerd + desktop/mobile | 12項通過 |
| 正式域名desktop/mobile | 12項通過，包括部署git_sha核對 |
| 本次新模型呼叫 | 0；重用已驗證的真實推論 |

新增單元測試涵蓋共同提及、明確否定、未提及、低信心、異常回應、缺概覽、跨版本、重複資料、錯誤hash、虛構引文、Unicode offset、模型版本不一致及跨學段拒絕。

線上測試實際走過幼稚園／小學／中學各兩校及四校比較、六主題狀態、展開引文、匯出、深層網址刷新、缺資料與原有錯誤結果。既有私人筆記及其他頁面測試亦保留。

ChatGPT工作環境只做離線資料檢查與截圖檢視；正式站連線證據來自GitHub Actions runner、實際部署報告與正式域名瀏覽器測試，未宣稱在使用者Windows實機驗收。

## 首次線上失敗與修復

首個run35436619751：部署成功，本機12通過，但正式域名10通過／2失敗。新測試偵測到Cloudflare注入的beacon script嘗試載入。

已下載並核對兩份trace：桌面／手機各6次script request，response status=-1、failureText=`csp`，console明確顯示self-only CSP阻擋；沒有以這次結果宣稱私隱驗收通過。

修復為只在 `/compare` 回應加入：

```text
Cache-Control: public, max-age=0, must-revalidate, no-transform
```

官方依據：https://developers.cloudflare.com/web-analytics/get-started/ 。沒有修改zone-wide設定，沒有把第三方加入CSP。最終測試核對no-transform及self-only CSP實際存在、比較HTML沒有Cloudflare Insights腳本，並保留零外部請求、零非GET請求的原有斷言；已全部通過。此修復只對比較頁，不能推論全站所有其他路徑沒有edge注入。

詳見 [COMPARISON_PRIVACY_FIX.md](COMPARISON_PRIVACY_FIX.md)。

## 資料不變與備份

data_id：`64a7e4fc199f3d4f028c7d08523bff5f20a327af3fb8ebe34382f0d4c069be9f`。

重用run35434941445 attempt2、artifact10581563399。獨立核對同版資料ZIP、catalog subject hash、各校JSON、analytics及全部3,584個資料檔案位元組一致。

仍為1,910筆年度概覽：1,900筆有效模型回應、10筆INVALID_RESPONSE。原始10笔異常與待覆核標籤沒有在本輪被重試、刪除或偽裝成功。全港完整来源不因比較功能縮小。

資料ZIP SHA256：`da527c1095bac9715062695050a670eb91e745d16c9aec079efa319afacad4d1`。

持久資料封存：[school-data-64a7e4fc199f3d4f](https://github.com/ray510/HK_APP/releases/tag/school-data-64a7e4fc199f3d4f)，Release392019038／asset574514150，12,553,474 bytes。既有同版資產已核對，沒有覆寫不同內容。

本輪成功artifact（到期2026-12-18T10:18:18Z）：

- `jev-comparison-package-1`：10582866209，64,858,423 bytes；SHA256 `504ccd25771776c4fe9240a3a51ce48ea6d084e5da507abeacd15eb6d5ced018`。
- `jev-comparison-live-1`：10582651664，16,189,572 bytes；SHA256 `ecc257fa501257622ddba88370a78ce1f61b5615debe965b92b29210cb929a8d`。

後者已下載驗證hash，內有實際部署、備份、資料重用報告及24張成功截圖。不是24個獨立測試，也不是永久封存；GitHub Release仍依賴repository與資產持續保留。

回復可使用保存的程式commit及同版資料資產；此次不需要DB回滾。未宣稱做過production回滾演練。D1寫入0、新DB0，新推論請求0，沒有修改付款方案或新增排程。
