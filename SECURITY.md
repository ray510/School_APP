# 安全與資料邊界

本版是開發中的本機 MVP。請勿把「CI 通過」理解為完整安全認證。

## 已實作

- 公開 API 參數驗證、查詢上限、參數化 SQL、固定發布版本、未發布資料不公開。
- HTML 安全標頭、CSP、nosniff、非正式環境 noindex；開發服務綁定 loopback。
- 私人清單及事件只在瀏覽器；匯入 JSON 有大小／schema／筆數驗證，衝突要選擇處理方式。
- 官方來源下載有域名／協定、大小及時間限制；原始檔 hash 核對。
- 新增寫入工具拒絕 staging／production；本機發布有審核 hash、筆數、CAS、scope 與審計保護。
- GitHub Actions 檢查使用 read-only repository permissions，checkout 不持久保留憑證；不含 Cloudflare production secret。

## 上線前仍需完成

遠端 operator 身份與角色分離、供應鏈／依賴審查、持久 archive與還原演練、完整未信任匯入及授權測試、真實部署成本／濫用測試、營運更正與漏洞回報渠道。

請勿上傳兒童身份證明、成績表或其他敏感檔案。不要把真實憑證放入 PR、issue、測試 fixture 或錯誤日誌。若發現疑似憑證外洩，先在 provider 撤銷／輪換，再處理 repo 記錄；只刪除文件不能令已外洩憑證失效。

目前沒有開放式寫入 admin API、註冊／登入或私人資料同步服務。任何新增能力都要另行 threat model 和驗收，不可只打開 feature flag 當完成。
