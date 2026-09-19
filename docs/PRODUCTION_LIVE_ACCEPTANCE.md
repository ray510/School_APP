# 正式站全量來源交付：LIVE_VERIFIED

## 實際上線

正式網址：**https://schools.finpulsx.win**。

本輪使用者明確要求正式版本與全量資料，故不再將交付限於 staging。已建立獨立 production Worker `hk-school-guide-production`；舊 `schools-test.finpulsx.win`、測試 D1 與其他站點不變。

- 已建置、驗收及部署 commit：`de43efa6da11f0dd3660525626b05fd41647ec09`。
- 工作分支：`release/full-catalog`。
- Workflow：[Full official catalog production release — 35426733829](https://github.com/ray510/HK_APP/actions/runs/35426733829)。
- prepare job `105853897540`：completed / success。
- publish job `105854151669`：completed / success。
- 部署結果：`LIVE_VERIFIED`，`2026-09-19T06:32:24.233Z`，香港時間 **2026-09-19 14:32:24**。
- 隨後線上 desktop/mobile acceptance 步驟亦成功，於 `06:33:03Z` 完成。
- 資料版本：`7b73f0d5081f4a1db2a38b9261d9980aac6202b21244a920845148465c6c938a`。

後續文件 commit 不等於重新部署程式。未自動合併 main，也沒有更改分支保護、付款方案或既有網站。

## 不是刪除警告文字，而是補齊原始來源

四個來源均於本次 CI 重新下載，擷取时间為 2026-09-19T06:30:11Z 至 06:30:29Z。逐行、逐欄獨立驗證如下：

| 官方資源版本 | 原始行數 | 正式版保留行數 | 欄位 | 排除 |
|---|---:|---:|---:|---:|
| 教育局學校位置及資料 | 3496 | 3496 | 33 | 0 |
| 幼稚園及幼稚園暨幼兒中心概覽2025/26，繁中 | 962 | 962 | 104 | 0 |
| 小學概覽2025，繁中 | 507 | 507 | 118 | 0 |
| 中學概覽2025/2026，繁中 | 441 | 441 | 103 | 0 |
| 合計 | **5406** | **5406** | 按來源保留 | **0** |

完整性狀態：`COMPLETE_SELECTED_OFFICIAL_RESOURCES`；`sample_limit=null`；`synthetic_records=0`。獨立 verifier 核對了每一個原始欄位字串，並非只比較筆數。

名錄來源行數：KG 2156、PRIMARY 616、SECONDARY 562、SPECIAL 162。原本試點排除的194筆在此資料路徑全部保留，包括32筆重複校號相關紀錄及162筆特殊學校紀錄。原始授課時間、資助類別及學段欄位沒有被預設值覆蓋。

這些是來源紀錄數，不是去重後的獨立學校總數。名錄按相同校名、地址及學段整理為2320個顯示資料組；加上年度來源後共3580個資料組。1260筆年度來源未與相同地址的名錄並列，但全部仍可搜尋及查看，不再等待人工配對才顯示。

上述並列是 presentation grouping，不偽造 canonical identity approval。原文每列仍有來源、row number、record hash，地址不同可用「其他同名來源紀錄」尋找。

## 介面實際交付

- 全港名錄：中文／英文校名、地址及校號搜尋；學段、地區、資助類別及資料集合篩選。
- 三學段所有年度概覽均可查閱，不再限北區30個配對項目。
- 每筆可查看全部原始欄位、欄位搜尋及原始字串。
- 相同學段2–4校比較，保留來源版次與未知值；數字0不當成空白。
- 私人選校筆記、進度、JSON匯出與確認後匯入；只存本機IndexedDB，transaction完成才顯示儲存成功。
- 原有15項經來源核對的公告與ICS保留，沒有推算其他日期。
- 來源覆蓋表逐份顯示原始／收錄筆數與0排除，並提供全量資料ZIP。
- 正式站開放索引；API及私人清單／比較頁另有noindex設定。沒有analytics追蹤程式。

## 已執行驗收與證據邊界

GitHub Actions Ubuntu24.04.5、Node24.20.0、pnpm10.28.0、Wrangler4.135.0。

- frozen install、四個package typecheck、ESLint：PASS。
- 現有Node回歸70項：PASS；Vitest111項：PASS。
- 四來源獨立全量逐欄核對：PASS，5406行、0排除、0合成、3592個發布檔案。
- production Vue build：PASS。
- 真正本機workerd + desktop/mobile：4 passed（11.4秒）。
- GitHub Release全量資料封存：成功。
- production hostname、DNS與Worker既有所有權衝突檢查、dry-run與實際部署：成功。
- HTTPS health回production、data ID／build ID一致：成功。
- 對正式域名的desktop/mobile Chromium流程：成功；三學段全量搜尋、詳情原文、比較、來源表、私人筆記儲存後刷新且不含筆記網絡請求、未知年份公告空狀態及JSON API404。

以上線上結果來自實際CI runner與已下載的artifact。ChatGPT web工具未能獨立載入該域名，不將此限制誤稱網站失效；也未聲稱在使用者Windows實機測試。

## 資料年份與公告範圍：不能因正式上線而造數據

完整收錄指本次所列四份官方資源版本的所有行與所有欄位，不代表全部歷年版本、全部語言副本、每個收費PDF全文或所有學校當屆公告均已結構化。

小學概覽2026網上版已發布；本次CKAN清單最新具名繁中下載CSV是2025。正式介面明示差異並連往官方最新網上版，不把2025欄位冒稱2026。其他來源亦按實際版本顯示，選2027入學不會重新標記所有歷史費用。

已核對招生事件仍是15項：10項教育局共同／有條件程序、5項粉嶺神召會幼稚園公告；不是全港每校的完整招生事件總集。此限制獨立於名錄全量覆蓋，未提供的資料顯示來源未提供，不補假數字。

## 架構、備份及回復

正式公開讀取使用版本化Workers Static Assets與無DB的read-only Worker，完整索引在瀏覽器搜尋，各資料組原文JSON按需下載。没有D1／R2／KV綁定、migration、DB建立或DB寫入；不會因全量公開資料耗盡D1寫入額度。

來源ZIP已存入私有repo之GitHub Release：

[school-data-7b73f0d5081f4a1d](https://github.com/ray510/HK_APP/releases/tag/school-data-7b73f0d5081f4a1d)

- Release ID：391940778；Asset ID：574236075。
- 資料ZIP：9,911,931 bytes。
- SHA256：`bc459b98aaff9c7e2594698cd58546b5792deb58fa5f9c234053a29802eddee8`。
- 亦可從正式站 `/downloads/school-data.zip` 下載；含四份raw CSV、全部整理JSON、manifest、來源聲明，不含私人清單或憑證。

此Release資產不受Actions artifact90日到期限制，但仍依賴repo/release被保留，不宣稱永不可刪。發布證據artifact為：

- `full-catalog-production-package`：10579416372，38,126,941 bytes，SHA256 `3d0fa9ec028efda2515ae0dbcaced19fa0650c16b55100dd55b24753ae13540c`。
- `full-catalog-production-live`：10579256784，671,374 bytes，SHA256 `4e2af4c9ba04804cf6871f5dcf56225e20e19bec2e2b695ba88b5157bc22a63c`。

部署程序保存已有Worker版本（如有），先通過資料與備份驗證才上傳。這是此production Worker首版，沒有更早production版本可聲稱已回滾演練；舊測試站仍保留供對照。回復應以保存的程式commit及完整同版資產重新部署，不需要對測試D1做任何刪除。

新正式域名與測試域名的私人筆記不自動共用；兩者保持獨立瀏覽器儲存。現有 production release 工作流程是明確觸發，沒有暗中開啟每日抓取或付費服務。
