# RallyPath — 唯一倉庫與發布入口

最後整理：2026-10-01。這份文件用於確認來源與交接，不把歷史分支、舊預覽埠或工作目錄當作最新版。

| 項目 | 有效入口 |
| --- | --- |
| 產品名稱 | RallyPath |
| 唯一整合倉庫 | [demonyang885/tennis-tactics-interactive-preview](https://github.com/demonyang885/tennis-tactics-interactive-preview) |
| 正式分支 | `main` |
| 正式網站 | [RallyPath on GitHub Pages](https://demonyang885.github.io/tennis-tactics-interactive-preview/) |
| 線上版本核對 | [version.json](https://demonyang885.github.io/tennis-tactics-interactive-preview/version.json) 的 product、version、commit，並對照成功部署的 Actions |
| 各版變更 | [CHANGELOG.md](./CHANGELOG.md)；首頁與使用說明顯示相同發布版本 |
| 目前產品範圍與已知風險 | [v0.3 發布與後續工作](./docs/product/V0_3_CANDIDATE_AND_NEXT.md) |
| 開發規則 | [AGENTS.md](./AGENTS.md) |

倉庫網址沿用歷史 slug，產品名稱是 RallyPath。舊 `demonyang885/tennis-tactics`、preview／release／feature 分支僅供歷史查閱，不作新功能整合來源；不要因本機資料夾名稱選錯倉庫。

## 每次開工

先在實際 checkout 唯讀核對 `pwd`、`git remote -v`、`git status --short --branch`、`git branch --show-current`、`git rev-parse HEAD`；再取得最新 `origin/main`，核對未提交與未推送內容。不要以本文件所列的舊 SHA 代替當次遠端 HEAD。保全既有工作，不執行會覆蓋成果的 reset／clean。新工作從最新 main 建短期分支，經 PR 與 CI 合回同一個 main。

## 文件權威順序

1. 這份文件：唯一倉庫、正式分支、發布網址與交接入口。
2. [AGENTS.md](./AGENTS.md)：目前工程與產品約束；若日期化段落有衝突，以最新 main 的程式、測試和當次決策核對。
3. `main` 的程式、資料型別及測試：已實作行為。
4. [v0.3 發布與後續工作](./docs/product/V0_3_CANDIDATE_AND_NEXT.md)：當前範圍、限制、後續優先序。
5. [PRODUCT_VNEXT.md](./PRODUCT_VNEXT.md)、`docs/maintenance/`、`docs/archive/`：舊版規格與演進證據，不是自動待辦清單。

## 保存與發布

每次公開部署必須遞增版本，更新 `package.json`、鎖檔及 CHANGELOG；工作流在發布前核對來源與已上線版本，未遞增即停止。Issue 開始處理時須標籤、認領及回覆範圍和預計時間；驗收紀錄逐項列出環境、操作與結果。交付完成的判準是修正已進 main、公開部署成功且線上 `version.json.version` 已更新，再結案 Issue。

畫板及學習選擇目前只保存在當前瀏覽器；JSON 可編輯備份不同於 PNG／GIF／影片分享輸出。為相容舊資料，保留既有 `tennis-tactics:board-drafts:v1` 等儲存鍵；產品改名不等於存檔格式升版。

`npm run verify:release` 執行專案回歸、建置與靜態產物檢查，不會上傳。PR CI 成功不等於實體 Safari 或青少年試用通過；2026-09-30 的 v0.3 發布由產品負責人明確批准帶著這些未驗證事項進行。只有 main 的成功 Pages 部署與線上 `version.json` 能證明正式網站已更新。下一次交接應記錄倉庫、分支、完整 SHA、工作區狀態、PR、CI、部署 run、網址及剩餘風險。
