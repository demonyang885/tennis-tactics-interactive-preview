# RallyPath — 唯一開發與發布入口

決策日期：2026-09-19。使用者選擇保留目前發布倉庫。

| 項目 | 唯一有效入口 |
|---|---|
| 產品 | RallyPath |
| Repository | [demonyang885/tennis-tactics-interactive-preview](https://github.com/demonyang885/tennis-tactics-interactive-preview) |
| 整合與正式發布分支 | `main` |
| 新開發 | 從最新 `origin/main` 建立短期 `feature/*`、`fix/*` 或 `docs/*`，透過 PR 回到 main |
| 正式網站 | https://demonyang885.github.io/tennis-tactics-interactive-preview/ |
| 線上版本 | 同網址下 `version.json`；核對 product、version、commit 與成功部署的 Actions |
| 開發規則 | [AGENTS.md](./AGENTS.md) |
| 分支審核與保留清單 | [BRANCH_AUDIT_2026-09-19.md](./docs/maintenance/BRANCH_AUDIT_2026-09-19.md) |
| 歷史證據 | [歷史索引](./docs/archive/README.md) |

## 當前基準與證據

2026-09-19 發布收尾核查時，main 為 `9158a2beef25c3fd346326f3fb9eece9c0100229`，package 與線上版本均為 0.2.0；帶註解標籤 `v0.2.0` 指向同一提交。
[Actions run 35445469313](https://github.com/demonyang885/tennis-tactics-interactive-preview/actions/runs/35445469313) 的 build 與 deploy 均成功；正式站 `version.json` 回報 product `RallyPath`、version `0.2.0`、commit `9158a2beef25c3fd346326f3fb9eece9c0100229`，builtAt `2026-09-19T13:27:00.430Z`。

這是目前可核對的發布基準；下次開發仍須重新 fetch main，不能把此 SHA 當作永久最新版本。GitHub Releases 查詢仍為空；本版本以 Git tag、main 提交、成功 Pages 部署及線上 `version.json` 共同識別。
v0.2.0 沒有獨立發布 PR；提交在未受保護的 main 上完成整合後觸發 CI 並成功部署。這是歷史事實，不應被寫成經 PR 合併。後續變更仍按本文件要求走短期分支與 PR。

## 每次開工的身份檢查

在既有 checkout 先執行以下唯讀檢查，並把結果寫入交接：

```sh
pwd
git remote -v
git status --short --branch
git branch --show-current
git rev-parse HEAD
```

確認 origin 指向本文件指定倉庫後，再執行：

```sh
git fetch origin
git rev-parse origin/main
git log -1 --format='%H %cI %s' origin/main
git log --oneline origin/main..HEAD
```

若工作區有未提交內容、remote 不對，或目前分支有尚未整合的提交，先保留並比對；不可強制 reset、clean 或直接覆寫。
2026-09-19 發布前的 Mac mini 核查記錄顯示，4176 服務工作目錄為 `/Users/clawbot/Documents/Codex/2026-09-10/app/tennis-tactics`，當時在 `release/rallypath-v0.2.0` 整理。該成果其後已固定為 `v0.2.0`、推送至 main 並部署；但遠端發布不能證明 Mac mini 目前工作區是否乾淨。再次使用該 checkout 時仍須先執行上方唯讀身份檢查。
完整收斂與發布核對分別見 [v0.2 收斂記錄](./docs/maintenance/V0_2_CONSOLIDATION.md) 及 [v0.2 發布收尾](./docs/maintenance/V0_2_RELEASE_CLOSEOUT.md)。

最省混淆的方式是建立獨立新 checkout（目標資料夾須不存在）：

```sh
git clone https://github.com/demonyang885/tennis-tactics-interactive-preview.git rallypath
cd rallypath
git switch -c feature/next-iteration origin/main
```

若沿用既有 checkout，先完成上面的身份與未保存工作核查，再從最新 origin/main 建立新分支。
不要因舊資料夾叫 tennis-tactics，就改用舊倉庫；也不要把舊 preview 分支當最新版。

## 文件與程式各自的權威範圍

1. 本文件：倉庫、分支、網站與交接入口。
2. 根目錄 AGENTS.md：目前產品約束與工程規則。
3. main 的程式、資料型別與測試：已實作行為；實際模型見 `src/board/model.ts`、`validate.ts`、`storage.ts`。
4. 日期化審核與 docs/archive：演進證據，不是下輪任務或當前發布指令。
5. PRODUCT_VNEXT.md：已更新為 v0.2 現行規格與驗收邊界；早期情境決策設計保留在 Git 歷史及封存目錄。

目前首頁以畫板為主，戰術／練習／比賽回顧分類位於下方歷史區；保持無實際編輯不建立草稿、舊瀏覽器存檔相容。
保留 `tennis-tactics:board-drafts:v1` 存檔鍵；不要只為產品改名而改動儲存鍵。
本機草稿與 JSON 可編輯備份、PNG／GIF／影片分享輸出要清楚區分；不宣稱跨裝置同步。

## 合併、發布與下一次交接

- 同倉庫 PR → main；既有 workflow 已對 PR 測試，只讓 main 部署正式 Pages。
- 發布驗證：`npm run verify:release`。實機分享與觸控仍需相應設備驗收。
- 合併前確認當次 PR 的 CI，而非沿用 9/15 的成功紀錄；合併後確認 deploy 與線上 version.json。
- 每次交接記錄 repository、branch、完整 HEAD、工作區是否乾淨、PR、測試結果、部署 run 與 URL；若只本機預覽，明確記錄其 checkout 與 SHA。
- 舊 `demonyang885/tennis-tactics` 僅供歷史查閱，不接收新功能；[redirect PR #1](https://github.com/demonyang885/tennis-tactics/pull/1) 已在 README 與 AGENTS 開頭加入唯一來源提示。舊 Pages URL 不再代表最新產品。
- v0.2.0 已發布；不要從 `release/rallypath-v0.2.0`、舊 preview 或舊 feature 分支續作，也不要為整理歷史而改寫提交或改變使用者本機存檔。
- 審核時兩邊 main 的 branches API 均回報 `protected:false`。保護規則／rulesets 未完整查核；本文件是工作約定，不代表 GitHub 已強制執行。後續可由管理員核對並設定 required CI 與禁止直接推送。

## 可直接交給下一位開發者的任務開頭

> 繼續 RallyPath。唯一倉庫是 demonyang885/tennis-tactics-interactive-preview，從最新 origin/main 建新分支。先讀 SOURCE_OF_TRUTH.md 與 AGENTS.md，回報 remote、branch、HEAD 和未提交狀態，再開始修改。tennis-tactics 舊倉庫及舊 feature／preview／release 分支只供歷史參考。
