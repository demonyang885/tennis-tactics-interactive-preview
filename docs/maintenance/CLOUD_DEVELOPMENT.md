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

憑證由執行環境提供，不寫入程式、文件、Git 提交或交接內容。雲端開發不會改變產品目前僅存於使用者瀏覽器的畫板保存方式。
