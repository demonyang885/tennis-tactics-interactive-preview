> 歷史快照（2026-09-12），不是現行指令。本文的分支、部署、回滾、Mac mini 接手步驟及「尚未實作」敘述可能已過時；請從根目錄 SOURCE_OF_TRUTH.md 接手。
> 原文：[MACMINI_HANDOFF.md](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/5224649d49f3f1c0c49b224d65bd2bee4df91265/MACMINI_HANDOFF.md)。本檔只增加此警告，以下保留原文。

# Mac mini 開發交接 · 2026-09-10

## 使用者最新授權

「主題可以後面再定，先跑通 Court Canvas 的復現優化迭代現有版本，初步看先主題 1。」隨後要求：「這個項目在 macmini 上去繼續，幫我轉移到 macmini。」

直接在 Mac mini 繼續實作，無需再次確認主題或重新規劃。功能先行，設計暫用 `docs/court-board/theme-1-coach.png`。產品核心是優質戰術內容及展示，以及由固定餵球到實戰對抗的戰術執行 drill。

## 專案位置與版本

- 來源：`https://github.com/demonyang885/tennis-tactics.git`
- 交接分支：`feature/court-canvas-tactics-board`
- 基線：`5345230f8cf48ae384f88b0a3b1bc4c29a06f932`，現有互動預覽版本。
- Mac mini 已有 checkout：`/Users/clawbot/Documents/Codex/2026-09-10/app/tennis-tactics`。
- 該 checkout 的 `origin` 原本指向 **preview 倉庫**，不是來源倉庫；保留它，另加來源 remote 或直接 fetch 來源 URL，再切至交接分支。先檢查並保留既有未提交工作，禁止強制 reset／覆寫。
- Mac mini 續作任務：`01a08b94-11ad-7f73-9afc-80de954f9a5e`。
- 獨立預覽：`https://demonyang885.github.io/tennis-tactics-interactive-preview/`。
- 穩定版：`https://demonyang885.github.io/tennis-tactics/`，source main 保持不變。

## 已保存與尚未完成

- `src/board/render.ts`：Canvas 球場、曲線／跑位、人物與器材、選取手柄、命中判定、PNG 匯出草稿。未接 UI，未驗證；引用的 `./model` 尚不存在，因此目前分支是開發交接快照，**不是可發佈版本**。
- `src/board/drills.ts`：三條戰術訓練路徑，各四階段，共十二個練習。匯出 `BOARD_DRILLS`、型別及 `getDrillForTactic()`；未接 UI、未編譯驗收。
- `docs/court-board/`：三張主題稿、既有產品及 App Store 參考畫面、設計說明、實作與驗收計劃、後續已約定的模型契約。
- 模型、儲存、驗證、現有戰術轉接器、編輯 UI、編輯歷史與自動保存均未實作。
- 本地 agents 已全部停止寫入，轉由 Mac mini 負責後續開發。

## 接續順序

1. 確認主機、分支、交接提交與設計資產；回報已接手，然後繼續工作。
2. 先讀本倉庫 `AGENTS.md`、`docs/court-board/MODEL_CONTRACT.md` 及 `IMPLEMENTATION.md`。實作 model / validation / storage / adapters，讓 renderer 可編譯；drill 型別保持獨立，以來源戰術 ID 關聯。
3. 在 `Prototype.tsx` / `prototype.css` 接入畫板：空白或戰術副本、拖人物、球路與跑位曲線、文字／目標／器材、拍次、連續播放、撤銷重做、草稿、自動保存、PNG 及 JSON 匯入匯出。
4. 現有單項／組合新增「在畫板中調整」入口，副本修改不覆寫正式內容。加入三條 drill 路徑的擺場與執行指引，保持下一拍連續性。
5. 驗證內容、runtime、型別建置、必要的模型測試與實際手機畫面互動，再更新使用者已授權的獨立預覽。不要把這個尚缺模型的快照推送到 preview main。

## 需保留的產品約束

- 現有 22 個戰術、8 個組合、16 個對手應變需繼續工作。不要增加帳號、評分、繁複分級或課程導航。
- 畫板文件與正式 Tactic 分離；單幀可編輯，不能套用舊 Tactic 的至少三幀限制。
- 每段結束位置接上下一段起點；觸控拖曳一次形成一次撤銷。正規化座標不得混入 CSS 像素。
- 儲存成功後才能顯示已保存；瀏覽器草稿不等於 iCloud 或跨設備同步，JSON 用於設備間續編。
- 保護 mobile runtime，不能為畫板而替換 app 容器、手機外框、鍵盤或 runtime 校驗。
- Court Canvas 原生版只核查過官方描述及截圖，未實機操作；網頁工具已觀察，匯出未實測。實作是公開功能的網頁適配，不能聲稱原生功能已全部復現。
