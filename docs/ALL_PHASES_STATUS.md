# 原始開發階段對照

更新：2026-09-18。此檔不使用沒有驗收證據的完成百分比。

| 原始階段 | 狀態 | 已完成／仍缺 |
|---|---|---|
| Phase 0：盤點及來源核實 | PASS（列明限制） | 四個來源有實際 raw／contract 結果；跨來源人工審核另列 |
| Phase 1：骨架與本機底層 | PASS（Linux CI） | 實際 fresh install、migrations、fixture、JSON404、build及瀏覽器驗收；Windows實機未跑 |
| Phase 2：三學段名錄比較 | IN_PROGRESS | 搜尋／詳情／比較／年度 parser及證據 UI已實作；全量身份與年度內容未完成核實 |
| Phase 3：私人清單與事件 | IN_PROGRESS | 私人流程、備份、日曆、ICS、事件審核匯入已實作；真實公告及更廣測試未完成 |
| Phase 4：營運成本與安全 | IN_PROGRESS | 本機原子發佈回滾、guard及offline preflight已實作；遠端角色／archive／帳戶成本未完成 |
| Phase 5：Staging | NOT_RUN | 無雲端部署 |
| Phase 6：Production | NOT_RUN | 無正式部署及發布授權 |

詳見 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)。以前「130+ 測試」「0 any」「全部就緒」等概括說法，不能代替指定 commit 的實際測試日誌。
