# 全站 JEV 分析與資料來源中心

本輪把原有六主題保留，新增四個實際 TypeSafe `jev-1.13.0` 問題：遊戲及探究教學、入學適應及升學銜接、情緒及輔導支援、藝術及體育活動。固定選項、原文片段 ID、逐字證據驗證、未知與待覆核分開。沒有學校排名、錄取概率或泛用聊天機械人。

## 家長入口

- 首頁「由你關心的安排開始」：按有原文證據的主題搜尋。
- `/schools`：新增 JEV 特色及處理狀態篩選；卡片顯示最多三項已通過目前門檻的文字提及。所有原始紀錄及 ID 保持不變。
- 學校詳情：四個新增分析主題、實際引文及適合向學校查詢的問題。查詢問題是固定產品文字，不冒稱模型生成事實。
- `/compare`：新增深入教學與支援對照，原有六主題、官方欄位及幼稚園實際安排比較全部保留。
- `/sources`：資料來源中心，四份官方資料完整版本、筆數、全部欄位、原始URL、封存CSV、hash、招生公告及模型狀態。
- `/analytics`：原本的單一來源統計保留；來源中心可直接導向指定來源，並提供新增四主題的完整分母。

## 分析資料與原始資料分開

原資料 data_id 不改寫。新增分析有獨立 analysis_id、模型及 policy_version，存於 `/insights/<analysis_id>/`。可下載 `/downloads/school-analysis.zip`，原始四個來源則可個別下載 `/downloads/sources/<source_id>.csv`。

搜尋索引使用已驗證的 `resolveProfiles` 來源規則，讓搜尋與詳情一致，並保留原始 annual_rows、directory_rows，絕不把顯示層來源關聯當成新增學校或新增來源紀錄。缺少關聯的紀錄保持可見。多版本不混合得出肯定結論。

## 推論、成本與憑證

`.github/workflows/sitewide-release.yml` 使用 production environment；只在 JEV step 注入 `TYPESAFE_API_KEY`。不把金鑰、家長筆記或兒童資料放到瀏覽器或分析包。最多US$0.80程式預算、2200請求、3併行，保留實際usage。模型價目按2026-09-19官方文件核對為每百萬輸入US$0.042；輸出免費，不是Cloudflare整體費用。

四個繁中合成canary通過才批量處理全部1910筆；少於95%有效來源回應即停止，不替換原先正常的正式站。95%只是發布可用性門檻，不是語義準確率。REVIEW、NOT_STATED、EXPLICITLY_ABSENT、API_ERROR等仍如實顯示；尚未經真人標註學校資料集校準。

官方參考：
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/confidence

## 發布與驗收

固定重用已通過驗證的官方來源及原有六主題結果；只為四個新主題呼叫模型。來源檔及既有JSON位元組不變，分析輸出另外封存成 GitHub Release。發布前跑原有完整測試及新來源／搜尋／詳細／比較流程；發布後按正式域名再次執行。沒有D1寫入、付費方案變更或影響其他hostname。

所有HTML以 no-transform 阻止額外edge統計腳本注入，保留self-only CSP；新增驗收檢查來源頁零第三方載入。

本文件是實作規格；實際commit、run、推論數量、費用及線上狀態以交付紀錄和artifact為準，不將測試尚未執行標成完成。
