# v0.2 收斂記錄

日期：2026-09-19。範圍：使用者要求測試、整理程式與分支並固定 v0.2；沒有要求本次上傳或發布。

## 版本與來源

- 唯一整合／發布倉庫：demonyang885/tennis-tactics-interactive-preview（origin）。
- 舊來源 demonyang885/tennis-tactics（source）只供歷史查閱。
- 工作分支：release/rallypath-v0.2.0；package 0.2.0。存檔 schema 和 localStorage key 維持 v1。
- 保留本機最新功能後合入 origin/main 24fa571；再合入 docs/rallypath-source-of-truth 3b4764e。
- 合併記錄：6e7f65f（main 的 squash 發布歷史）、c3ac069（來源規則與歷史封存）。未 force、reset 或改寫既有提交。
- 本機預覽 4176；正式網站仍由 main 管理。本次沒有部署。

## 分支處置清單

| 分支／提交 | 核查結論與處置 |
| --- | --- |
| origin/main 24fa571 | v0.1 發布基準，已合入整理分支；不直接覆寫 |
| origin/release/rallypath-v0.1.0 eb0f489 | tree 與 origin/main 相同，保留發布證據，不重複合併 |
| release/rallypath-v0.1.0 3b69e86 | tree 與 origin/main 相同，已在本機歷史中；保留 |
| main 28fe1dc | 舊本機整合點，不當作遠端最新；保留 |
| feature/court-canvas-tactics-board e25a638 | 已沿歷史功能鏈整合，保留 |
| feature/immersive-board-menu-ui b6888b4 | 已整合，舊選單設計由現行圖示直接操作取代 |
| feature/home-apple-accordion-redesign b677ebf | 已整合後被畫板優先首頁取代，不恢復抽屜首頁 |
| feature/home-v3-live-playback 807d94c | 首頁動態畫板已保留 |
| feature/home-portrait-preview-converged 41a9aa7 | 豎向首頁預覽已保留 |
| feature/immersive-board-pure-view 740f018 | 對 28fe1dc 的 src/tests/scripts/package.json diff 為空，證明程式已收斂；不是待合功能 |
| feature/home-board-context-history b33dfa0 | 現行分支祖先；用途分類／歷史已保留 |
| fix/native-duration-keyboard 583d666 | 現行分支祖先；原生輸入已保留，手動秒數 UI 已淘汰 |
| feature/immersive-zones-pace 7e51e43 | 本次整理起點；場地、球速、返回和裝置相容改動已保留 |
| origin/docs/rallypath-source-of-truth 3b4764e | 已合併；舊產品規則中衝突內容更新為 v0.2 現況 |
| origin/preview/court-canvas-cad0d5f 5224649 | 舊測試发布，不覆蓋現行 UI；歷史材料已封存 |
| deploy/court-canvas-20260911-score 35ae1a2 | 舊部署 worktree 使用中；保留不刪，得分行為由現行測試驗證 |

遠端較早功能鏈的證據見 BRANCH_AUDIT_2026-09-19.md；那份是歷史審核，不替代本表。
有價值但未採納的 decorateDrillBoard／訓練預設保持待產品確認，不把舊分支整包合進來。
沒有刪除任何分支、工作樹、設計圖或使用者草稿。

舊實驗標籤 `rallypath-v0.1-control-charge`（11a6d8d）與 `rallypath-v0.1-pace-dots-preview`（0de8c1d）僅作回溯；v0.2 選定「半透明球路上移動網球、無陰影」方案，不再維護兩套球速 UI。標籤仍保留。

## 程式與測試整理

- 新跑位預設直線；舊跑位曲線不遷移。擊球曲線不受影響。
- 修復智慧續拍工具啟用時，點空白場地無法取消選取／打開拍次的問題；取消選取不破壞下一拍流程。
- 清除未使用的圖示、函式、選單狀態衍生值及不可到達的原生全屏進入流程；保留退出／資源清理邏輯。
- 移除已無入口的畫板訓練彈層；保留訓練資料與模板關聯，不恢復未完成的訓練 CTA。
- 更新舊物件選單、固定每拍 1.5 秒、舊拍次按鈕等測試；驗證現行直接操作與衍生時長。
- 讀屏提示保留，避免為視覺簡化而移除無障礙回饋。
- 增加 check:types（含 unused 檢查）、test:core、npm test、verify:release；CI 同步執行。
- 補上 0.8 秒等待後的三檔球速、原子撤銷、取消選取後繼續畫球路等回歸；手機／平板 CLI 腳本納入 scripts/qa。
- Pages 產物版本驗證讀取 package.json，不再硬編碼 0.1.0。
- 忽略本機 output／Playwright 暫存；既有 docs/design-qa、docs/product-audit-2026-09-11 未追蹤材料保持原樣，不自動提交。
- 本次收斂未修改任何受保護 runtime 檔案；相對 v0.1 的 runtime 差異來自已存在的原生輸入工作，對應 lock 檢查通過。

## 驗證結果

最終完整指令：`MOBILE_RUNTIME_TEST_PORT=4178 npm run verify:release`，退出碼 0。

| 驗證 | 結果 |
| --- | --- |
| 受保護 runtime 28 個檔案 | 通過 |
| 內容品質、TypeScript 與 unused 檢查 | 通過 |
| Playwright 模型／UI／媒體／導航回歸 | 132 / 132 通過，5.3 分鐘，單 worker、無重試 |
| GIF／媒體核心 | 6 / 6 通過 |
| 靜態 Worker 包裝與路由 | 4 / 4 通過 |
| Pages 子路徑／入口／版本產物 | 3 / 3 通過 |
| 正式建置、Git whitespace 檢查 | 通過 |
| Chromium + WebKit，各 8 組手機／平板直橫向 | 16 / 16 通過，無 pageerror、橫向溢出或抽屜超高 |

初輪失敗包含淘汰 UI 的斷言、取消選取真實問題和編輯期间 HMR 干擾；修正後以固定程式、獨立埠從頭執行上述完整命令，全部通過。
畫面已人工查看 iPhone 與 iPad 橫向截圖；模擬矩陣與限制另見 ../../COMPATIBILITY-2026-09-19.md。
仍有原有大 chunk 提示（JS 約 680kB，gzip 約 215kB），沒有隱藏 warning 或放寬測試標準。
重跑時先進入本 repo 目錄；外層 app 是工作區，不是 npm 專案。verify:release 不會上傳。

本機版本標籤為 `v0.2.0`；用 `git rev-parse v0.2.0^{commit}` 核對固定提交。
除原有未追蹤 QA 資料外，本次程式、測試與現行文件均納入版本提交。未推送 GitHub。

## 發布邊界與後續

合入 main 前走同倉庫 PR 與 CI；正式部署後核對 version.json 的 version 和 commit。
實機 Safari、系統鍵盤、原生分享、手指／Pencil 和合成層閃爍仍需真機驗收。
建置存在原有單一 JS chunk 大於 500kB 提示，不在此版本冒險拆分路由；後續可量測後專項優化。
