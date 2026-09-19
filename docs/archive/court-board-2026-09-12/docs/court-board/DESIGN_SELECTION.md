> 歷史快照（2026-09-12），不是現行指令。本文的分支、部署、回滾、Mac mini 接手步驟及「尚未實作」敘述可能已過時；請從根目錄 SOURCE_OF_TRUTH.md 接手。
> 原文：[docs/court-board/DESIGN_SELECTION.md](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/5224649d49f3f1c0c49b224d65bd2bee4df91265/docs/court-board/DESIGN_SELECTION.md)。本檔只增加此警告，以下保留原文。

# Court Canvas 戰術畫板改版 · 設計交接

日期：2026-09-10。

## 使用者目標

復現 Apple App Court Canvas 的戰術畫板功能，以此作為現有戰術模組的迭代核心；UI 設計師提供三版適合青少年網球戰術與 drill 教學的主題。此前使用者已明確：drill 指場上的戰術執行訓練，並非場面配對或選擇題。

## 已交付的視覺提案

以下編號來自主對話中圖片實際顯示的先後次序。使用者已暫定主題 1，明確要求功能先跑通、主題後續再定。這些是設計稿，不是可操作的新產品版本；無需等待再次選圖。

1. `theme-1-coach.png` — 清晰教練台，常駐工具置於綠色畫板下方。
2. `theme-2-focus.png` — 夜場專注，深色大畫布與選中物件的相關工具。
3. `theme-3-notebook.png` — 戰術手冊，暖白與藍色球場，逐拍意圖及 drill 入口優先。

共同內容：斜線壓制，短球變線。球路以實線、跑位以虛線顯示，並各有文字圖例；球員、球、目標區、弧線控制點、拍次編輯與播放共同構成核心。

實作時使用現有準確的標準化球場幾何重新繪製，不將概念圖中的球場線條當作尺寸依據；尤其主題 3 的邊界／底線不可直接照抄。實作中文字与各拍球路應依正式內容逐一校對。

## 參考與核查範圍

- Apple App：[Court Canvas: Tennis Tactics](https://apps.apple.com/us/app/court-canvas-tennis-tactics/id6759590357)，開發者 Daniel Rivera。已經透過瀏覽器查看原生版官方描述及截圖，未安裝或實機操作原生 App。
- 官方網頁：[Court Canvas](https://www.courtcanvas.com/)，補充核查可見的工具與播放／匯出選單。未執行匯出。
- `apple-tactics-board-reference.png`：App Store 公開原生版截圖參考。
- `current-tactic-board.png`：現有產品的畫板與播放控制。

## 當前狀態

- 來源專案為本倉庫；功能分支 `feature/court-canvas-tactics-board` 已從提交 `5345230` 建立。
- 已保存尚未接入的 `src/board/render.ts` 和 `src/board/drills.ts`；模型與 UI 待 Mac mini 繼續，詳見根目錄 `MACMINI_HANDOFF.md`。
- 沒有部署新版或更新 main。本機預覽地址不能當作 Mac mini 預覽地址使用。
- 三張獨立圖片使用內建 ImageGen 產生，並實際附上上述兩張畫面參考。後續選圖以本文件編號為準。
- `IMPLEMENTATION.md` 記錄功能範圍與驗收；`MODEL_CONTRACT.md` 是後續已商定的資料與渲染契約。

## 後續實作優先序

可編輯畫板與曲線 → 拍次／動畫 → 戰術範本副本及自動儲存 → 訓練擺場及 drill 關聯 → 圖片與可編輯文件匯出。影片、動畫連結、原生 iCloud／Apple Pencil 等能力須清楚區分瀏覽器可實現的範圍。
