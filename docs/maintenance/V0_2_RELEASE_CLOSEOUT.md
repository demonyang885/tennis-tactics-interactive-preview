# RallyPath v0.2.0 發布收尾

日期：2026-09-19。範圍僅限 v0.2.0 發布一致性、正式站核對與交接，不包含 v0.2.1、社區或小程序功能。

## 發布身份

| 項目 | 已核對結果 |
| --- | --- |
| 唯一倉庫 | `demonyang885/tennis-tactics-interactive-preview` |
| 整合／發布分支 | `main` |
| 發布提交 | `9158a2beef25c3fd346326f3fb9eece9c0100229` |
| package 版本 | `0.2.0` |
| Git tag | `v0.2.0`，指向發布提交 |
| 正式網站 | `https://demonyang885.github.io/tennis-tactics-interactive-preview/` |
| 部署證據 | Actions run `35445469313`，build 與 deploy 均成功 |
| 首次 v0.2.0 線上版本檔 | product `RallyPath`、version `0.2.0`、commit `9158a2b`、builtAt `2026-09-19T13:27:00.430Z` |

GitHub Releases 沒有獨立 release object；本版本以 tag、程式發布提交、成功 Pages 部署及線上產品版本共同識別。Tag annotation 在部署前建立，因此保留了「not yet deployed」字樣；不改寫既有 tag，以成功 Actions run 和本文件記錄最終發布事實。其後純文件 main 提交亦會觸發 Pages，可能改變 `version.json` 的 source commit，但不代表產品版本升級。v0.2.0 沒有獨立發布 PR，不能把它寫成經 PR 合併；後續變更恢復短期分支 → PR → CI → main 的流程。

## 驗證結果

- 發布前 `npm run verify:release` 通過：Playwright 132 / 132、GIF／媒體核心 6 / 6、Worker 4 / 4、Pages 3 / 3、正式建置及 runtime／內容／型別檢查通過。
- Chromium 與 WebKit 的手機／平板直橫向模擬矩陣 16 / 16 通過。
- GitHub Actions 對發布提交完成測試、建置、Pages 產物檢查與部署。
- 2026-09-19 從正式網址完成遠端 smoke check：首頁載入、進入「想下一分」畫板、返回首頁，以及戰術／練習／比賽回顧篩選均正常；未觀察到 RallyPath 頁面來源錯誤。

## 硬件驗收邊界

遠端及模擬驗證不能代替實體 iPad Safari。以下仍須在真機記錄，不應假報為已通過：

- 直向／橫向旋轉後的版面、觸控座標與頁面滾動；
- 手指／Apple Pencil 繪製與拖動、撤銷／重做及同步播放；
- 草稿重載、分類歷史、重新開啟與重複存檔；
- JSON／PNG 下載，以及 GIF／影片與原生分享；
- 系統鍵盤、合成層閃爍與記憶體壓力。

實機放行標準沿用 iPad acceptance AT-01–AT-07：AT-01–AT-06 全部通過，AT-07 無輸出失敗，且沒有資料遺失、觸控座標漂移、播放凍結或重複歷史項目。

## 交接狀態

- README、產品規格、唯一來源及收斂記錄已改為發布後事實。
- 舊 `demonyang885/tennis-tactics` 的 redirect PR #1 已合併為 `3532d99`；README 與 AGENTS 已明示該庫只作歷史查閱，不接收新功能。
- 遠端狀態不能證明 Mac mini 本機 checkout 是否乾淨；再次使用前必須先做 `remote / branch / HEAD / status` 唯讀核對。
- 審核時 main 未啟用 branch protection。若管理權限允許，應要求 PR 與 `Test and deploy RallyPath / build` 通過後才可合併。
