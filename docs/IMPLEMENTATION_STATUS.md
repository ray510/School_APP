# Implementation status — 2026-09-21

## 2026-09-21 幼稚園家長卡片證據修正（已上線）

PR [#6](https://github.com/ray510/HK_APP/pull/6) 已合併為 `c181f7b961e87066ba0c7d30b22bcede729e5b9f`。正式發布 run [35560491932](https://github.com/ray510/HK_APP/actions/runs/35560491932) 的 `prepare` 及 `publish` 均為 `completed / success`，Cloudflare Worker Version ID 為 `0c7fa2b7-10d9-4281-b138-ac0541307378`，部署結果為 `LIVE_VERIFIED`。獨立正式站 Playwright 驗收共 34 項，全部通過。

本次幼稚園 parent bundle 為 `a7342294896b77f9f406a35d347cb55c993b7605b6b740808729ea9e383ee064`，schema `2`。獨立 verifier 核對 1,025 張家長卡、1,759 個原有來源分組網址、962 筆年度概覽、2,720 段模型選取原文、3,973 筆收費列及 10,606 個未改動的原有 base files，結果為 `PASS`。部署沒有 D1 寫入或建立新資料庫。

清單卡片不再把所有未知情況壓成同一句提示：

- 收費會分開顯示已知小計、文件版面待覆核、沒有相符班別小計及來源生效日期；舊版文件不冒充 2027/28 已確認報價。
- 報名會優先顯示同校、同年級及目標學年的已核對申請步驟或招生公告；沒有接通當屆資料時明示「未接通」，不推算舊年份日期。
- 年度概覽會顯示通過證據門檻的學校專屬原文。正式索引中 804／1,025 張卡有這類重點，共 729 段不同原文。

仍未完成的覆蓋不能寫成齊全：只有 2 張卡有已核對的 2027/28 K1 校方申請步驟，只有 1 張卡連接 2027 校本招生事件；其餘學校不代表沒有招生，只代表平台未接通同屆具體校方證據。`human_usability_test=NOT_RUN`；JEV 選取有來源逐字核對，但尚未完成人工準確率校準。下一步是按來源、欄位、學年及校址逐項盤點幼稚園資料完整性，而不是把 962 筆年度概覽等同全港每校當屆資訊已齊。

## 2026-09-20 身份可發現性本機交付（尚未上線）

分支 `codex/identity-discovery` 以 `release/full-catalog` 的 `c9010629b3c47c3782edcab7f16d6c97a74d4674` 為基底，新增不改寫原始紀錄的 `source-identity-view-v2`。以正式站 `data_id=64a7e4fc199f3d4f028c7d08523bff5f20a327af3fb8ebe34382f0d4c069be9f` 的下載資料本機重建，1,260 筆沒有完全相同名址分組的年度紀錄分流如下：

| 狀態 | 筆數 | 公開行為 |
|---|---:|---|
| `EVIDENCE_LINKED` | 1,165 | 依校址編號，或校名、聯絡、網址、地區及地址證據建立顯示關聯；原始 ID 不合併 |
| `REVIEW_REQUIRED` | 67 | 顯示候選，不能當成人工批准身份 |
| `NO_CANDIDATE` | 28 | 保留完整原文，仍可直接搜尋及開啟 |

本機驗收：Node `24.19.0`、pnpm `10.28.0`；`pnpm typecheck`、`pnpm lint`、70 個 regression、176 個 Vitest、production Vite build、實際本機 workerd health，以及 desktop/mobile Playwright 身份搜尋 journey 全部 PASS。輸入 catalog 在全量 audit 前後 byte-equivalent；身份 projection 有獨立 manifest、hash、分流總數閘門，並由共用 production metadata build step 產生。

分支已推送並建立 PR；`LIVE_NOT_RUN`：沒有 Cloudflare production deploy 或遠端資料寫入。以上不等於 1,260 筆已逐校人工核准；67 筆候選及 28 筆無候選仍是明確的後續覆核範圍。

## 2026-09-18 stabilization baseline

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
