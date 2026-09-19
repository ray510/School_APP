# 八項官方來源：正式交付與線上驗收（2026-09-19）

## 現況：程式已提交、真實資料已下载、正式站已更新

本次回覆前重新核對 repo，八來源實作及發布已完成，不再是較早的本機候選接入包。為避免重複寫入或重新計費，本次核對沒有再次部署或呼叫 JEV；已下載正式發布 artifact，核對來源雜湊及線上證據，並提交本交付紀錄。

- 工作分支：`release/full-catalog`。沒有合併 `main`。
- 已部署程式：`6043973ddfbed78376eb41adb6d7ed37502aedfa`。
- 發布：[Eight official school sources production release / 35450856763](https://github.com/ray510/HK_APP/actions/runs/35450856763)。
- prepare job `105917635533`、publish job `105918498108`：均為 success。
- 正式站：[schools.finpulsx.win](https://schools.finpulsx.win)。
- Worker：`hk-school-guide-production`，版本 `18c9ad32-e8cb-4a63-b708-b4e10daf46f3`。
- HTTPS／原有資料：`LIVE_VERIFIED`，`2026-09-19T15:15:44.495Z`。
- 新八來源資料與程式版本：`LIVE_DATA_VERIFIED`，`2026-09-19T15:15:44.696Z`，香港時間 **23:15:44**。
- 獨立正式域名 desktop/mobile Chromium：**24 passed**，`2026-09-19T15:18:35Z` 完成，香港時間 **23:18:35**。

本文件的 commit 是後續交付記錄，不是另一個已部署程式版本。`OFFICIAL_EIGHT_INTEGRATION.md` 的實作說明與本文件的實際發布結果應一併閱讀。

## 已取得的八項來源：11份原始資源

原始擷取 run：`35449352225`；artifact `10586098769`，`official-eight-full-raw`。原始資料擷取時間為2026-09-19約14:34–14:41 UTC。發布流程使用這份明確版本，不以打包或部署時間代替原始擷取日期。

| 來源 | 資源角色 | 原始／已發布來源紀錄 | 所用版次及限制 |
|---|---|---:|---|
| A02 學校註冊 | 基本註冊 XML | 12,164 / 12,164 | 來源未明示學年；不涵蓋官立學校 |
| A02 學校註冊 | 校舍 XML | 5,838 / 5,838 | 校舍代碼不等於校址編號 |
| A02 學校註冊 | 課室／宿舍容額 XML | 43,315 / 43,315 | 不加總為學額或剩餘學位 |
| A06 幼稚園教育計劃名單 | 名單 | 722 / 722 | 所選目錄版本2025/26 |
| A07 非計劃幼稚園K1收生安排 | 名單及措施 | 29 / 29 | 2026/27收生、2025/26非計劃基準；兩個學年分開 |
| A08 K1–K3學位空缺 | 空缺狀態 | 708 / 708 | 2026/27；內容截至2026-09-08，非即時名額 |
| A09 直資資料 | 學校名單 | 79 / 79 | 2025/26；含一筆未重列校名的URL來源行，不稱為79間學校 |
| A09 直資資料 | 學費等資料 | 163 / 163 | 2025/26；按級別／班級，宿費另列 |
| A10 一條龍名單 | 學校及組別 | 31 / 31 | 2026/27，15組；只涵蓋資助學校 |
| A11 小一校網 | 校網及官方地圖入口 | 36 / 36 | 未明示學年則保持未知；不是地圖邊界幾何資料 |
| A12 升中校網 | 學校所屬及服務網 | 392 / 392 | 未明示學年則保持未知 |
| **合計** | **8資料集、11資源** | **63,477 / 63,477** | **排除0、合成0** |

63,477是來源行數，包括房間、校舍、不同班別／級別及其他註冊教育提供者，不是獨立學校總數。完整僅指本次所選資源版本的所有行與原始欄位，不代表所有歷年語言版本、當屆招生公告或逐校身份皆已核准。

A06實際為UTF-16、tab分隔及含換行的中英文標頭；解析器按真實格式處理。A02原文可能只有英文校名，保留該行英文名而不丟棄。A09名單中的無名URL行保留為未識別紀錄；不任意沿用上一行的學校身份。費用原始尾端空欄亦保留。

## 網站入口與實際功能

- [官方選校資料](https://schools.finpulsx.win/official-data)：八項來源、資源角色、地區、文字搜尋、分頁、原始欄位及證據。
- [K1–K3空缺](https://schools.finpulsx.win/vacancies)：按K1/K2/K3及Y/N/P/NA篩選，顯示來源學年與截至日期。
- [小一校網](https://schools.finpulsx.win/school-nets)：校網涵蓋地區及官方地圖入口。
- [升中校網](https://schools.finpulsx.win/official-data?source=A12)：所屬網與服務其他網分開。
- [一條龍學校](https://schools.finpulsx.win/official-data?source=A10)：官方組別及備註。
- [來源中心新增區](https://schools.finpulsx.win/sources#additional-official-sources)：版本、欄位、筆數、原始下載與hash。
- 學校詳情加入官方補充來源面板；比較頁加入官方資料比較，不取代原有JEV與年度概覽比較。

空缺解讀：Y為有學位空缺，N為沒有空缺，P為正處理候補名單，NA為沒有相關資料。這些不是空缺數量；不能改成「剩餘若干位」，亦不能將2026/27改標為2027/28。

A11只提供官方地圖入口；本輪沒有新增校網多邊形、住址定位或入學資格判定。未發現於A06名單不能自動判定沒有參加。查不到A02的官立學校不能標示未註冊。容額不等於餘額，註冊／計劃／收生參與是不同維度。

## 用戶先前比較的三間幼稚園

原有網址及收藏ID保持不變：

| 原有資料組 | A08來源及配對結果 | A06補充來源配對 |
|---|---|---|
| `school_2468a6d82a2fad7b858cd5b6` 上水惠州幼稚園（分校） | 校號158208／校址0001，EVIDENCE_LINKED | 2025/26名單候選，REVIEW_REQUIRED |
| `school_b579ecbc45cca6d4f62c20c9` 上水禮賢會幼稚園 | 校號157406／校址0001，EVIDENCE_LINKED | 2025/26名單，EVIDENCE_LINKED |
| `school_7f49a973a6708cfc096def61` 中華基督教青年會上水幼稚園 | 校號575429／校址0001，EVIDENCE_LINKED | 2025/26名單候選，REVIEW_REQUIRED |

三校在本次A08來源中，K1/K2/K3均標Y，**只代表截至2026-09-08的2026/27資料**，不保證現在仍有空缺或2027/28招生安排。原始註冊、概覽及JEV資料保留。A06未充分確定的配對仍展示為待核對候選，不冒充已確認的新年度計劃身份；亦不否定原有歷史概覽中的計劃記載。

## 關聯及完整性驗證

新增來源行的處理狀態：EVIDENCE_LINKED 39,705、REVIEW_REQUIRED 774、AMBIGUOUS 4、UNMATCHED 22,994，合計63,477。2,819個既有顯示組有證據關聯；3,075個有關聯或候選。未配對不代表被排除，全部仍可由來源瀏覽器查阅。

跨檔檢查：沒有找不到校舍的容額紀錄、沒有找不到註冊紀錄的校舍，各為0。不同來源識別碼不混用；配對規則保留校名、學段、校號、校址及佐證要求。不是人工逐校認證。

原始四來源5,406筆、1,910份年度概覽、3,580個既有顯示組ID及十主題JEV保持不變。基底保存檢查為7,167個檔案。新增資料独立存放於 `/official/<bundle_id>/`，每400行分片，按需載入完整原文。約114.8MB的原始容額XML以GZIP下載，不要求每位訪客自動下載整個檔案；最大單一網站資產12,145,686 bytes。

- 原有 `data_id`：`64a7e4fc199f3d4f028c7d08523bff5f20a327af3fb8ebe34382f0d4c069be9f`
- 新 `bundle_id`：`9baffc8f961ceebaf166ebb5e09e92eb4d53003e91bc84d016cd5d1b6cb8d851`
- 原有JEV `analysis_id`：`f899688be79afa733476823b6bfe156dc1ef9048d8c2ac336ea63270df5d5f60`
- 公開指標：`/official-manifest.json`；資料下載：`/downloads/official-eight.zip`。

## 真正執行的測試

GitHub Actions Ubuntu24.04.5、Node24.20.0、pnpm10.28.0、Wrangler4.135.0：

| 檢查 | 結果 |
|---|---|
| frozen install、TypeScript、ESLint | PASS |
| Node回歸 | 70 passed |
| Vitest | 161 passed，12個檔案 |
| 八來源Python契約及真實格式回歸 | 65 passed |
| 真實11資源解析、來源行及分片逐欄核對 | 63,477筆，0排除、0合成 |
| 原始四來源及舊JEV資料保留 | PASS |
| 本機workerd桌面／手機 | 24 passed，2.8分鐘 |
| 正式域名桌面／手機 | 24 passed，2.5分鐘 |
| 正式程式SHA、新bundle及原資料版本 | LIVE_DATA_VERIFIED |

65項Python測試屬契約／格式測試；不能单靠它們聲稱真實資料已驗收，真實全量核對及瀏覽器測試為另外步驟。本輪未重跑模型，所以沒有新的JEV準確率結論。

本次回覆另外下載兩個發布artifact，驗證ZIP digest；從正式資料ZIP抽取11份原檔並核對manifest SHA256，全部吻合，並核對用戶三個原ID的A06/A08來源紀錄。此聊天執行環境直接連正式域名時遇到DNS解析失敗，沒有把這項失敗寫成成功；線上功能證據是已成功連接正式域名的GitHub Actions測試及截圖，不是使用者Windows實機測試。

## 備份及回滾範圍

新完整資料已封存於 [school-official-9baffc8f961ceeba](https://github.com/ray510/HK_APP/releases/tag/school-official-9baffc8f961ceeba)：release392112482、asset574978899。

- ZIP大小：12,626,898 bytes。
- 最終可重現ZIP SHA256：`8143978ba9b4a3c5a5b4f49b1425612066a1bb4867cba2cee2f5ebc333c3a8c2`。
- 包含11份原始XML／CSV、metadata、manifest及全部正規化來源紀錄。
- 最初build-report中ZIP經重新可重現打包前的hash不是最終下載hash；以verification、manifest及Release的上列最終hash為準。

本輪CI artifact：

| Artifact | ID | bytes | SHA256 |
|---|---:|---:|---|
| official-eight-production-1 | 10587380247 | 180,340,840 | fd40e016b9bc07f6b2e45e10437f23d56f4ade42b7056e09b5f764c305d7b34d |
| official-eight-live-1 | 10586483997 | 50,402,263 | 406afe3b002c456e3b334dd8be54436dc6dc833ddf06465ee8665f65a27050e9 |

CI附件到期2026-12-18T15:08:09Z；GitHub Release另行保留，但不是不可刪除的永久備份。前一Worker版本 `bf427a3e-18c9-4735-82ec-871f2e215f22` 已記錄供必要時回滾；本輪沒有執行回滾演練或删除資料。

發布只更新既有 `schools.finpulsx.win` Worker與静態檔案；D1寫入0、新DB0、新JEV呼叫0。沒有修改finpulsx.win主站、其他子網域、付款方案、排程或main；私人筆記仍只在瀏覽器。
