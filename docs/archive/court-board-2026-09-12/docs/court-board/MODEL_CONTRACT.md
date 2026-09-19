> 歷史快照（2026-09-12），不是現行指令。本文的分支、部署、回滾、Mac mini 接手步驟及「尚未實作」敘述可能已過時；請從根目錄 SOURCE_OF_TRUTH.md 接手。
> 原文：[docs/court-board/MODEL_CONTRACT.md](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/5224649d49f3f1c0c49b224d65bd2bee4df91265/docs/court-board/MODEL_CONTRACT.md)。本檔只增加此警告，以下保留原文。

# 畫板模型與渲染契約

2026-09-10：開發 agents 已約定以下契約，尚未實作模型。這是 IMPLEMENTATION.md 早期示意結構的後續收斂版，與已保存的 render.ts 相配。

```ts
type Point = [number, number]; // normalized, [-0.15, 1.15]
type BoardActor = { id: string; label: string; kind: 'player' | 'ball'; color?: string };
type BoardPath = {
  id: string; kind: 'shot' | 'move' | 'feed'; actorId: string;
  from: Point; to: Point; control?: Point;
};
type BoardMark = {
  id: string; kind: 'target' | 'cone' | 'basket' | 'text' | 'freehand';
  position: Point; size?: Point; text?: string; points?: Point[];
};
type BoardFrame = {
  id: string; label: string; duration: number; // seconds
  poses: Record<string, Point>; paths: BoardPath[]; marks: BoardMark[];
};
type BoardDocument = {
  version: 1; id: string; title: string; sourceTacticId?: string; updatedAt: string;
  actors: BoardActor[]; frames: BoardFrame[]; drillId?: string;
};
```

每幀代表該階段的 outgoing 動作片段。每 actor 至多一條動作路徑，from 等於該幀 actor 起點，下一幀 poses 等於前幀結束位置。修改命令採 immutable 更新與 continuity reflow，最多 60 幀，所有座標有限且有邊界。freehand points 是絕對場地座標，移動標示時同步平移；target size 是以 position 為中心的寬高。

## 模型預定 exports

```ts
newBoardId(prefix?)
createBlankBoard(title?)
cloneBoard(board, title?)
getFrameEnd(frame) // Record<string, Point>
getFramePose(frame, progress01) // Record<string, Point>, required by renderer
getBoardDuration(board)
getBoardPose(board, elapsedSeconds) // { frameIndex, progress, poses }
moveActor(board, frameIndex, actorId, point)
setPath(board, frameIndex, path)
updatePath(board, frameIndex, pathId, patch)
deletePath(board, frameIndex, pathId)
addFrame(board, afterIndex, duplicate?)
deleteFrame(board, frameIndex)
updateFrame(board, frameIndex, { label?, duration? })
addMark(board, frameIndex, mark)
updateMark(board, frameIndex, markId, patch)
deleteMark(board, frameIndex, markId)
addActor(board, actor, point)
deleteActor(board, actorId)
renameBoard(board, title)
```

`adapters.ts` 提供 `boardFromTactic(tactic)` 與 `boardFromTactics(tactics, title)`，轉為新文件副本；保留既有時序，拼接時維持連續站位。

儲存與驗證建議統一 `BoardResult<T> = {ok:true,value:T} | {ok:false,error:string}`，提供 `validateBoardDocument`、`parseBoardJSON`、`readBoards`、`saveBoard`、`deleteBoard`。驗證版本／ID／引用／有限數值／大小與數量上限，不接受任意 JSON。保存例外需真實回報；不要為了顯示成功而吞錯。

## 已保存 renderer API

實際簽名請以 `src/board/render.ts` 為準：

```ts
type BoardSelection = { kind: 'actor' | 'element'; id: string };
type BoardHit = BoardSelection | { kind: 'handle'; id: string; handle: 'from' | 'to' | 'control' };
getBoardGeometry(width, height) // court + toCanvas/fromCanvas/clampPoint
pointOnBoardPath(path, progress)
renderBoard(ctx, width, height, frame, actors, options?)
hitTestBoard(pixel, width, height, frame, actors, selection?)
exportBoardPng(board, frameIndex = 0) // Promise<Blob>
```

父 UI 設定 Canvas DPR transform，renderer 使用 CSS pixel 尺寸。options 含 progress、playingProgress、playing、selection、showLegend。播放時隱藏控制柄；PNG 包含標題與圖例。球路 lime 實線、跑位淡藍虛線，球場準確比例 23.77 / 10.97；不照抄概念圖的球場尺寸錯誤。

## Drill 內容

`drills.ts` 已包含 `defend-high-middle`、`approach-follow`、`three-cross-one-line` 三條路徑，每條有 fixed-feed / next-ball / variable-feed / live-points 四階段。使用該檔已定義的 `DrillGuide` 與 `DrillStage`，避免在 model 複製型別。次數是教練可調整的起點，不是固定通關閾值；打完保持下一拍準備。
