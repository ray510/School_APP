# 香港選校年鑑 HK_APP

**正式站已上線：https://schools.finpulsx.win**

全港學校名錄與三學段年度概覽，按選定官方資源版本完整收錄。沒有北區或30間學校抽樣限制；每個來源的所有原始行及欄位均可讀取。

## 已驗收正式版本

- 程式 commit：`de43efa6da11f0dd3660525626b05fd41647ec09`。
- 分支：`release/full-catalog`。
- [Full official catalog production release — run35426733829](https://github.com/ray510/HK_APP/actions/runs/35426733829)：prepare及publish成功。
- `LIVE_VERIFIED`：2026-09-19T06:32:24.233Z（香港時間14:32:24）；其後正式域名桌面／手機瀏覽器驗收成功。
- 完整驗收、來源版本、backup及限制：[PRODUCTION_LIVE_ACCEPTANCE.md](docs/PRODUCTION_LIVE_ACCEPTANCE.md)。

後續文件commit不等於重新部署程式；main尚未自動合併。

## 全量資料覆蓋

| 來源 | 原始／收錄 | 原始欄位 | 排除 |
|---|---:|---:|---:|
| 教育局學校位置及資料 | 3496／3496 | 33 | 0 |
| 幼稚園概覽2025/26繁中 | 962／962 | 104 | 0 |
| 小學概覽2025繁中 | 507／507 | 118 | 0 |
| 中學概覽2025/2026繁中 | 441／441 | 103 | 0 |

本次重新下載時間：2026-09-19T06:30Z。共5406筆來源紀錄；不是5406間獨立學校。重複校號、不同班別與特殊學校紀錄全部保留。原始名錄的3496筆可在完整名錄搜尋，全部1910筆年度概覽可在年度概覽入口搜尋。

同名同址同學段作顯示分組，不代表已認證canonical identity；地址不同的年度原文不被丟棄，而是保留獨立入口及同名相關連結。

來源完整性、學校身份認證與當屆公告覆蓋分開說明。原始CSV全量不等於每個PDF全文、所有歷年／語言副本或所有學校最新招生公告均已結構化。小學概覽2026網上版已發布，但本次CKAN最新具名CSV為2025；網站保留真實版本並連往官方最新網上版。

## 使用入口

- [全港名錄](https://schools.finpulsx.win/schools)
- [全部年度概覽](https://schools.finpulsx.win/schools?collection=annual)
- [來源及逐項覆蓋](https://schools.finpulsx.win/sources)
- [全量資料ZIP](https://schools.finpulsx.win/downloads/school-data.zip)

功能包括校名／校號／地址搜尋、地區與辦學類別篩選、同學段2–4校比較、完整原文欄位搜尋、私人清單及進度、備份匯出／確認匯入，以及有來源的招生日期和ICS。

已有15项經來源核對的招生事件，並非全港每校所有招生事件。未公布或未核實日期不推算，舊年度費用不因選新入學學年而重新標記。學校自述不當平台排名或錄取概率。

## 正式版架構

Vue3／TypeScript＋版本化Cloudflare Workers Static Assets＋read-only Worker。公開資料在瀏覽器搜尋、每個資料組JSON按需讀取。正式版不依賴試點D1、不綁D1／KV／R2、不做資料庫全量寫入，亦沒有開啟排程或更改付費方案。

資料包在發布前保存為本repo的GitHub Release資產，不再只依賴會到期的CI artifact。來源公開資料可由正式站下載；私人筆記不會包含其中。

私人清單只在IndexedDB保存，含revision衝突保護及寫入完成確認。沒有雲端同步、不收集兒童身份證明、不安裝流量追蹤。正式域名與測試域名的私人儲存互相獨立，沒有自動搬移。

## 更新與驗收

正式入口：`.github/workflows/production-release.yml`。

prepare必須完成四來源抓取、typecheck/lint/tests、全量逐行逐欄核對、真正本機workerd及桌面／手機驗收。publish先做repo release封存，再核對目標域名及Worker所有權，部署後核對HTTPS、版本與線上瀏覽器。

Token僅由GitHub Secrets注入部署step；不要貼到對話、PR、檔案或前端。正式域名唯一允許 `schools.finpulsx.win`；衝突即停止，不接管其他站點。

開發環境：Node24.x、pnpm10.28.0。主要程式：

```text
apps/web/src/full/                正式前端
apps/web/vite.production.config.ts
apps/worker/src/production.ts     read-only公開Worker
scripts/full-catalog-build.py     不抽樣的來源整合
scripts/full-catalog-verify.py    原始行／欄獨立核對
scripts/production-archive.mjs    版本化資料封存
scripts/production-deploy.mjs     僅正式子網域的發布
```

70項Node回歸、111項Vitest、4項本機production瀏覽器流程及線上瀏覽器steps已通過。未聲稱在使用者Windows實機驗收。更多指令及安全邊界見[PRODUCTION_FULL_CATALOG.md](docs/PRODUCTION_FULL_CATALOG.md)。

## 舊測試系統保留

`schools-test.finpulsx.win`及既有測試D1保持原狀；其30間配對試點、CAS／audit、SQL migration與測試文件屬獨立歷史部署，不應拿來限制正式全量讀取。

- [PILOT_LIVE_ACCEPTANCE.md](docs/PILOT_LIVE_ACCEPTANCE.md)：舊試點驗收。
- [TEST_SITE_DEPLOYMENT.md](docs/TEST_SITE_DEPLOYMENT.md)：既有D1測試部署。
- [ANNUAL_DATA_OPERATIONS.md](docs/ANNUAL_DATA_OPERATIONS.md)：原審核與D1工具。

不要以刪除原有身份核實或資料發佈保護的方式宣稱全量已核實。正式站透過完整來源展示提供資料；沒有偽造人工審核、教育局背書或未公布數據。
