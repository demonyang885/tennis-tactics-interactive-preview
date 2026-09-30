# RallyPath

RallyPath 是給青少年使用的網球戰術畫板：先畫出自己記得的一分，再看其他打法或技能示範，帶著具體問題回到球場。

**版本：v0.3.0。** 正式網站：[開啟 RallyPath](https://demonyang885.github.io/tennis-tactics-interactive-preview/)；[核對線上版本](https://demonyang885.github.io/tennis-tactics-interactive-preview/version.json)。網站由本倉庫 `main` 的 GitHub Pages 工作流發布。倉庫網址中的舊名稱是歷史路徑；產品名稱為 RallyPath。

## 這版可以做什麼

- 在同一塊直向畫板上畫球路、跑位與連續回合，播放並保存個人畫板。
- 從自己的畫板打開分類戰術庫，查看打法示範；純查看不會新增個人草稿。
- 選擇六項既有技能之一，觀看第一階畫板示範，按「練這個」返回原畫板。選擇與畫板綁定，刷新或重開後仍可找回。
- 在畫板上放文字備註；使用可編輯備份轉移畫板。首頁與知識庫共用最新畫板顯示方式。

## 保存與已知限制

公開 v0.3.0 的畫板和學習選擇自動保存在**目前瀏覽器**，不是雲端帳號或跨裝置同步。換裝置前請先匯出可編輯備份；PNG、GIF、影片不是可編輯備份。瀏覽器儲存空間損壞、清除網站資料或跨分頁同時編輯，仍有資料風險。

登入與跨裝置同步正在獨立私有測試站驗證：用同一個 ChatGPT 帳號登入後，可將本機畫板與練習記錄同步到個人畫板庫。首次上傳需明確操作；兩端都有修改時保留兩份，JSON 畫板與完整畫板庫備份皆可匯入。公開 GitHub Pages 的 v0.3.0 仍使用上述本機保存方式。

v0.3.0 已通過自動化與 GitHub CI；產品負責人批准直接發布，**尚未完成實體 iPhone／iPad Safari 及青少年獨立使用驗收**。這兩項後續工作分別追蹤在 [#7](https://github.com/demonyang885/tennis-tactics-interactive-preview/issues/7) 與 [#8](https://github.com/demonyang885/tennis-tactics-interactive-preview/issues/8)。詳細範圍與限制見 [v0.3 發布與後續工作](./docs/product/V0_3_CANDIDATE_AND_NEXT.md)。

## 文件入口

- [唯一倉庫與開發交接](./SOURCE_OF_TRUTH.md)
- [v0.3 發布範圍、風險及下一步](./docs/product/V0_3_CANDIDATE_AND_NEXT.md)
- [v0.2 功能基準（歷史）](./PRODUCT_VNEXT.md)
- [舊版整理與發布記錄](./docs/maintenance/V0_2_RELEASE_CLOSEOUT.md)

`docs/archive/`、日期化相容性報告與 v0.2 文件是歷史證據，不是現行開發待辦。新開發從本倉庫最新 `main` 建短期分支，透過 PR 合回；不要從舊 preview、release 或其他倉庫續作。

## 開發

後續 RallyPath 程式開發與自動化驗證在受管理的雲端環境進行；準備、預覽與交接流程見 [雲端開發](./docs/maintenance/CLOUD_DEVELOPMENT.md)。使用 Node 22（至少 22.12.0），與 CI 及 `.nvmrc` 一致；安裝依賴前先按雲端文件啟用 Node 22 並設定 Playwright 快取路徑，`.nvmrc` 不會自動切換執行環境。

```sh
npm ci
npm run dev -- --port 5173
```

完整測試與建置：`npm run verify:release`。這個命令不會推送或部署。戰術內容供理解與討論，不保證得分，也不取代教練的現場指導。
