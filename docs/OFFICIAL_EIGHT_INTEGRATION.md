# 八项官方來源：接入、版本、驗收及發布

新增 A02 註冊（基本註冊、校舍及房間容額三XML）、A06 幼稚園教育計劃、A07 非計劃K1收生安排、A08 K1–K3空缺、A09 直資名單與費用兩CSV、A10 資助一條龍、A11 小一校網、A12 升中校網。所有擷取皆為公開官方資料，沒有AI或私人資料。

## 真實來源格式

2026-09-19擷取11份資源。A02為12164註冊、5838校舍、43315房間紀錄；A06為722、A07為29、A08為708、A09名單79及費用163、A10為31、A11為36、A12為392筆，合計63477來源行，不是學校總數。

XML中文名可缺漏，顯示同一行英文名，不丟棄紀錄。A06實際為UTF-16及tab分隔，標頭有引號內中英文換行。A09費用末欄已逐行確認全空但仍保留原值；DSS名單有一筆未重列校名的學費減免URL，保留UNIDENTIFIED_SOURCE_ROW，不借用前一行身份。

A02不包括官立學校，也不等於一般學校名錄。課室與宿舍容額分開，不加總為學額或剩餘名額。約114.8MB的容量XML完整下載並封存，網站以GZIP提供原始檔、分片按需載入原文，不會每位訪客自動下載整個XML。

A06、A09目錄資源版本為2025/26；A07為2026/27收生、2025/26非計劃基準。A08所示2026/27版內容截至2026-09-08，不是即時剩餘名額。A10為2026/27；A11/A12沒有明示學年則保留未知。擷取日期不取代資料版本。

## 關聯規則

學校及校址編號須再核對校名與學段。校舍代碼不作校址編號；房間資料只在學校層級展示。A06中英文校名、地區及唯一校址一致才支持機構關聯，否則顯示待核對候選，不更新原有分類。A09費用按同學年、名單編號、完整校名及學段連接直資清單已核對紀錄；宿費与學費分開。

A10保留官方組別與備註，只涵蓋資助學校。A12所屬網與服務網(Y)分開，數字、校名及學段需共同核對才能支持機構關聯。A11只有官方地圖入口，不宣稱多邊形、家居定位或自動資格判定。未配對紀錄仍全部可查。

## 入口

- `/official-data`：八來源、各資源角色、地區及文字搜尋。
- `/vacancies`：K1/K2/K3及Y/N/P/NA，附截至日期。
- `/school-nets`：小一校網及官方地圖；`/official-data?source=A12`：所屬及服務網。
- `/official-data?source=A10`：一條龍組別。
- `/sources#additional-official-sources`：版本、欄位、筆數、下載及hash。
- 學校詳情及比較新增官方來源，不用JEV改寫數字或分類。

## 執行

```powershell
python -m unittest discover -s tests/official_sources -v
# 新的官方原始擷取，輸出新snapshot，不能覆蓋舊snapshot
python -m scripts.official_sources.pipeline capture --out artifacts/official-eight-new
# 或從明確取得的capture artifact驗證
python -m scripts.official_sources.from_capture --input captured-eight --out artifacts/official-eight
# 完成新前端建置與既有基底還原後
python -m scripts.official_sources.pipeline build --input artifacts/official-eight --dist apps/web/dist-production
python scripts/reproducible-official-package.py
python -m scripts.official_sources.verify
```

每400行一組summary/raw shard，展開才讀原文。所有資產與ZIP小於24MiB；任何必要來源失敗均不發布部分資料。ZIP固定headers及captured timestamp支援相同輸入的重播。基底data_id與新增bundle_id分開，原四來源5406筆、JEV十主題、3580既有ID及私人清單不變。

## 正式流程與證據邊界

`.github/workflows/official-eight-release.yml`：frozen安裝、型別/lint/測試、65個合成契約回歸、真實原始解析及逐欄核對、本機workerd桌面手機、GitHub Release封存、既有單host部署器、獨立bundle與code SHA核對、正式瀏覽器驗收。

僅部署step注入Cloudflare secret；無新D1、R2、AI請求或付款方案修改。正式更新只針對schools.finpulsx.win。Release `school-official-<bundle前16碼>`不覆蓋不同hash；CI artifact保留90日，不代表永久備份。回滾以既有Worker及對應靜態版本，不刪資料庫。

本文件描述實作與本次原始擷取，**不代表正式部署已成功**。實際commit/run/線上測試記錄見後續交付紀錄。完整僅指所選資源版本全部紀錄，不代表所有歷年語言檔或全部招生公告。
