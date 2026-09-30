# RallyPath 雲端開發

2026-09-30 使用者決定：後續 RallyPath 程式開發與自動化驗證在受管理的雲端環境進行。唯一倉庫仍是 `demonyang885/tennis-tactics-interactive-preview`；從最新 `origin/main` 建短期分支，經 PR 與 CI 合回 `main`。

建議分工：雲端負責主要程式開發、依賴安裝與自動化測試；Mac mini 保留為真機驗收及除錯工作站，使用實際 iPhone／iPad 驗證 Safari、原生鍵盤、觸控及分享行為。

## 開工與準備

先讀 [SOURCE_OF_TRUTH.md](../../SOURCE_OF_TRUTH.md) 與 [AGENTS.md](../../AGENTS.md)，在實際 checkout 核對身份及既有工作：

```sh
pwd
git remote -v
git status --short --branch
git branch --show-current
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
```

保全未提交及未推送內容，不使用 `reset`／`clean` 覆蓋成果；確認後再從最新 `origin/main` 建立新工作分支。

建立分支時不要讓工作分支追蹤 `origin/main`。例如：

```sh
git switch --no-track -c chore/your-change origin/main
```

使用 Node 22，與 `.nvmrc` 及 GitHub CI 一致；Vite 要求 Node 22 至少為 22.12.0。

本次環境預設 Node 為 24；`.nvmrc` 只記錄要求版本，不會自動啟用已安裝的 Node 22。2026-09-30 本次環境先在執行安裝、測試及預覽的 shell 設定：

```sh
export PATH="/workspace/.tools/node22/node_modules/node/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="/workspace/.cache/ms-playwright"
node --version
```

以上是本次環境已安裝的工具與瀏覽器快取路徑。新環境須先提供 Node 22（可用支援 `.nvmrc` 的版本管理工具），再依實際安裝位置調整路徑；確認 `node --version` 為符合要求的 22.x。Playwright 安裝與測試必須使用相同 `PLAYWRIGHT_BROWSERS_PATH`，避免測試找不到已下載的 Chromium。

```sh
npm ci
npx playwright install chromium
npm run verify:release
```

Chromium 所需 Linux 系統相依套件由執行環境提供；若缺少，先依環境規則補齊，再重跑。`verify:release` 包含測試、建置及 Sites／Pages 靜態產物檢查，不會推送或部署。雲端瀏覽器回歸不能代替實體 iPhone／iPad Safari 驗收。

## 預覽

有 `sites-preview` 的環境可依 `AGENTS.md` 啟動受管理預覽。2026-09-30 此次執行環境未提供該工具，使用一般 Vite 開發伺服器：

```sh
npm run dev -- --port 5173
```

專案已設定監聽 `0.0.0.0`。透過當次環境提供的雲端瀏覽器或埠轉送檢查主要互動；不要把 `localhost`／`127.0.0.1` 網址當成使用者可開啟的雲端連結。預覽入口與伺服器程序只屬於當次工作環境。發布仍另按正式流程處理。

## 保存與交接

本次雲端 checkout 只確認已推送的 GitHub `main`，不能證明 Mac mini 的未提交或未推送工作已搬移。宣告遷移完成前，仍須在 Mac mini 原工作目錄核對分支、HEAD、工作區及未推送提交，保全並比對需要接續的成果。

已提交並推送到 GitHub 的分支是後續接續來源；不要假設雲端工作目錄、程序或預覽會永久保留。交接前保存變更，提交並推送工作分支，記錄倉庫、分支、完整 SHA、工作區狀態、PR、檢查結果與當次預覽入口；正式發布另核對 Pages 部署及線上 `version.json`。

憑證由執行環境提供，不寫入程式、文件、Git 提交或交接內容。公開 GitHub Pages 的 v0.3.0 仍使用本機畫板保存。

## 登入與同步測試站

2026-09-30 使用者追加要求：測試連結、登入與跨裝置同步。私有測試站使用平台的 ChatGPT 登入與 D1；公開 GitHub Pages 仍按正式版本規則處理。本機畫板保留為可離線編輯的副本，登入後的個人畫板庫以 D1 為持久來源。

測試站入口：[RallyPath 測試站](https://rallypath-cloud-test.fedyxxxxd.chatgpt.site)。Sites project ID 為 `appgprj_6abd9c7ffc548191adc281b46cc157c8`，後續發布沿用此站點；發布 checkout 的 `.openai/hosting.json` 保存該 ID，GitHub 仍是程式整合來源。

新增 `npm run test:cloud` 檢查帳號隔離、版本衝突、交易失敗與分塊保存；瀏覽器測試涵蓋首次同步、另一裝置讀取、備份還原、離線重試及同步衝突。變更資料表時先執行 `npm run db:generate` 並檢查新增 migration；已套用的 migration 與 metadata 保持不可變。

使用同一帳號登入手機與電腦。首次上傳明確確認；其他裝置已有修改時可保留兩份。舊公開網站的畫板可先匯出可編輯 JSON，再在測試站匯入；不同網址的瀏覽器儲存不會自動搬移。若當前畫板已開啟，另一裝置更新後依提示返回首頁重新開啟，避免將舊畫面當成最新版本。
