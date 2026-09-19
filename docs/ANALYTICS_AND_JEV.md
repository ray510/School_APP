# 分類、JEV 文字證據與來源分析

本次實作只做三件事：正確拆分官方分類、以 JEV 協助整理公開原文標籤、由程式計算來源統計。不做學校排名、錄取概率、泛用聊天機械人或自動申請。

## 分類規則

`school_classification.py` 直接讀取來源欄位，不按校名或 AI 推定。

| 維度 | 來源 | 處理 |
|---|---|---|
| `funding_type` | 教育局 `資助種類`；小學概覽 `學校類別1`；中學概覽 `學校類別` | 官立、資助、直資、私立、英基、私立獨立學校計劃、按位津貼分開 |
| `kg_operator_type` | 幼稚園概覽 `學校類別` | 非牟利／私立獨立，不當資助類別 |
| `kg_scheme_participation` | 幼稚園概覽 `參加幼稚園教育計劃` | 有參加／沒有參加／申請審核中，未知不推定 |

每個值有原始欄位、原值、版本、來源行號及 hash。同來源互相矛盾為 `conflict`；未識別值為 `unrecognized`；缺欄位為 `not_provided`。有名錄時不以歷史概覽覆蓋資助類別，但另存 `historical_differences`。原始 `fields` 不變；既有顯示組 ID 不變。

幼稚園卡片優先顯示營辦性質與教育計劃，不再只突出「私立」。沒有直接對應年度來源時顯示尚未核對，不能把其他同名校址硬合併。

## JEV 的邊界

六個標籤：課後學習支援、非華語學生支援、特殊教育需要支援、英文延伸活動、STEM／科技探究活動、家校合作。

每個問題是固定 `Choice`，不是生成自由文字。模型從指定片段 ID 選擇證據，程式按原欄位 offset 複製原文，並逐字核對。每筆保留 requested/returned model（若供應商有提供）、原文 hash、規則版本、機率、confidence、覆核狀態及截取情況。

- `MENTIONED`：送審片段明確提及；不是服務品質或當屆保證。
- `EXPLICITLY_ABSENT`：片段明確否定；不是未提及的替代品。
- `NOT_STATED`：送審片段未提及，不等於整份概覽或學校没有。
- `REVIEW`：低信心、證據選擇不一致或矛盾，不能當已確定標籤。
- `NOT_ANALYZED`：缺憑證、預算限制或沒有可分析文字。
- `API_ERROR` / `INVALID_RESPONSE`：呼叫或契約錯誤，不能當語義結果。

每份年度紀錄最多送18段、合計6000字的來源片段。選段是程式的候選檢索，不會自行產生肯定標籤。截取範圍在結果中標示。模型錯誤不會令原名錄或年度資料被排除。

固定門檻僅是工程初始值，**尚未經人工標註學校資料集校準**。內附8個繁中合成契約案例測試肯定、否定、未提及及注入指令邊界；通過不是對真實學校準確率的證明。不能把 `confidence` 當成「正確率」。目前顯示為AI協助整理並附原文，沒有冒稱人手核准或官方認證。

## 接入及成本

推論只在 GitHub Actions 的分析 step 執行，沒有將模型或金鑰放入前端或公開 Worker。

| Provider | Secret | 模型 |
|---|---|---|
| TypeSafe | `TYPESAFE_API_KEY` | `jev-1.13.0` |
| OpenRouter | `OPENROUTER_API_KEY` | `typesafe/jev-1.13` |
| Cloudflare | **獨立** `JEV_CLOUDFLARE_API_TOKEN` + account ID | `typesafe/jev` |

`JEV_PROVIDER=auto` 依上述順序使用已提供的推論憑證；不會靜默取網站部署用 `CLOUDFLARE_API_TOKEN` 當作推論金鑰。Cloudflare 價格必須先在 variable `JEV_INPUT_USD_PER_MILLION` 填入帳戶已確認的每百萬輸入價格；未設定就不呼叫。TypeSafe/OpenRouter目前程式依已核對的US$0.042/M輸入、輸出免費作預算，價格改動時須先更新。

此次 workflow 每次最多預算US$1、2200次請求、3個併行；HTTP 429/暫時錯誤最多重試一次。每次先以UTF-8位元組＋開銷保守預留，再按實際已回報usage結算；無usage不填0，保留預留並記錄未知。非帳單金額，沒有自動加值、升級方案或無限重試。

快取鍵含provider、模型、問題、原文片段及policy。固定模型可重用；Cloudflare別名另加日期epoch，不假裝可鎖固定模型。快取只保存公開來源判斷結果，無私人筆記與憑證。

## 分析頁與分母

`/analytics` 每次選一個來源版本。所有計數由 TypeScript 產生，不交給模型計算。

教育局以原始名錄紀錄為單位；年度來源以該概覽原始列為單位。分母包含未分析及錯誤，不用跨來源同名分組當成獨立學校數。分析頁可按地區、學段及標籤狀態篩選，並匯出所選公共來源分析JSON。

每筆可回到學校頁查看分類證據、年度原文及模型選中的片段。未知不是零元，未提及不是否定。切換入學年份不更改歷史版次。

## 執行與驗收

```powershell
# source probe / annual inspection / event evidence capture 後：
python -m unittest discover -s tests/analytics -v
$env:JEV_ENABLE = '1'
python scripts/jev_analysis.py
pnpm --filter @hk-school/web exec vite build --config vite.production.config.ts
python scripts/full-catalog-build.py
node scripts/production-metadata.mjs
python scripts/full-catalog-verify.py
python scripts/analytics-verify.py
```

缺少推論憑證時仍會為所有年度紀錄建立明確 `NOT_ANALYZED`，不代表 JEV 已驗證。只有 `results.json` 的實際provider呼叫及狀態可以支持相關完成聲明。

正式 workflow 為 `.github/workflows/production-release.yml`：全量來源 → 有界JEV分析 → 分類／資料／語義契約核對 → 本機完整瀏覽器流程 → 同版資料封存 → 正式站部署 → 線上桌面及手機验收。新增分析已包含於版本化資料及ZIP，沒有D1 migration或遠端資料庫寫入。

## 官方API與參考

- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/confidence
- https://developers.cloudflare.com/ai/models/typesafe/jev/
- OpenRouter alpha transport implementation reference: https://github.com/jkudish/jev-mcp/blob/main/src/provider.ts

本文件描述實作，不代替一次成功的CI／模型／部署結果。實際commit、run及模型是否完成，另見本輪交付紀錄。
