# 正式版：全量官方來源目錄

## 本輪授權與交付邊界

使用者要求正式版本，不再限北區試點或小樣本。正式 hostname 為 `schools.finpulsx.win`，Worker 為 `hk-school-guide-production`。既有 `schools-test.finpulsx.win`、測試 D1、主站及其他子網域保持不變。

此文件描述已提交的實作；部署是否完成以 production-release workflow 與 deployment-result.json 為準，未驗收前不得宣稱上線。

## 完整性的定義及驗收

對四個明確選定的官方繁體中文資源版本全量擷取：教育局名錄、幼稚園概覽、小學概覽及中學概覽。不是只刪除「小樣本」文字；builder 逐列保留每個原始欄位，另有獨立 verifier 對原始 CSV 逐行逐欄比對。

- 每份來源：parsed rows = published rows，excluded rows = 0，欄位數一致。
- 不因重複校號而丟棄紀錄；特殊學校亦保留，獨立分類。
- 同名、同址、同學段只作顯示分組，不冒稱已核准 canonical identity。
- 未對上名錄的年度概覽，仍在「全部年度概覽／所有來源資料」搜尋結果中展示，所有原文欄位可讀。
- 不把原文學費 0 當成空白，不把托兒收費當 K1 學費，不推算未知日期。
- 學校數、名錄來源紀錄數、概覽紀錄數及顯示分組數分開計數。
- 入學學年不重寫概覽版本；來源日期及版本每欄保留。

「來源全量」不等於全港每間學校最新招生公告或 PDF 收費證明書內容均已結構化。既有 15 項有證據的招生事件保留，事件覆蓋另列。小學概覽2026網上版與最新下載 CSV 版本可能不同，介面明示，不假冒2026版本。

## 架構及成本

正式公開站為 Vue 3 + 版本化 Workers Static Assets + 最小 read-only Worker。索引在瀏覽器篩選，每校原文 JSON 按需讀取；完整 ZIP 包含原始 CSV 與標準化 JSON，可下載備份。

公開低頻來源不需要為每個訪客執行 D1 查詢，亦不需要複製試點資料庫。正式版不綁 D1／R2／KV，沒有 DB migration、DB 建立或全量寫入，沒有排程與付費方案變更。原有受審核 D1 工具與所有 staging 保護仍保留。

正式私人清單仍只存瀏覽器 IndexedDB，有保存完成提示、revision 衝突保護與備份匯入確認。新正式域名與舊測試域名不是同一瀏覽器 origin，不會自動搬走測試站私人資料。

## 部署流程

`.github/workflows/production-release.yml` 只在 release/full-catalog 分支的該 workflow 檔改動時觸發，亦提供 workflow_dispatch。

prepare：frozen install → typecheck/lint/tests → 四來源重新下載 → 現有招生來源重新核對 → production Vite build → 全量資料構建 → 每行每欄独立核對 → 真正本機 workerd → desktop/mobile browser。

publish：將同一資料包存為私有 repo 內的 GitHub Release asset → 核對 finpulsx.win zone、名稱／域名所有權及路由衝突 → dry-run → 部署獨立 production Worker → HTTPS 及版本核對 → 無部署憑證的線上瀏覽器驗收。

GitHub Release archive 沒有 Actions artifact 的90日自動到期；同一資料 ID 與 hash 不得覆寫成不同內容。持久保存依赖 repo 與 release 留存，不宣稱不可刪除。可在網站「來源」頁另外下載公共資料 ZIP，沒有私人筆記或憑證。

只有實際 `LIVE_VERIFIED` 加線上瀏覽器通过，才標記正式站交付完成。任何來源缺失、資料不對數、token 缺失、域名衝突或權限不足均停止；不繞過 protection，不接管別人的 hostname。

## 正式驗收頁

首頁；全港目錄；三學段全部年度概覽；特殊學校；同學段比較；完整原文欄位；來源覆蓋表；私人筆記保存及重載；未知年份事件空狀態；JSON API 404；HTTPS health 與 build/data ID 一致。

工作分支 `release/full-catalog`。本輪沒有自動合併 main 或更改分支保護。
