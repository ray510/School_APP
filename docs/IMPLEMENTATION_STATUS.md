# Implementation status — 2026-09-18

## 已提交及驗證的範圍

工作分支 `fix/phase1-stabilization`，Draft PR #1。程式驗收基準 commit：
`39594dc525ceccb69e31527798c66810b4517daf`。

此後如只提交操作文件，以下測試證據仍明確指向上述程式 commit；不把尚未跑過的其他 commit 冒稱已通過。

`main` 保持 `7d04886264ddca498d859711689a2280f4ac9b32`。本輪沒有 Cloudflare 遠端部署、D1 遠端 migration／import、cron、production publication 或付費方案更改。

## 真實驗收證據

本機驗收 run：<https://github.com/ray510/HK_APP/actions/runs/35366624076>

GitHub 回報 `completed / success`，head SHA 與上列程式 commit 相符。

| 項目 | 狀態 | 證據範圍 |
|---|---|---|
| Node 24 + pnpm 10.28 frozen install | PASS | Ubuntu GitHub Actions，全新 checkout |
| Worker 生成型別、四個 package typecheck | PASS | 非手寫假 binding |
| ESLint | PASS | 零 warning 門檻 |
| Node regression 及 Vitest unit | PASS | parser、identity、domain、ICS、URL、年度 parser、路由、部署防誤操作等 |
| SQLite 發佈測試 | PASS | 13 個案例；含不同版本真正回切、重播、審核 hash、CAS、事件 cohort／count |
| Vue production build | PASS | dist、build-info、robots、security headers |
| Worker dry-run build | PASS | 無上傳 |
| 本機 D1 migrations 001–004 | PASS | Wrangler／workerd 本機資料庫 |
| Empty-state HTTP smoke | PASS | 10 項；真正 workerd，不只 Node mock |
| Synthetic import replay | PASS | 三學段、每學段兩項；重跑不重複發佈 |
| Catalog HTTP integration | PASS | 24 項；三學段搜尋／詳情／比較、年度空狀態、Unicode cursor、錯誤輸入、HTML security headers |
| Playwright | PASS | 6 項 desktop/mobile Chromium；搜尋比較、深層刷新、私人筆記不傳送、備份、私人日曆 |
| Production synthetic demo 拒絕 | PASS | 命令失敗，沒有 production 寫入 |
| 使用者 Windows 實機 | NOT_RUN | 只提供 PowerShell 操作指引 |
| Cloudflare staging／production | NOT_RUN | 不把本機 workerd 當成真實部署 |

年度資料匯入與展示已實作；以上年度 HTTP 測試驗證的是未發佈時的安全空狀態，不冒稱每所學校的完整年度資料已上網。

## 真實來源驗證

來源 run：<https://github.com/ray510/HK_APP/actions/runs/35366620214>，相同程式 commit，`completed / success`。

- S01 教育局名錄：實際下載、完整結構解析，各學段建立 5 筆 canary；未發佈。
- 幼稚園概覽 2025/26：**962 筆、104 欄**，來源使用 `^` 分隔。
- 小學概覽 2025：**507 筆、118 欄**，來源使用逗號分隔。
- 中學概覽 2025/2026：**441 筆、103 欄**，來源使用逗號分隔。

年度筆數由 Python 與 TypeScript adapter 對同一 raw 檔交叉驗證。它們是來源紀錄數，不是本平台已完成 canonical mapping 的學校數，也不是當屆可報名學位。

年度版本是本輪資料目錄所列選定 CSV，不宣稱一定等於學校網站最新版本。所有原始檔、hash、metadata、source contract、coverage 及未批准 identity-review 輸出到來源 workflow artifact，保留 7 天。短期 CI artifact **不是 production durable archive**。

S01 首輪來源觀察有 3,496 raw records、16 組重複校號；後續擷取 hash 可能不同，必須以該 bundle 的 metadata 為準。重複校號隔離，班別 UNKNOWN／校址 null 保留未核實含義。特殊學校未納入本輪普通三學段 baseline。

## 已實作而仍需營運核實的部分

年度 `prepare → reviewed mapping → build → hash-confirmed local import → explicit publish` 已有程式和來源 parser；不自動批准姓名／地址相同的候選。正式事件要求 raw evidence、同一學年／route、每個事件 ID 及 hash 明確確認；無資料時留空。

本機 release publish／rollback 是 SQL trigger 原子 CAS，head 與 audit 同步；local operator 並非雲端角色分離的安全實作。

Offline deployment preflight 會檢查 DB 佔位值、環境隔離、build metadata、關閉排程與 admin flags、帳戶總量觀察、時效及預算餘額；它不驗證真實 provider 身份，也不會自動建立資源或部署。

## 尚未完成的上線門檻

1. 全量、逐校的跨來源 identity／多址／班別配對審核及覆蓋報告；不能將 exact-match candidate 當成人工批准。
2. 真實年度收費、學校提供欄位的語義核對及當屆招生事件持續維護；目前不能承諾所有學校資訊齊全。
3. 大於 canary 的正式匯入、完整跨來源 API／前端正向展示驗收及更多匯入衝突／無障礙／安全案例。
4. 遠端 importer/reviewer 權限分離、身份驗證、帳戶讀寫額度證據、持久 archive／備份及整體成本量測。
5. Cloudflare staging 部署、真實 URL canary、provider 上成本／回滾演練，再取得明確 production 執行指令。
6. 上線前依賴安全審查、營運更正聯絡渠道及完整資料來源／私隱說明審核。

**結論：本機選校 MVP 與其列出的自動測試已通過；原始 DEVELOPMENT.md 的全部 Phase 0–6 尚未全部完成。**
