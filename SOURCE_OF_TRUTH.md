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

核查時 main：`24fa57112728cad53e1792fe6df15999964f6e94`，產品版本 0.1.0。
[發布 PR #1](https://github.com/demonyang885/tennis-tactics-interactive-preview/pull/1) 於 2026-09-15 squash 合併；
[Actions](https://github.com/demonyang885/tennis-tactics-interactive-preview/actions/runs/34946384862) 的 build 和 deploy 都成功。
這是當時的發布基準；下次開發必須重新 fetch main，不能硬編碼停留在此 SHA。
GitHub Releases 查詢為空，tag refs 查詢亦為空：v0.1.0 此處指 package／PR／Pages 發布，不代表已有同名 Git tag。

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
2026-09-19 本機補充核查：4176 服務工作目錄為 `/Users/clawbot/Documents/Codex/2026-09-10/app/tennis-tactics`，現已在 `release/rallypath-v0.2.0` 整理。埠號只能證明服務位置，不能證明 checkout／分支／版本。
本次保留本機未發布成果，再合入 origin/main 與文件整理分支，避免丟失已確認的操作。詳見 [v0.2 收斂記錄](./docs/maintenance/V0_2_CONSOLIDATION.md)。尚未推送／部署，公開發布基準仍是上方 v0.1。

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
- 舊 `demonyang885/tennis-tactics` 僅供歷史查閱，不接收新功能。舊 Pages URL 不再代表最新產品。
- v0.2 收斂只在本機整理與測試；不刪歷史分支、不改寫歷史、不搬站、不改受保護 runtime、不自動合入 main 或部署。
- 審核時兩邊 main 的 branches API 均回報 `protected:false`。保護規則／rulesets 未完整查核；本文件是工作約定，不代表 GitHub 已強制執行。後續可由管理員核對並設定 required CI 與禁止直接推送。

## 可直接交給下一位開發者的任務開頭

> 繼續 RallyPath。唯一倉庫是 demonyang885/tennis-tactics-interactive-preview，從最新 origin/main 建新分支。先讀 SOURCE_OF_TRUTH.md 與 AGENTS.md，回報 remote、branch、HEAD 和未提交狀態，再開始修改。tennis-tactics 舊倉庫及舊 feature／preview／release 分支只供歷史參考。
