# Phase 2 進度

更新：2026-09-18。狀態：IN_PROGRESS；不是全港資料已完成。

已實作并在本機 CI 驗證：三學段 baseline 搜尋／詳情／固定版本最多四項比較、Unicode cursor、參數化查詢、source evidence、明確 synthetic/canary 標示。

三份年度 raw 的專用 parser 已以實際檔案交叉驗證：KG caret、CHSC comma。已加入 hash 綁定身份審核、年度 local bundle/import、年度 API 和詳情 panel；年度正向全流程與逐校真實配對仍不能冒称全部驗收。

尚待：全量多址／班別身份核實、逐欄收費／年份語義核對、完整年度資料發布、整體帳戶成本（API 的單一主查詢 rows_read 不是帳戶總費用）。

具體執行證據見 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)，操作見 [ANNUAL_DATA_OPERATIONS.md](ANNUAL_DATA_OPERATIONS.md)。
