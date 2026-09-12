import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { BoardDocument, Point } from "../src/board/model";
import { pointOnBoardPath } from "../src/board/render";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";

async function press(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.click();
}

async function waitForFlowSettled(page: Page) {
  await expect(page.getByTestId("flow-current")).toHaveCount(1);
  await expect.poll(async () => page.getByTestId("flow-current").evaluate((element) => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.abs(transform.m41);
  })).toBeLessThan(1);
}

async function openBoard(page: Page) {
  await press(page.getByRole("button", { name: /战术画板.*画球路/ }));
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await waitForFlowSettled(page);
}

async function openBlankBoard(page: Page) {
  await openBoard(page);
  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "新建纯空白画板" }));
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
}

function editorDock(page: Page) {
  return page.locator(".board-edit-dock");
}

function objectButton(page: Page) {
  return editorDock(page).getByRole("button", { name: "对象", exact: true });
}

function addButton(page: Page) {
  return editorDock(page).getByRole("button", { name: "添加", exact: true });
}

function playButton(page: Page) {
  return editorDock(page).getByRole("button", { name: /^播放战术/ });
}

async function expectObjectState(page: Page) {
  await expect(objectButton(page)).toHaveAttribute("aria-pressed", "true");
}

async function openAddPalette(page: Page) {
  await press(addButton(page));
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

async function chooseAddItem(page: Page, name: RegExp) {
  const sheet = await openAddPalette(page);
  await press(sheet.getByRole("button", { name }));
  await expect(sheet).toBeHidden();
}

async function boardScreenPoint(board: Locator, point: Point, localOffset: Point = [0, 0]) {
  return board.evaluate((element, input) => {
    const rect = element.getBoundingClientRect();
    const width = element.clientWidth;
    const height = element.clientHeight;
    const ratio = 23.77 / 10.97;
    const availableHeight = Math.max(1, height - 52 - 42);
    const courtHeight = Math.max(1, Math.min(availableHeight, (width - 40) * ratio));
    const courtWidth = courtHeight / ratio;
    const courtX = (width - courtWidth) / 2;
    const courtY = 52 + (availableHeight - courtHeight) / 2;
    const localX = courtX + input.point[0] * courtWidth + input.localOffset[0];
    const localY = courtY + input.point[1] * courtHeight + input.localOffset[1];
    return {
      x: rect.left + localX * rect.width / width,
      y: rect.top + localY * rect.height / height,
      scale: rect.width / width,
    };
  }, { point, localOffset });
}

async function clickBoardPoint(page: Page, board: Locator, point: Point) {
  const at = await boardScreenPoint(board, point);
  await page.mouse.click(at.x, at.y);
}

async function dragBoardPoint(page: Page, board: Locator, from: Point, to: Point, localOffset: Point = [0, 0]) {
  const start = await boardScreenPoint(board, from, localOffset);
  const end = await boardScreenPoint(board, to, localOffset);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function countReadablePathPixelsNearBoardPoints(
  board: Locator,
  points: Point[],
  kind: "shot" | "move",
) {
  return board.locator("canvas").evaluate((canvas, input) => {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Board canvas has no 2D context");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = 23.77 / 10.97;
    const availableHeight = Math.max(1, height - 52 - 42);
    const courtHeight = Math.max(1, Math.min(availableHeight, (width - 40) * ratio));
    const courtWidth = courtHeight / ratio;
    const courtX = (width - courtWidth) / 2;
    const courtY = 52 + (availableHeight - courtHeight) / 2;
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    const courtRgb = [40, 104, 75] as const;
    const luminance = (red: number, green: number, blue: number) => {
      const channels = [red, green, blue].map((value) => {
        const channel = value / 255;
        return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const courtLuminance = luminance(...courtRgb);
    const radius = 8;
    return input.points.map((boardPoint) => {
      const left = Math.max(0, Math.floor((courtX + boardPoint[0] * courtWidth - radius) * scaleX));
      const top = Math.max(0, Math.floor((courtY + boardPoint[1] * courtHeight - radius) * scaleY));
      const sampleWidth = Math.min(canvas.width - left, Math.ceil(radius * 2 * scaleX));
      const sampleHeight = Math.min(canvas.height - top, Math.ceil(radius * 2 * scaleY));
      const pixels = context.getImageData(left, top, sampleWidth, sampleHeight).data;
      let matches = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const pixelLuminance = luminance(red, green, blue);
        const contrast = (Math.max(pixelLuminance, courtLuminance) + .05)
          / (Math.min(pixelLuminance, courtLuminance) + .05);
        const matchesPathHue = input.kind === "shot"
          ? green > red && green - blue > 35
          : blue > green && blue - red > 35;
        if (matchesPathHue && contrast >= 3) matches += 1;
      }
      // Normalize the backing-store count so the assertion is stable at DPR 1, 2, or 3.
      return matches / (scaleX * scaleY);
    });
  }, { points, kind });
}

async function expectPathClearlyVisible(
  board: Locator,
  path: { from: Point; to: Point; control?: Point },
  kind: "shot" | "move",
  message: string,
) {
  const samples = [.2, .38, .64, .82].map((progress) => pointOnBoardPath(path, progress));
  await expect.poll(async () => {
    const counts = await countReadablePathPixelsNearBoardPoints(board, samples, kind);
    return counts.filter((count) => count >= 4).length;
  }, { message }).toBeGreaterThanOrEqual(3);
}

async function readLatest(page: Page): Promise<BoardDocument> {
  return page.evaluate((key) => {
    const stored = window.localStorage.getItem(key);
    if (!stored) throw new Error("No saved tactical board");
    const parsed = JSON.parse(stored) as { boards: BoardDocument[] };
    return parsed.boards.slice().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  }, STORAGE_KEY);
}

async function saveAndRead(page: Page): Promise<BoardDocument> {
  await press(page.locator(".board-save-status"));
  await expect(page.locator(".board-save-status")).toContainText("已保存");
  return readLatest(page);
}

function actorPoint(board: BoardDocument, label: string, frameIndex = 0): Point {
  const actor = board.actors.find((candidate) => candidate.label === label);
  if (!actor) throw new Error(`Missing ${label} actor`);
  const point = board.frames[frameIndex]?.poses[actor.id];
  if (!point) throw new Error(`Missing ${label} pose in frame ${frameIndex + 1}`);
  return point;
}

async function openFrameEditor(page: Page, frameNumber: number) {
  const filesTrigger = page.getByRole("button", { name: /打开.*的文件选项/ });
  await press(filesTrigger);
  const sheet = page.getByTestId("bottom-sheet");
  await press(sheet.getByRole("button", { name: /拍次历史/ }));
  await expect(sheet.getByRole("heading", { name: "拍次历史", exact: true })).toBeVisible();
  await press(sheet.getByRole("button", { name: new RegExp(`^编辑第 ${frameNumber} 拍`) }));
  await expect(sheet.getByRole("heading", { name: `第 ${frameNumber} 拍`, exact: true })).toBeVisible();
  return sheet;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "网球战术" })).toBeVisible();
});

test("uses the three-control hierarchy and keeps advanced object recovery available", async ({ page }) => {
  await openBoard(page);
  const dock = editorDock(page);
  const objects = objectButton(page);
  const add = addButton(page);
  const play = playButton(page);

  await expect(dock).toBeVisible();
  await expect(objects).toBeVisible();
  await expect(add).toBeVisible();
  await expect(play).toBeVisible();
  await expect(play).toContainText(/0\s*拍/);
  await expect(play).toContainText(/0\.0\s*秒/);
  await expect(play).toBeDisabled();
  await expect(dock.getByRole("button", { name: /^(选择|球员|球路|跑位|标记)$/ })).toHaveCount(0);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新增一拍/ })).toHaveCount(0);
  await expect(page.locator(".board-interaction-guide")).toContainText(
    /拖出发球线路.*从网球按住.*发球落点/,
  );

  await press(objects);
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet.getByRole("button", { name: "选择我方", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "选择对手", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "选择网球", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(objects).toBeFocused();

  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  const opponentStart = actorPoint(initial, "对手");
  await dragBoardPoint(page, board, opponentStart, [.68, .28]);
  let saved = await saveAndRead(page);
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(.68, 1);
  expect(saved.frames[0].poses[opponent.id][1]).toBeCloseTo(.28, 1);
  expect(saved.actors).toHaveLength(3);

  await press(page.getByRole("button", { name: "返回画板列表" }));
  await waitForFlowSettled(page);
  await openBoard(page);
  saved = await saveAndRead(page);
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(.68, 1);
});

test("authors a smart rally as shot, receiver movement, then the next shot", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  const ball = initial.actors.find((actor) => actor.kind === "ball")!;
  const opponent = initial.actors.find((actor) => actor.label === "对手")!;
  const me = initial.actors.find((actor) => actor.label === "我方")!;
  const ballStart = actorPoint(initial, "网球");
  const opponentStart = actorPoint(initial, "对手");
  expect(initial.frames).toHaveLength(1);
  expect(Math.hypot(ballStart[0] - actorPoint(initial, "我方")[0], ballStart[1] - actorPoint(initial, "我方")[1])).toBeLessThan(.03);

  // Even though the ball overlaps the server, the armed ball starts the serve
  // with zero setup clicks rather than moving the player underneath it.
  await dragBoardPoint(page, board, ballStart, [.70, .25]);
  await expect(page.getByText(/第 1 拍球路已记录.*接球方跑位.*同步/)).toBeVisible();
  let saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths).toHaveLength(1);
  expect(saved.frames[0].paths[0]).toMatchObject({ kind: "shot", actorId: ball.id });
  expect(saved.frames[1].paths).toEqual([]);
  expect(saved.frames[1].poses[ball.id][0]).toBeCloseTo(.70, 1);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  await dragBoardPoint(page, board, opponentStart, [.66, .34]);
  await expect(page.getByText(/跑位已与上一条球路同步.*网球拖出下一拍/)).toBeVisible();
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[1].paths).toEqual([]);
  expect(saved.frames[1].poses[opponent.id][0]).toBeCloseTo(.66, 1);
  expect(saved.frames[1].poses[opponent.id][1]).toBeCloseTo(.34, 1);
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);

  await dragBoardPoint(page, board, [.70, .25], [.32, .75]);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  expect(saved.frames[1].paths.find((path) => path.kind === "shot")?.actorId).toBe(ball.id);
  expect(saved.frames[2].paths).toEqual([]);
  expect(saved.frames[2].poses[ball.id][0]).toBeCloseTo(.32, 1);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动我方跑位/);

  const nextReceiverMove = saved.frames[2].paths.find((path) => path.kind === "move");
  expect(nextReceiverMove).toBeUndefined();
  expect(me.id).not.toBe(opponent.id);
});

test("adjusts the just-drawn shot curve without leaving the smart rally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  const ballStart = actorPoint(initial, "网球");
  const receiverStart = actorPoint(initial, "对手");

  await dragBoardPoint(page, canvas, ballStart, [.70, .25]);
  let saved = await saveAndRead(page);
  const originalShot = saved.frames[0].paths.find((path) => path.kind === "shot")!;
  expect(originalShot.control).toBeDefined();
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  await press(page.getByRole("button", { name: "调整上一条球路弧度" }));
  await expect(page.locator(".board-interaction-guide")).toContainText(/调整上一条击球路线.*白色菱形/);
  const adjustedControl: Point = [.34, .54];
  await dragBoardPoint(page, canvas, originalShot.control!, adjustedControl);

  saved = await saveAndRead(page);
  const adjustedShot = saved.frames[0].paths.find((path) => path.id === originalShot.id)!;
  expect(adjustedShot.from).toEqual(originalShot.from);
  expect(adjustedShot.to).toEqual(originalShot.to);
  expect(adjustedShot.control?.[0]).toBeCloseTo(adjustedControl[0], 1);
  expect(adjustedShot.control?.[1]).toBeCloseTo(adjustedControl[1], 1);
  expect(saved.frames[1].paths).toEqual([]);
  expect(saved.smartRally).toMatchObject({ frameId: saved.frames[1].id, phase: "move" });

  await press(page.getByRole("button", { name: "撤销", exact: true }));
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.find((path) => path.id === originalShot.id)?.control).toEqual(originalShot.control);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  await press(page.getByRole("button", { name: "重做", exact: true }));
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.find((path) => path.id === originalShot.id)?.control?.[0]).toBeCloseTo(adjustedControl[0], 1);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  await press(page.getByRole("button", { name: "调整上一条球路弧度" }));
  await press(page.locator(".board-interaction-guide").getByRole("button", { name: "继续", exact: true }));
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);
  await dragBoardPoint(page, canvas, receiverStart, [.66, .34]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.id === originalShot.id)?.control?.[0]).toBeCloseTo(adjustedControl[0], 1);
});

test("turns a straight completed shot into a curve by dragging its midpoint handle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, canvas, actorPoint(initial, "网球"), [.70, .25]);

  await press(page.getByRole("button", { name: "调整上一条球路弧度" }));
  await press(page.getByRole("button", { name: "精确调整击球路线" }));
  const objectSheet = page.getByRole("dialog", { name: "击球路线" });
  await press(objectSheet.getByRole("button", { name: "改为直线", exact: true }));
  await press(objectSheet.getByRole("button", { name: "关闭对象调整" }));
  await expect(objectSheet).toBeHidden();
  let saved = await saveAndRead(page);
  const straightShot = saved.frames[0].paths.find((path) => path.kind === "shot")!;
  expect(straightShot.control).toBeUndefined();

  const midpoint: Point = [
    (straightShot.from[0] + straightShot.to[0]) / 2,
    (straightShot.from[1] + straightShot.to[1]) / 2,
  ];
  const adjustedControl: Point = [midpoint[0] - .12, midpoint[1] - .07];
  await dragBoardPoint(page, canvas, midpoint, adjustedControl);
  saved = await saveAndRead(page);
  const curvedShot = saved.frames[0].paths.find((path) => path.id === straightShot.id)!;
  expect(curvedShot.control?.[0]).toBeCloseTo(adjustedControl[0], 1);
  expect(curvedShot.control?.[1]).toBeCloseTo(adjustedControl[1], 1);
  expect(saved.smartRally).toMatchObject({ frameId: saved.frames[1].id, phase: "move" });
  await expect(page.locator(".board-interaction-guide")).toContainText(/调整上一条击球路线/);
});

test("deleting the just-completed shot returns to a ready serve gesture", async ({ page }) => {
  await openBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, canvas, actorPoint(initial, "网球"), [.70, .25]);
  await press(page.getByRole("button", { name: "调整上一条球路弧度" }));
  await press(page.getByRole("button", { name: "精确调整击球路线" }));
  const objectSheet = page.getByRole("dialog", { name: "击球路线" });
  await press(objectSheet.getByRole("button", { name: "仅从第 1 拍删除击球路线" }));
  await expect(objectSheet).toBeHidden();

  let saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  expect(saved.frames).toHaveLength(1);
  expect(saved.frames[0].paths).toEqual([]);
  expect(saved.smartRally).toMatchObject({ frameId: saved.frames[0].id, phase: "shot", actorId: ball.id });
  await expect(page.locator(".board-interaction-guide")).toContainText(/拖出发球线路/);

  await dragBoardPoint(page, canvas, saved.frames[0].poses[ball.id], [.32, .24]);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.find((path) => path.kind === "shot")?.to[0]).toBeCloseTo(.32, 1);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);
});

test("places an added mark over the visible previous route without selecting that route", async ({ page }) => {
  await openBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, canvas, actorPoint(initial, "网球"), [.70, .25]);
  const afterShot = await saveAndRead(page);
  const shot = afterShot.frames[0].paths.find((path) => path.kind === "shot")!;
  const onRoute = pointOnBoardPath(shot, .5);

  const palette = await openAddPalette(page);
  await press(palette.getByRole("button", { name: /^标记与器材/ }));
  await press(palette.getByRole("button", { name: /^目标区/ }));
  await expect(palette).toBeHidden();
  await clickBoardPoint(page, canvas, onRoute);

  const saved = await saveAndRead(page);
  expect(saved.frames[0].paths).toEqual(afterShot.frames[0].paths);
  expect(saved.frames[1].marks).toHaveLength(1);
  expect(saved.frames[1].marks[0]).toMatchObject({ kind: "target" });
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  const files = page.getByTestId("bottom-sheet");
  await press(files.getByRole("button", { name: /分享战术动画/ }));
  const share = page.getByRole("dialog", { name: "分享战术动画" });
  await expect(share.getByRole("button", { name: /视频.*推荐/ })).toContainText("3.0 秒");
  await expect(share.getByRole("button", { name: /循环 GIF/ })).toContainText("3.0 秒");
});

test("keeps the armed actor draggable when the ball and receiver share a point", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  const ball = initial.actors.find((actor) => actor.kind === "ball")!;
  const opponent = initial.actors.find((actor) => actor.label === "对手")!;
  const ballStart = initial.frames[0].poses[ball.id];
  const receiverPoint = initial.frames[0].poses[opponent.id];

  // A realistic serve often ends exactly on the receiver. The guided actor
  // must win this ambiguous hit target on both the movement and return steps.
  await dragBoardPoint(page, board, ballStart, receiverPoint);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  await dragBoardPoint(page, board, receiverPoint, [.66, .34]);
  await expect(page.getByText(/跑位已与上一条球路同步.*网球拖出下一拍/)).toBeVisible();
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);
  let saved = await saveAndRead(page);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[1].paths).toEqual([]);

  await dragBoardPoint(page, board, receiverPoint, [.32, .75]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动我方跑位/);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  expect(saved.frames[1].paths.find((path) => path.kind === "shot")?.actorId).toBe(ball.id);
  expect(saved.frames[2].paths).toEqual([]);
});

test("keeps the last full beat's shot and movement clearly visible on a 390px court", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  const from = actorPoint(initial, "网球");
  const receiverStart = actorPoint(initial, "对手");
  const to: Point = [.70, .25];
  await dragBoardPoint(page, canvas, from, to);

  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  let saved = await saveAndRead(page);
  const serve = saved.frames[0].paths.find((path) => path.kind === "shot");
  expect(serve, "the completed serve remains in the authored frame").toBeDefined();
  expect(saved.frames[1].paths, "the automatically-created receiver frame starts empty").toEqual([]);
  await expectPathClearlyVisible(
    canvas,
    serve!,
    "shot",
    "the completed serve must remain clearly visible, at 3:1 or better, while receiver movement is armed",
  );

  await dragBoardPoint(page, canvas, receiverStart, [.66, .34]);
  await expect(page.getByText(/跑位已与上一条球路同步.*网球拖出下一拍/)).toBeVisible();
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);
  saved = await saveAndRead(page);
  const receiverMove = saved.frames[0].paths.find((path) => path.kind === "move");
  expect(receiverMove, "the receiver movement is synchronized with the incoming serve").toBeDefined();
  expect(saved.frames[1].paths, "the return frame stays empty until its outgoing shot is drawn").toEqual([]);
  await expectPathClearlyVisible(canvas, serve!, "shot", "the incoming serve stays clearly visible after receiver movement");
  await expectPathClearlyVisible(canvas, receiverMove!, "move", "the receiver movement is clearly visible with the incoming serve");

  await dragBoardPoint(page, canvas, [.70, .25], [.32, .75]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动我方跑位/);
  saved = await saveAndRead(page);
  const returnShot = saved.frames[1].paths.find((path) => path.kind === "shot");
  expect(returnShot, "the completed return remains in the prior full beat").toBeDefined();
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  expect(saved.frames[2].paths, "visual context must not be duplicated into the new frame data").toEqual([]);
  await expectPathClearlyVisible(canvas, returnShot!, "shot", "the prior beat's return remains clearly visible on the new beat");
});

test("undo and redo treat a shot plus its automatic empty successor as one action", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, board, actorPoint(initial, "网球"), [.70, .25]);
  await dragBoardPoint(page, board, actorPoint(initial, "对手"), [.66, .34]);
  await dragBoardPoint(page, board, [.70, .25], [.32, .75]);

  let saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[2].paths).toEqual([]);

  const undo = page.getByRole("button", { name: "撤销", exact: true });
  const redo = page.getByRole("button", { name: "重做", exact: true });
  await press(undo);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths).toEqual([]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);

  await press(redo);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  expect(saved.frames[2].paths).toEqual([]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动我方跑位/);
});

test("can select the ball directly to skip receiver movement", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  const ball = initial.actors.find((actor) => actor.kind === "ball")!;

  await dragBoardPoint(page, board, actorPoint(initial, "网球"), [.70, .25]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);
  await dragBoardPoint(page, board, [.70, .25], [.36, .72]);

  const saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[1].paths).toHaveLength(1);
  expect(saved.frames[1].paths[0]).toMatchObject({ kind: "shot", actorId: ball.id });
  expect(saved.frames[2].paths).toEqual([]);
});

test("synchronizes an extra player move before the armed receiver is skipped", async ({ page }) => {
  await openBlankBoard(page);
  const play = playButton(page);
  const board = page.getByTestId("board-canvas");
  const meStart: Point = [.62, .82];
  const opponentStart: Point = [.46, .18];
  const ballStart: Point = [.34, .72];
  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, board, meStart);
  await chooseAddItem(page, /^对手球员/);
  await clickBoardPoint(page, board, opponentStart);
  await chooseAddItem(page, /^网球/);
  await clickBoardPoint(page, board, ballStart);

  const initial = await saveAndRead(page);
  const ball = initial.actors.find((actor) => actor.kind === "ball")!;
  const me = initial.actors.find((actor) => actor.label === "我方")!;
  const opponent = initial.actors.find((actor) => actor.label === "对手")!;
  const firstLanding: Point = [.70, .25];

  await dragBoardPoint(page, board, ballStart, firstLanding);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  // Move the non-armed player first. It still belongs to the incoming serve
  // beat, while the smart flow must continue waiting for the receiver.
  await dragBoardPoint(page, board, meStart, [.52, .68]);

  let saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: me.id });
  expect(saved.frames[1].paths).toEqual([]);
  expect(saved.smartRally).toMatchObject({
    frameId: saved.frames[1].id,
    phase: "move",
    hitterId: opponent.id,
    actorId: opponent.id,
  });
  await expect(play).toContainText(/1\s*拍/);
  await expect(play).toContainText(/1\.5\s*秒/);

  // Selecting the ball skips the still-armed receiver move. The already
  // synchronized extra movement must not leak into the outgoing return beat.
  await dragBoardPoint(page, board, firstLanding, [.32, .75]);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: me.id });
  expect(saved.frames[1].paths).toHaveLength(1);
  expect(saved.frames[1].paths[0]).toMatchObject({ kind: "shot", actorId: ball.id });
  expect(saved.frames[1].paths.some((path) => path.kind === "move")).toBe(false);
  expect(saved.frames[2].paths).toEqual([]);
});

test("undo restores the smart move tool after a conflicting receiver route falls back to manual", async ({ page }) => {
  await page.evaluate((key) => {
    const draft: BoardDocument = {
      version: 1,
      id: "conflicting-smart-move",
      title: "冲突跑位草稿",
      updatedAt: new Date().toISOString(),
      actors: [
        { id: "me", label: "我方", kind: "player", color: "#3e8ad6" },
        { id: "opponent", label: "对手", kind: "player", color: "#dc4151" },
        { id: "ball", label: "网球", kind: "ball", color: "#d8ef72" },
      ],
      frames: [
        {
          id: "incoming-beat",
          label: "第 1 拍",
          duration: 1.5,
          poses: { me: [.64, .98], opponent: [.30, .07], ball: [.64, .96] },
          paths: [
            { id: "incoming-shot", kind: "shot", actorId: "ball", from: [.64, .96], to: [.70, .25] },
            { id: "existing-receiver-move", kind: "move", actorId: "opponent", from: [.30, .07], to: [.56, .18] },
          ],
          marks: [],
        },
        {
          id: "smart-move-tail",
          label: "第 2 拍",
          duration: 1.5,
          poses: { me: [.64, .98], opponent: [.56, .18], ball: [.70, .25] },
          paths: [],
          marks: [],
        },
      ],
      smartRally: {
        version: 2,
        frameId: "smart-move-tail",
        phase: "move",
        hitterId: "opponent",
        actorId: "opponent",
      },
    };
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [draft] }));
  }, STORAGE_KEY);
  await page.reload();
  await openBoard(page);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);

  const board = page.getByTestId("board-canvas");
  await dragBoardPoint(page, board, [.56, .18], [.66, .34]);
  await expect(page.getByText(/上一拍已有这位球员的路线.*切换为手动编辑/)).toBeVisible();

  let saved = await saveAndRead(page);
  expect(saved.smartRally).toBeUndefined();
  expect(saved.frames[0].paths.find((path) => path.id === "existing-receiver-move")).toBeDefined();
  expect(saved.frames[1].paths).toContainEqual(expect.objectContaining({ kind: "move", actorId: "opponent" }));

  await press(page.getByRole("button", { name: "撤销", exact: true }));
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);
  saved = await saveAndRead(page);
  expect(saved.smartRally).toMatchObject({
    version: 2,
    frameId: "smart-move-tail",
    phase: "move",
    hitterId: "opponent",
    actorId: "opponent",
  });
  expect(saved.frames[1].paths).toEqual([]);
});

test("preserves the sixtieth shot and saves a valid manual board when smart continuation hits the frame cap", async ({ page }) => {
  await page.evaluate((key) => {
    const ballPoints: Point[] = [[.35, .75], [.65, .25]];
    const frames: BoardDocument["frames"] = Array.from({ length: 60 }, (_, index) => {
      const from = ballPoints[index % 2];
      const to = ballPoints[(index + 1) % 2];
      return {
        id: `frame-${index + 1}`,
        label: `第 ${index + 1} 拍`,
        duration: 1.5,
        poses: { me: [.62, .82], opponent: [.46, .18], ball: from },
        paths: index < 59
          ? [{ id: `shot-${index + 1}`, kind: "shot", actorId: "ball", from, to }]
          : [],
        marks: [],
      };
    });
    const draft: BoardDocument = {
      version: 1,
      id: "smart-rally-at-frame-cap",
      title: "六十拍上限草稿",
      updatedAt: new Date().toISOString(),
      actors: [
        { id: "me", label: "我方", kind: "player", color: "#3e8ad6" },
        { id: "opponent", label: "对手", kind: "player", color: "#dc4151" },
        { id: "ball", label: "网球", kind: "ball", color: "#d8ef72" },
      ],
      frames,
      smartRally: {
        version: 2,
        frameId: "frame-60",
        phase: "shot",
        hitterId: "opponent",
        actorId: "ball",
      },
    };
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [draft] }));
  }, STORAGE_KEY);
  await page.reload();
  await openBoard(page);
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);

  const board = page.getByTestId("board-canvas");
  const finalLanding: Point = [.28, .72];
  await dragBoardPoint(page, board, [.65, .25], finalLanding);
  await expect(page.getByText(/畫板最多 60 拍.*球路已保留.*已切换为手动编辑/)).toBeVisible();

  const saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(60);
  expect(saved.smartRally).toBeUndefined();
  expect(saved.frames[59].paths).toHaveLength(1);
  expect(saved.frames[59].paths[0]).toMatchObject({
    kind: "shot",
    actorId: "ball",
    from: [.65, .25],
  });
  expect(saved.frames[59].paths[0].to[0]).toBeCloseTo(finalLanding[0], 2);
  expect(saved.frames[59].paths[0].to[1]).toBeCloseTo(finalLanding[1], 2);
});

test("keeps manual blank and multiple-ball boards on the safe fallback path", async ({ page }) => {
  test.slow();
  await openBlankBoard(page);
  const board = page.getByTestId("board-canvas");
  await expect(page.locator(".board-interaction-guide")).toContainText(/点选场上对象开始/);

  const palette = await openAddPalette(page);
  for (const label of [/^我方球员/, /^对手球员/, /^网球/, /^画球路/, /^画跑位/, /^标记与器材/]) {
    await expect(palette.getByRole("button", { name: label })).toBeVisible();
  }
  await press(palette.getByRole("button", { name: /^标记与器材/ }));
  await expect(palette.getByRole("heading", { name: "标记与器材" })).toBeVisible();
  for (const label of [/^目标区/, /^标志碟/, /^球筐/, /^文字提示/, /^自由笔/, /^喂球路线/]) {
    await expect(palette.getByRole("button", { name: label })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(addButton(page)).toBeFocused();

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, board, [.62, .82]);
  await expectObjectState(page);
  let saved = await saveAndRead(page);
  expect(saved.actors).toHaveLength(1);
  const player = saved.actors[0];
  await dragBoardPoint(page, board, [.62, .82], [.42, .64]);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(1);
  expect(saved.actors).toHaveLength(1);
  expect(saved.frames[0].poses[player.id][0]).toBeCloseTo(.42, 1);

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, board, [.70, .72]);
  await press(objectButton(page));
  const objects = page.getByTestId("bottom-sheet");
  await expect(objects.getByText("我方 1/2", { exact: true })).toBeVisible();
  await expect(objects.getByText("我方 2/2", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await press(page.getByRole("button", { name: "返回画板列表" }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "新建战术画板", exact: true }));
  await waitForFlowSettled(page);
  const standard = page.getByTestId("board-canvas");
  await chooseAddItem(page, /^网球/);
  await clickBoardPoint(page, standard, [.78, .72]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/已选中网球 2\/2/);

  const addSheet = await openAddPalette(page);
  const drawRoute = addSheet.getByRole("button", { name: /^画球路/ });
  await expect(drawRoute).toBeEnabled();
  await press(drawRoute);
  await expect(addSheet).toBeHidden();
  await expect(page.locator(".board-interaction-guide")).toContainText(/按住网球拖到落点.*球路曲线/);
  await dragBoardPoint(page, standard, [.78, .72], [.78, .28]);
  saved = await saveAndRead(page);
  const balls = saved.actors.filter((actor) => actor.kind === "ball");
  expect(balls).toHaveLength(2);
  expect(saved.frames).toHaveLength(1);
  expect(saved.frames[0].paths).toHaveLength(1);
  expect(saved.frames[0].paths[0].actorId).toBe(balls[1].id);
});

test("restores the guided tool after an extra player is deleted from a blank board", async ({ page }) => {
  await openBlankBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const ballStart: Point = [.34, .72];

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, canvas, [.62, .82]);
  await chooseAddItem(page, /^对手球员/);
  await clickBoardPoint(page, canvas, [.46, .18]);
  await chooseAddItem(page, /^网球/);
  await clickBoardPoint(page, canvas, ballStart);
  await expect(page.locator(".board-interaction-guide")).toContainText(/拖出发球线路/);

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, canvas, [.80, .68]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/已选中我方 2\/2/);
  await press(page.getByRole("button", { name: "调整我方 2/2" }));
  const sheet = page.getByTestId("bottom-sheet");
  await press(sheet.getByRole("button", { name: "从整套战术所有拍次删除我方 2/2" }));
  await expect(sheet).toBeHidden();
  await expect(page.locator(".board-interaction-guide")).toContainText(/拖出发球线路.*从网球按住/);

  await dragBoardPoint(page, canvas, ballStart, [.70, .25]);
  const saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  expect(saved.actors.filter((actor) => actor.kind === "player")).toHaveLength(2);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths).toContainEqual(expect.objectContaining({ kind: "shot", actorId: ball.id }));
  expect(saved.smartRally).toMatchObject({ frameId: saved.frames[1].id, phase: "move" });
});

test("a pure blank board preserves consecutive ball routes as atomic rally beats", async ({ page }) => {
  test.slow();
  await openBlankBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const meStart: Point = [.62, .82];
  const opponentStart: Point = [.46, .18];
  const ballStart: Point = [.34, .72];
  const firstLanding: Point = [.70, .25];
  const opponentEnd: Point = [.66, .34];
  const secondLanding: Point = [.32, .75];

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, canvas, meStart);
  await chooseAddItem(page, /^对手球员/);
  await clickBoardPoint(page, canvas, opponentStart);
  await chooseAddItem(page, /^网球/);
  await clickBoardPoint(page, canvas, ballStart);
  await expect(page.locator(".board-interaction-guide")).toContainText(/拖出发球线路/);

  let saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.authoringMode).toBe("blank-rally");
  expect(saved.smartRally).toMatchObject({ phase: "shot", actorId: ball.id });

  await dragBoardPoint(page, canvas, ballStart, firstLanding);
  saved = await saveAndRead(page);
  const firstRoute = saved.frames[0].paths.find((path) => path.kind === "shot");
  expect(firstRoute).toMatchObject({ actorId: ball.id });
  expect(firstRoute?.to[0]).toBeCloseTo(firstLanding[0], 5);
  expect(firstRoute?.to[1]).toBeCloseTo(firstLanding[1], 5);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[1].poses[ball.id][0]).toBeCloseTo(firstLanding[0], 5);
  expect(saved.frames[1].poses[ball.id][1]).toBeCloseTo(firstLanding[1], 5);
  expect(saved.frames[1].paths).toEqual([]);
  await expectPathClearlyVisible(canvas, firstRoute!, "shot", "the pure blank board must keep its first route visible on the next beat");

  await dragBoardPoint(page, canvas, opponentStart, opponentEnd);
  await expect(page.getByText(/跑位已与上一条球路同步.*网球拖出下一拍/)).toBeVisible();
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);
  await dragBoardPoint(page, canvas, firstLanding, secondLanding);

  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths).toContainEqual(firstRoute);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  const secondRoute = saved.frames[1].paths.find((path) => path.kind === "shot");
  expect(secondRoute).toMatchObject({ actorId: ball.id });
  expect(secondRoute?.from[0]).toBeCloseTo(firstLanding[0], 5);
  expect(secondRoute?.from[1]).toBeCloseTo(firstLanding[1], 5);
  expect(secondRoute?.to[0]).toBeCloseTo(secondLanding[0], 5);
  expect(secondRoute?.to[1]).toBeCloseTo(secondLanding[1], 5);
  expect(saved.frames[2].poses[ball.id][0]).toBeCloseTo(secondLanding[0], 5);
  expect(saved.frames[2].poses[ball.id][1]).toBeCloseTo(secondLanding[1], 5);

  await press(page.getByRole("button", { name: "撤销", exact: true }));
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths).toContainEqual(firstRoute);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths).toEqual([]);
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);
});

test("reopens a legacy default blank draft and repairs its missing continuation", async ({ page }) => {
  const firstLanding: Point = [.70, .25];
  await page.evaluate(({ key, landing }) => {
    const legacy: BoardDocument = {
      version: 1,
      id: "legacy-default-blank",
      title: "我的空白战术",
      updatedAt: new Date().toISOString(),
      actors: [
        { id: "me", label: "我方", kind: "player", color: "#3e8ad6" },
        { id: "opponent", label: "对手", kind: "player", color: "#dc4151" },
        { id: "ball", label: "网球", kind: "ball", color: "#d8ef72" },
      ],
      frames: [{
        id: "legacy-frame-1",
        label: "起始站位",
        duration: 1.5,
        poses: { me: [.62, .82], opponent: [.46, .18], ball: [.34, .72] },
        paths: [{ id: "legacy-shot-1", kind: "shot", actorId: "ball", from: [.34, .72], to: landing }],
        marks: [],
      }],
    };
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [legacy] }));
  }, { key: STORAGE_KEY, landing: firstLanding });
  await page.reload();
  await openBoard(page);

  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);
  let saved = await saveAndRead(page);
  expect(saved.authoringMode).toBe("blank-rally");
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths).toHaveLength(1);
  expect(saved.frames[1].poses.ball).toEqual(firstLanding);
  expect(saved.smartRally).toMatchObject({
    frameId: saved.frames[1].id,
    phase: "move",
    hitterId: "opponent",
    actorId: "opponent",
  });

  // The repaired stage must survive the real reopen path before authoring the
  // receiver movement and second shot.
  await page.reload();
  await openBoard(page);
  await expect(page.locator(".board-interaction-guide")).toContainText(/现在拖动对手跑位/);
  const canvas = page.getByTestId("board-canvas");
  await dragBoardPoint(page, canvas, [.46, .18], [.66, .34]);
  await expect(page.getByText(/跑位已与上一条球路同步.*网球拖出下一拍/)).toBeVisible();
  await expect(page.locator(".board-interaction-guide")).toContainText(/从网球拖出下一拍/);
  await dragBoardPoint(page, canvas, firstLanding, [.32, .75]);

  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths).toContainEqual({
    id: "legacy-shot-1",
    kind: "shot",
    actorId: "ball",
    from: [.34, .72],
    to: firstLanding,
  });
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: "opponent" });
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  expect(saved.frames[2].paths).toEqual([]);
  expect(saved.frames[2].poses.ball[0]).toBeCloseTo(.32, 5);
  expect(saved.frames[2].poses.ball[1]).toBeCloseTo(.75, 5);
});

test("playback counts a synchronized opening shot and receiver movement as one beat", async ({ page }) => {
  await openBoard(page);
  const play = playButton(page);
  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  const opponent = initial.actors.find((actor) => actor.label === "对手")!;

  await dragBoardPoint(page, board, actorPoint(initial, "网球"), [.70, .25]);
  await dragBoardPoint(page, board, actorPoint(initial, "对手"), [.66, .34]);
  await expect(page.getByText(/跑位已与上一条球路同步.*网球拖出下一拍/)).toBeVisible();

  const saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[1].paths).toEqual([]);
  await expect(play).toBeEnabled();
  await expect(play).toContainText(/1\s*拍/);
  await expect(play).toContainText(/1\.5\s*秒/);
});

test("playback ignores the automatic trailing empty frame and manages edge focus", async ({ page }) => {
  await openBoard(page);
  const play = playButton(page);
  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, board, actorPoint(initial, "网球"), [.70, .25]);
  await dragBoardPoint(page, board, actorPoint(initial, "对手"), [.66, .34]);
  await dragBoardPoint(page, board, [.70, .25], [.32, .75]);

  const saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[2].paths).toEqual([]);
  await expect(play).toBeEnabled();
  await expect(play).toContainText(/2\s*拍/);
  await expect(play).toContainText(/3\.0\s*秒/);

  await press(play);
  const playback = page.getByTestId("board-playback-dock");
  const pause = playback.getByRole("button", { name: "暂停", exact: true });
  await expect(pause).toBeFocused();
  await press(pause);
  await playback.getByRole("slider", { name: "画板播放进度" }).fill("0");
  const previous = playback.getByRole("button", { name: "上一拍", exact: true });
  const next = playback.getByRole("button", { name: "下一拍", exact: true });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await press(next);
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();

  await press(page.getByRole("button", { name: "完成 · 回到编辑" }));
  await expect(page.locator(".board-editor")).toHaveClass(/is-editing/);
  await expect(page.getByTestId("board-canvas")).toBeFocused();
});

test("opens advanced frame history from files and edits a selected frame", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, board, actorPoint(initial, "网球"), [.70, .25]);
  const before = await saveAndRead(page);
  expect(before.frames).toHaveLength(2);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);

  const sheet = await openFrameEditor(page, 1);
  const duration = sheet.locator('.board-field input[inputmode="decimal"]');
  await expect(duration).toHaveValue("1.5");
  await duration.fill("2.5");
  await press(sheet.getByRole("button", { name: "完成", exact: true }));
  await expect(sheet).toBeHidden();

  const saved = await saveAndRead(page);
  expect(saved.frames[0].duration).toBe(2.5);
  expect(saved.frames[1].paths).toEqual([]);

  const secondFrame = await openFrameEditor(page, 2);
  await expect(secondFrame.locator('.board-field input[inputmode="decimal"]')).toHaveValue("2.5");
  await press(secondFrame.getByRole("button", { name: "取消编辑拍次", exact: true }));
  await expect(secondFrame).toBeHidden();
});

test("scaled direct manipulation keeps grab offset, ignores jitter, and records one undo", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
  await page.reload();
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  const undo = page.getByRole("button", { name: "撤销" });
  const initial = await saveAndRead(page);
  const actorStart = actorPoint(initial, "对手");
  await press(objectButton(page));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: "选择对手", exact: true }));
  await expect(page.locator(".board-interaction-guide")).toContainText("已选中对手");
  const center = await boardScreenPoint(board, actorStart);
  expect(center.scale).toBeLessThan(1);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 4, center.y);
  await page.mouse.up();
  await expect(undo).toBeDisabled();
  await expect(page.locator(".board-interaction-guide")).toContainText("对手");

  await dragBoardPoint(page, board, actorStart, [.70, .30], [7, 4]);
  await expect(undo).toBeEnabled();
  let saved = await saveAndRead(page);
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(.70, 1);
  expect(saved.frames[0].poses[opponent.id][1]).toBeCloseTo(.30, 1);

  await press(undo);
  saved = await saveAndRead(page);
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(actorStart[0], 2);
  expect(saved.frames[0].poses[opponent.id][1]).toBeCloseTo(actorStart[1], 2);
  await expect(undo).toBeDisabled();
});

test("board sheets stay keyboard-safe and restore focus to their opener", async ({ page }) => {
  await openBoard(page);
  await expect.poll(async () => page.locator(".flow-screen").evaluateAll((screens) => screens
    .filter((screen) => screen.getAttribute("data-flow-current") !== "true")
    .every((screen) => screen.hasAttribute("inert") && screen.getAttribute("aria-hidden") === "true"))).toBe(true);

  const filesTrigger = page.getByRole("button", { name: /打开我的战术板的文件选项/ });
  await press(filesTrigger);
  const sheet = page.getByTestId("bottom-sheet");
  const save = sheet.getByRole("button", { name: /立即保存/ });
  expect(Math.round((await save.boundingBox())!.height)).toBeGreaterThanOrEqual(61);
  await sheet.getByRole("textbox").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  await expect(filesTrigger).toBeFocused();

  await press(addButton(page));
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(addButton(page)).toBeFocused();
});

test("keeps editable saves separate and creates local GIF and video share files", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (data: ShareData) => !!data.files?.length });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0];
      (window as typeof window & { __sharedMedia?: { name: string; type: string; size: number } }).__sharedMedia = file
        ? { name: file.name, type: file.type, size: file.size }
        : undefined;
    } });
  });
  await page.reload();
  await openBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, canvas, actorPoint(initial, "网球"), [.70, .25]);
  const authored = await saveAndRead(page);

  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet.getByRole("heading", { name: "保存与分享", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /立即保存.*仅本机/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /完整 JSON.*仍可编辑/ })).toBeVisible();
  await press(sheet.getByRole("button", { name: /分享战术动画/ }));

  const shareSheet = page.getByRole("dialog", { name: "分享战术动画" });
  await expect(shareSheet).toBeVisible();
  await expect(shareSheet).toContainText(/只在这台设备生成.*不会上传/);
  const gifOption = shareSheet.getByRole("button", { name: /循环 GIF/ });
  const videoOption = shareSheet.getByRole("button", { name: /视频.*推荐/ });
  await expect(gifOption).toBeEnabled();
  await expect(videoOption).toBeEnabled();

  await press(gifOption);
  const gifPreview = shareSheet.getByRole("img", { name: "战术 GIF 预览" });
  await expect(gifPreview).toBeVisible({ timeout: 30_000 });
  const gifBytes = await gifPreview.evaluate(async (image) => {
    const response = await fetch((image as HTMLImageElement).src);
    return Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 6));
  });
  expect(String.fromCharCode(...gifBytes)).toBe("GIF89a");
  await press(shareSheet.getByRole("button", { name: "分享GIF", exact: true }));
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __sharedMedia?: { name: string } }).__sharedMedia?.name)).toMatch(/\.gif$/);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("cancelled", "AbortError"); } }));
  await press(shareSheet.getByRole("button", { name: "分享GIF", exact: true }));
  await expect(shareSheet.getByRole("status")).toContainText(/已取消分享.*继续下载/);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new Error("share failed"); } }));
  await press(shareSheet.getByRole("button", { name: "分享GIF", exact: true }));
  await expect(shareSheet.getByRole("alert")).toContainText("share failed");
  const gifDownload = page.waitForEvent("download");
  await press(shareSheet.getByRole("button", { name: "下载备份", exact: true }));
  expect((await gifDownload).suggestedFilename()).toMatch(/\.gif$/);
  await expect(shareSheet.getByRole("alert")).toHaveCount(0);
  await expect(shareSheet.getByRole("status")).toContainText(/文件已下载/);

  await press(shareSheet.getByRole("button", { name: "换一种格式", exact: true }));
  await press(videoOption);
  const videoPreview = shareSheet.locator("video");
  await expect(videoPreview).toBeVisible({ timeout: 30_000 });
  const videoFile = await videoPreview.evaluate(async (video) => {
    const response = await fetch((video as HTMLVideoElement).src);
    const blob = await response.blob();
    return { size: blob.size, type: blob.type };
  });
  expect(videoFile.size).toBeGreaterThan(1_000);
  expect(videoFile.type).toMatch(/^video\/(mp4|webm)/);

  const afterExport = await readLatest(page);
  expect(afterExport.frames).toEqual(authored.frames);
  expect(afterExport.smartRally).toEqual(authored.smartRally);
});

test("disables media formats when an authored route has zero playback time", async ({ page }) => {
  await openBoard(page);
  const canvas = page.getByTestId("board-canvas");
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, canvas, actorPoint(initial, "网球"), [.70, .25]);

  const frameSheet = await openFrameEditor(page, 1);
  const duration = frameSheet.locator('.board-field input[inputmode="decimal"]');
  await duration.fill("0");
  await press(frameSheet.getByRole("button", { name: "完成", exact: true }));
  await expect(frameSheet).toBeHidden();

  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  const files = page.getByTestId("bottom-sheet");
  await press(files.getByRole("button", { name: /分享战术动画/ }));
  const share = page.getByRole("dialog", { name: "分享战术动画" });
  const video = share.getByRole("button", { name: /视频.*推荐/ });
  const gif = share.getByRole("button", { name: /循环 GIF/ });
  await expect(video).toBeDisabled();
  await expect(gif).toBeDisabled();
  await expect(video).toContainText("时长需大于 0 秒");
  await expect(gif).toContainText("时长需大于 0 秒");
});

test("shows validation failures inside the active sheet", async ({ page }) => {
  await openBoard(page);

  let sheet = await openFrameEditor(page, 1);
  const duration = sheet.locator('.board-field input[inputmode="decimal"]');
  await duration.fill("121");
  await press(sheet.getByRole("button", { name: "完成", exact: true }));
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("alert")).toContainText(/拍次时长|拍次時長|0 至 120/);
  await duration.fill("2.5");
  await press(sheet.getByRole("button", { name: "完成", exact: true }));
  await expect(sheet).toBeHidden();

  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  sheet = page.getByTestId("bottom-sheet");
  const title = sheet.getByRole("textbox");
  await title.fill("");
  await press(sheet.getByRole("button", { name: "更新名称", exact: true }));
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("alert")).toContainText(/画板名称|畫板名稱|不能留空/);

  await sheet.locator('input[type="file"]').setInputFiles({
    name: "broken-board.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not-json"),
  });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("alert")).toContainText(/JSON|解析|格式/);

  await title.fill("我的战术板");
  await press(sheet.getByRole("button", { name: "更新名称", exact: true }));
  await expect(sheet.getByRole("alert")).toHaveCount(0);
});

test("announces automatic save changes without replacing the save button", async ({ page }) => {
  await openBoard(page);
  const initial = await readLatest(page);
  const opponent = initial.actors.find((actor) => actor.label === "对手")!;
  const opponentStart = actorPoint(initial, "对手");
  const live = page.getByTestId("board-save-live");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveAttribute("aria-atomic", "true");
  await expect(live).toHaveText("画板已保存", { timeout: 3000 });

  await press(objectButton(page));
  const objects = page.getByTestId("bottom-sheet");
  await press(objects.getByRole("button", { name: "选择对手", exact: true }));
  await expect(objects).toBeHidden();
  await dragBoardPoint(page, page.getByTestId("board-canvas"), opponentStart, [.56, .25]);
  await expect(live).toHaveText("画板已保存", { timeout: 3000 });
  await expect
    .poll(async () => (await readLatest(page)).frames[0].poses[opponent.id]?.[0])
    .toBeGreaterThan(.5);
  await expect(page.getByRole("button", { name: "已保存", exact: true })).toHaveClass(/board-save-status/);
});

test("keeps board library and drill handoff available", async ({ page }) => {
  test.slow();
  await openBoard(page);
  const initial = await saveAndRead(page);
  await dragBoardPoint(page, page.getByTestId("board-canvas"), actorPoint(initial, "网球"), [.70, .25]);
  let saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);

  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "战术画板" })).toBeVisible();
  await press(page.getByRole("button", { name: /我的战术板.*2 拍/ }));
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await press(page.getByRole("button", { name: "返回画板列表" }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "返回上一页" }));
  await waitForFlowSettled(page);

  await press(page.getByRole("button", { name: /^防守高深回中，9秒/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "在画板中调整" }));
  await waitForFlowSettled(page);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(5);
  const drillTrigger = page.getByRole("button", { name: "练到场上" });
  await press(drillTrigger);
  const drill = page.getByTestId("bottom-sheet");
  await expect(drill.getByRole("heading", { name: "受压回深，回位再接一拍" })).toBeVisible();
  await expect(drill.locator(".drill-stages details")).toHaveCount(4);
  await expect(drill.getByText("04 条件对抗 · 脱困后继续争分", { exact: true })).toBeVisible();
  await press(drill.getByRole("button", { name: "带着画板去练", exact: true }));
  await expect(drill).toBeHidden();
  await expect(drillTrigger).toBeFocused();
});

test("renders the public 390x844 shell at one-to-one width without simulator chrome", async ({ page }, testInfo: TestInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openBoard(page);

  for (const selector of [
    ".device-menu-bar",
    ".phone-bezel",
    ".device-camera",
    ".status-bar",
    ".home-indicator-svg",
    ".android-navigation-bar",
    ".mobile-cursor",
  ]) {
    await expect(page.locator(selector)).toBeHidden();
  }

  const screen = page.getByTestId("device-screen");
  const viewport = page.getByTestId("mobile-app-viewport");
  const app = page.locator(".tennis-app");
  const [screenBounds, viewportBounds, appBounds] = await Promise.all([
    screen.boundingBox(),
    viewport.boundingBox(),
    app.boundingBox(),
  ]);
  for (const bounds of [screenBounds, viewportBounds, appBounds]) {
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeCloseTo(0, 0);
    expect(bounds!.width).toBeCloseTo(390, 0);
  }
  expect(screenBounds!.height).toBeCloseTo(844, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await page.getByTestId("phone-frame").evaluate((element) => getComputedStyle(element).transform)).toBe("none");

  for (const control of [objectButton(page), addButton(page), playButton(page)]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.round(bounds!.height)).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({ path: testInfo.outputPath("court-board-public-mobile.png") });
  expect(consoleErrors).toEqual([]);
});
