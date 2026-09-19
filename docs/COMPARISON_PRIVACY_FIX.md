# 比較頁 Cloudflare 注入腳本驗收

首個比較發布 run35436619751：本機12個瀏覽器測試通過，正式部署成功，但線上10通過／2失敗。兩個失敗都是測試觀察到第三方 script request，沒有刪除或放寬此斷言。

已下載 artifact10583030079，SHA256 `6a1ab2abe39e68672bf1cae107947c692b6cde3e36801fbba19ca476a2d4f419`。桌面及手機 trace 各記錄6個 `static.cloudflareinsights.com/beacon.min.js/...` request。每個response status均為-1、failureText為`csp`、沒有response body；console明確記錄`script-src 'self'`阻擋。這些是瀏覽器嘗試載入被阻擋的事件，不是JEV API呼叫。比較、展開原文及JSON匯出已走完，仍不能將整套線上驗收記為通過。

修復只針對`/compare`回應：

```text
Cache-Control: public, max-age=0, must-revalidate, no-transform
```

Cloudflare官方說明`no-transform`會阻止proxy修改原HTML及自動注入Beacon：https://developers.cloudflare.com/web-analytics/get-started/ 。保留嚴格CSP，不加入第三方script whitelist，不允許unsafe-inline。未修改整個zone、其他站點或付款方案。

瀏覽器測試新增檢查真正navigation response有no-transform、仍為self-only CSP、HTML沒有統計script。同時保留原有「零外部請求」「零非GET請求」及私人筆記不入匯出內容等斷言；相同來源判斷改用URL.origin精確比較。

修復是否在正式hostname生效，必須以新commit的實際發布及線上測試為準，不能由官方文件或本機測試直接推斷。此設定只針對比較頁，不能據此宣稱其他所有路徑都不存在edge注入。
