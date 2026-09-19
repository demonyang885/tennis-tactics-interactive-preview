import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { getShotDurationForPace, type BoardDocument, type Point } from "../src/board/model";
import { getBoardGeometry, pointOnBoardPath } from "../src/board/render";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";
const STARTER_POINTS = {
  "我方": [.64, .98],
  "对手": [.30, .07],
  "网球": [.64, .96],
} satisfies Record<string, Point>;

function starterPoint(label: keyof typeof STARTER_POINTS): Point {
  return [...STARTER_POINTS[label]];
}

function currentBoardCanvas(page: Page) {
  return page.getByTestId("flow-current").getByTestId("board-canvas");
}

function currentBoardGuide(page: Page) {
  return page.getByTestId("flow-current").locator(".board-sr-only[role='status']");
}

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
  await press(page.locator(".home-plan-primary"));
  await expect(currentBoardCanvas(page)).toBeVisible();
  await waitForFlowSettled(page);
}

async function openDraftFromLibrary(page: Page, title: string) {
  await openBoard(page);
  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "草稿与模板", exact: true })).toBeVisible();
  await press(page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: title }));
  await expect(currentBoardCanvas(page)).toBeVisible();
  await waitForFlowSettled(page);
}

async function openLegacyEmptyBoard(page: Page) {
  await page.evaluate((key) => {
    const legacyEmptyBoard: BoardDocument = {
      version: 1,
      id: "legacy-empty-board",
      title: "兼容空白草稿",
      updatedAt: new Date().toISOString(),
      authoringMode: "blank-rally",
      actors: [],
      frames: [{
        id: "legacy-empty-frame",
        label: "第 1 拍 · 起始站位",
        duration: 1.5,
        poses: {},
        paths: [],
        marks: [],
      }],
    };
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [legacyEmptyBoard] }));
  }, STORAGE_KEY);
  await page.reload();
  await openDraftFromLibrary(page, "兼容空白草稿");
}

function editorDock(page: Page) {
  return page.getByTestId("flow-current").locator(".board-edit-dock");
}

function addButton(page: Page) {
  return editorDock(page).getByRole("button", { name: "添加对象", exact: true });
}

function playButton(page: Page) {
  return editorDock(page).locator(".board-primary-play");
}

async function expectObjectState(page: Page) {
  await expect(editorDock(page).getByRole("button").first()).toHaveAccessibleName("添加对象");
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
  const metrics = await board.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    rect: element.getBoundingClientRect().toJSON(),
  }));
  const geometry = getBoardGeometry(metrics.width, metrics.height);
  const local = geometry.toCanvas(point);
  return {
    x: metrics.rect.x + (local[0] + localOffset[0]) * metrics.rect.width / metrics.width,
    y: metrics.rect.y + (local[1] + localOffset[1]) * metrics.rect.height / metrics.height,
    scale: metrics.rect.width / metrics.width,
  };
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

async function dragBoardPointAndHold(page: Page, board: Locator, from: Point, to: Point, holdMilliseconds: number) {
  const start = await boardScreenPoint(board, from);
  const end = await boardScreenPoint(board, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.waitForTimeout(holdMilliseconds);
  await page.mouse.up();
}

async function swipeBoardFromLeftEdge(page: Page) {
  await currentBoardCanvas(page).evaluate((target) => {
    const emit=(type:string,touches:Array<{clientX:number;clientY:number}>,changedTouches=touches)=>{
      const event=new Event(type,{bubbles:true,cancelable:true});
      Object.defineProperties(event,{
        touches:{configurable:true,value:touches},
        changedTouches:{configurable:true,value:changedTouches},
      });
      target.dispatchEvent(event);
    };
    const start={clientX:5,clientY:170},finish={clientX:132,clientY:172};
    emit("touchstart",[start]);
    emit("touchmove",[finish]);
    emit("touchend",[],[finish]);
  });
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
    const ratio = 1.93;
    const runOff = .08;
    const availableHeight = Math.max(1, height - 8 - 8);
    const courtHeight = Math.max(1, Math.min(availableHeight / (1 + runOff * 2), (width - 28) * ratio));
    const courtWidth = courtHeight / ratio;
    const courtX = (width - courtWidth) / 2;
    const tacticalHeight = courtHeight * (1 + runOff * 2);
    const courtY = 8 + (availableHeight - tacticalHeight) / 2 + courtHeight * runOff;
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
  // Saving is deliberately automatic. Let the React commit reach the header,
  // then wait for the debounced local write instead of invoking a hidden save.
  await page.waitForTimeout(40);
  await expect(page.getByTestId("board-save-live")).toHaveText("画板已保存", { timeout: 3_000 });
  return readLatest(page);
}

async function dispatchBoardAction(page: Page, boardId: string, action: "restore") {
  await page.evaluate(({ id, requestedAction }) => {
    window.dispatchEvent(new CustomEvent("tennis-board-action", {
      detail: { boardId: id, action: requestedAction },
    }));
  }, { id: boardId, requestedAction: action });
}

function actorPoint(board: BoardDocument, label: string, frameIndex = 0): Point {
  const actor = board.actors.find((candidate) => candidate.label === label);
  if (!actor) throw new Error(`Missing ${label} actor`);
  const point = board.frames[frameIndex]?.poses[actor.id];
  if (!point) throw new Error(`Missing ${label} pose in frame ${frameIndex + 1}`);
  return point;
}

async function openFrameEditor(page: Page, frameNumber: number) {
  await clickBoardPoint(page, currentBoardCanvas(page), [.96, .48]);
  await press(page.getByRole("button", { name: /打开拍次/ }));
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet.getByRole("heading", { name: "拍次", exact: true })).toBeVisible();
  await press(sheet.getByRole("button", { name: new RegExp(`^编辑第 ${frameNumber} 拍`) }));
  await expect(sheet.getByRole("heading", { name: `第 ${frameNumber} 拍`, exact: true })).toBeVisible();
  return sheet;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
});

test("uses the three-control hierarchy and keeps direct canvas editing available", async ({ page }) => {
  await openBoard(page);
  const dock = editorDock(page);
  const adjust = dock.getByRole("button").first();
  const play = playButton(page);
  const remove = dock.getByRole("button").last();

  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button")).toHaveCount(3);
  await expect(adjust).toHaveAccessibleName("添加对象");
  await expect(remove).toHaveAccessibleName("删除网球");
  await expect(play).toBeVisible();
  await expect(play).toHaveAccessibleName("画出一条球路，就能播放");
  await expect(play).toBeDisabled();
  await expect(dock).toHaveText("");
  await expect(dock.getByRole("button", { name: /^(选择|球员|球路|跑位|标记)$/ })).toHaveCount(0);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新增一拍/ })).toHaveCount(0);
  await expect(currentBoardGuide(page)).toContainText(/从网球拖出去.*发球路线/);

  const board = currentBoardCanvas(page);
  const opponentStart = starterPoint("对手");
  await dragBoardPoint(page, board, opponentStart, [.68, .28]);
  let saved = await saveAndRead(page);
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[0]).toBeCloseTo(.68, 1);
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[1]).toBeCloseTo(.28, 1);
  expect(saved.actors).toHaveLength(3);

  await press(page.getByRole("button", { name: "返回上一页" }));
  await waitForFlowSettled(page);
  await openDraftFromLibrary(page, "我的战术板");
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[0]).toBeCloseTo(.68, 1);
});

test("restores the starter serve position from the board and keeps it one-step undoable", async ({ page }) => {
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  await expect(page.getByRole("button", { name: /^(现在就是发球站位|还原标准发球站位)/ })).toHaveCount(0);
  await dragBoardPoint(page, canvas, starterPoint("网球"), [.70, .25]);
  const beforeRestore = await saveAndRead(page);
  expect(beforeRestore.actors).toHaveLength(3);
  expect(beforeRestore.frames).toHaveLength(2);
  expect(beforeRestore.frames[0].paths.some((path) => path.kind === "shot")).toBe(true);

  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  const restoreMenu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  const restoreButton = restoreMenu.getByRole("button", { name: "一键还原发球站位，可撤销", exact: true });
  await expect(restoreButton).toBeEnabled();
  await press(restoreButton);
  await expect(canvas).toBeFocused();
  await expect(currentBoardGuide(page)).toContainText(/已回到发球站位.*可以撤销/);
  await expect(playButton(page)).toBeDisabled();
  await expect(playButton(page)).toHaveAccessibleName("画出一条球路，就能播放");
  await expect(playButton(page)).toHaveText("");

  let restored = await saveAndRead(page);
  expect(restored.id).toBe(beforeRestore.id);
  expect(restored.title).toBe(beforeRestore.title);
  expect(restored.actors).toHaveLength(3);
  expect(restored.actors.filter((actor) => actor.kind === "player")).toHaveLength(2);
  expect(restored.actors.filter((actor) => actor.kind === "ball")).toHaveLength(1);
  expect(restored.frames).toHaveLength(1);
  expect(restored.frames[0]).toMatchObject({
    label: "第 1 拍 · 起始站位",
    paths: [],
    marks: [],
  });
  expect(actorPoint(restored, "我方")).toEqual([.64, .98]);
  expect(actorPoint(restored, "对手")).toEqual([.30, .07]);
  expect(actorPoint(restored, "网球")).toEqual([.64, .96]);
  expect(restored.smartRally).toMatchObject({ phase: "shot" });
  await expect(page.getByRole("button", { name: /^(现在就是发球站位|还原标准发球站位)/ })).toHaveCount(0);

  await press(page.getByRole("button", { name: "撤销", exact: true }));
  let reverted = await saveAndRead(page);
  expect(reverted.id).toBe(beforeRestore.id);
  expect(reverted.title).toBe(beforeRestore.title);
  expect(reverted.actors).toEqual(beforeRestore.actors);
  expect(reverted.frames).toEqual(beforeRestore.frames);
  expect(reverted.smartRally).toEqual(beforeRestore.smartRally);

  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  await press(page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: /^重做/ }));
  restored = await saveAndRead(page);
  expect(restored.actors).toHaveLength(3);
  expect(restored.frames).toHaveLength(1);
  expect(restored.frames[0].paths).toEqual([]);

  await page.reload();
  await openDraftFromLibrary(page, "我的战术板");
  restored = await readLatest(page);
  expect(restored.id).toBe(beforeRestore.id);
  expect(restored.actors).toHaveLength(3);
  expect(restored.frames).toHaveLength(1);
  await expect(playButton(page)).toBeDisabled();

  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  const files = page.getByTestId("bottom-sheet");
  await expect(files.getByRole("heading", { name: "画板菜单", exact: true })).toBeVisible();
  await expect(files.locator(".board-menu-list > button")).toHaveCount(5);
  await expect(files.getByRole("button", { name: /修改名称/ })).toBeVisible();
  await expect(files.getByRole("button", { name: "现在就是发球站位", exact: true })).toBeDisabled();
  await expect(files.getByRole("button", { name: /保存与分享/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /草稿与模板/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /一键清除|拍次历史|立即保存|导入 JSON/ })).toHaveCount(0);
  await press(files.getByRole("button", { name: /保存与分享/ }));
  await expect(files.getByRole("heading", { name: "保存与分享", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: /^分享球路视频.*先画一条球路/ })).toBeDisabled();
  await expect(files.getByRole("button", { name: /^分享动态图.*先画一条球路/ })).toBeDisabled();
  await press(files.getByRole("button", { name: "返回画板菜单" }));
  await press(files.getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("button", { name: "画一条新球路", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建纯空白画板", exact: true })).toHaveCount(0);
});

test("authors a smart rally as shot, receiver movement, then the next shot", async ({ page }) => {
  await openBoard(page);
  const board = currentBoardCanvas(page);
  const ballStart = starterPoint("网球");
  const opponentStart = starterPoint("对手");
  const meStart = starterPoint("我方");
  expect(Math.hypot(ballStart[0] - meStart[0], ballStart[1] - meStart[1])).toBeLessThan(.03);

  // Even though the ball overlaps the server, the armed ball starts the serve
  // with zero setup clicks rather than moving the player underneath it.
  await dragBoardPoint(page, board, ballStart, [.70, .25]);
  await expect(currentBoardGuide(page)).toContainText("球路已记下。现在拖动接球球员。");
  let saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  const me = saved.actors.find((actor) => actor.label === "我方")!;
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths).toHaveLength(1);
  expect(saved.frames[0].paths[0]).toMatchObject({ kind: "shot", actorId: ball.id });
  const firstShot = saved.frames[0].paths[0];
  const firstShotMidpointX = (firstShot.from[0] + firstShot.to[0]) / 2;
  expect(firstShot.control?.[0]).toBeGreaterThan(firstShotMidpointX);
  expect(saved.frames[1].paths).toEqual([]);
  expect(saved.frames[1].poses[ball.id][0]).toBeCloseTo(.70, 1);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  await dragBoardPoint(page, board, opponentStart, [.66, .34]);
  await expect(currentBoardGuide(page)).toContainText("跑位已记下。再拖动网球，画下一拍。");
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[0].paths.find((path) => path.kind === "move")?.control).toBeUndefined();
  expect(saved.frames[1].paths).toEqual([]);
  expect(saved.frames[1].poses[opponent.id][0]).toBeCloseTo(.66, 1);
  expect(saved.frames[1].poses[opponent.id][1]).toBeCloseTo(.34, 1);
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);

  await dragBoardPoint(page, board, [.70, .25], [.32, .75]);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  expect(saved.frames[1].paths.find((path) => path.kind === "shot")?.actorId).toBe(ball.id);
  expect(saved.frames[2].paths).toEqual([]);
  expect(saved.frames[2].poses[ball.id][0]).toBeCloseTo(.32, 1);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  const nextReceiverMove = saved.frames[2].paths.find((path) => path.kind === "move");
  expect(nextReceiverMove).toBeUndefined();
  expect(me.id).not.toBe(opponent.id);
});

for (const [holdMs, pace] of [[600, "control"], [1250, "drive"], [1800, "put-away"]] as const) {
  test(`commits ${pace} after a ${holdMs}ms stable hold and preserves derived timing`, async ({ page }) => {
    await openBoard(page);
    await dragBoardPointAndHold(page, currentBoardCanvas(page), starterPoint("网球"), [.70, .25], holdMs);
    const saved = await saveAndRead(page);
    const shot = saved.frames[0].paths.find(path => path.kind === "shot")!;
    expect(shot.pace).toBe(pace);
    expect(saved.frames[0].duration).toBe(getShotDurationForPace(shot, pace));
    await press(page.getByRole("button", { name: "撤销", exact: true }));
    const undone = await saveAndRead(page);
    expect(undone.frames).toHaveLength(1);
    expect(undone.frames[0].paths).toEqual([]);
  });
}

test("clearing selection exposes history without cancelling the next smart shot", async ({ page }) => {
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  await clickBoardPoint(page, canvas, [.96, .48]);
  await expect(editorDock(page).getByRole("button", { name: /打开拍次/ })).toBeVisible();
  await dragBoardPoint(page, canvas, starterPoint("网球"), [.70, .25]);
  const saved = await saveAndRead(page);
  expect(saved.frames[0].paths[0].kind).toBe("shot");
  expect(saved.smartRally?.phase).toBe("move");
});

test("bends newly drawn feed routes toward screen-right by default", async ({ page }) => {
  await openLegacyEmptyBoard(page);
  const board = currentBoardCanvas(page);
  const feedStart: Point = [.34, .72];
  const feedLanding: Point = [.70, .28];

  await chooseAddItem(page, /^网球/);
  await clickBoardPoint(page, board, feedStart);
  const addSheet = await openAddPalette(page);
  await press(addSheet.getByRole("button", { name: "喂球路线", exact: true }));
  await expect(addSheet).toBeHidden();
  await dragBoardPoint(page, board, feedStart, feedLanding);

  const saved = await saveAndRead(page);
  const feed = saved.frames[0].paths.find((path) => path.kind === "feed");
  expect(feed).toBeDefined();
  const midpointX = (feed!.from[0] + feed!.to[0]) / 2;
  expect(feed!.control?.[0]).toBeGreaterThan(midpointX);
});

test("adjusts the just-drawn shot curve without leaving the smart rally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  const ballStart = starterPoint("网球");
  const receiverStart = starterPoint("对手");

  await dragBoardPoint(page, canvas, ballStart, [.70, .25]);
  let saved = await saveAndRead(page);
  const originalShot = saved.frames[0].paths.find((path) => path.kind === "shot")!;
  expect(originalShot.control).toBeDefined();
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  await clickBoardPoint(page, canvas, pointOnBoardPath(originalShot, .5));
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
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  await press(page.getByRole("button", { name: "重做", exact: true }));
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.find((path) => path.id === originalShot.id)?.control?.[0]).toBeCloseTo(adjustedControl[0], 1);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  await clickBoardPoint(page, canvas, pointOnBoardPath(originalShot, .5));
  await dragBoardPoint(page, canvas, receiverStart, [.66, .34]);
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.id === originalShot.id)?.control?.[0]).toBeCloseTo(adjustedControl[0], 1);
});

test("toggles a completed shot between straight and curve directly on the route", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  await dragBoardPointAndHold(page, canvas, starterPoint("网球"), [.70, .25], 1_650);
  const afterShot = await saveAndRead(page);
  await clickBoardPoint(page, canvas, pointOnBoardPath(afterShot.frames[0].paths[0], .5));
  await expect(page.getByRole("button", { name: "一键改直线", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: "一键改直线", exact: true }));
  let saved = await saveAndRead(page);
  const straightShot = saved.frames[0].paths.find((path) => path.kind === "shot")!;
  expect(straightShot.control).toBeUndefined();
  expect(straightShot.pace).toBe("put-away");

  await press(page.getByRole("button", { name: "恢复曲线", exact: true }));
  saved = await saveAndRead(page);
  const curvedAgain = saved.frames[0].paths.find((path) => path.id === straightShot.id)!;
  const midpoint: Point = curvedAgain.control!;
  const adjustedControl: Point = [midpoint[0] - .12, midpoint[1] - .07];
  await dragBoardPoint(page, canvas, midpoint, adjustedControl);
  saved = await saveAndRead(page);
  const curvedShot = saved.frames[0].paths.find((path) => path.id === straightShot.id)!;
  expect(curvedShot.control?.[0]).toBeCloseTo(adjustedControl[0], 1);
  expect(curvedShot.control?.[1]).toBeCloseTo(adjustedControl[1], 1);
  expect(saved.smartRally).toMatchObject({ frameId: saved.frames[1].id, phase: "move" });
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*跑位/);
});

test("deleting the just-completed shot returns to a ready serve gesture", async ({ page }) => {
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  await dragBoardPoint(page, canvas, starterPoint("网球"), [.70, .25]);
  const beforeDelete = await saveAndRead(page);
  const route = beforeDelete.frames[0].paths.find((path) => path.kind === "shot")!;
  await clickBoardPoint(page, canvas, pointOnBoardPath(route, .5));
  await press(page.getByRole("button", { name: "删除击球路线", exact: true }));

  let saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  expect(saved.frames).toHaveLength(1);
  expect(saved.frames[0].paths).toEqual([]);
  expect(saved.smartRally).toMatchObject({ frameId: saved.frames[0].id, phase: "shot", actorId: ball.id });
  await expect(currentBoardGuide(page)).toContainText(/从网球拖出去.*发球路线/);

  await dragBoardPoint(page, canvas, saved.frames[0].poses[ball.id], [.32, .24]);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.find((path) => path.kind === "shot")?.to[0]).toBeCloseTo(.32, 1);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);
});

test("places an added mark over the visible previous route without selecting that route", async ({ page }) => {
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  await dragBoardPoint(page, canvas, starterPoint("网球"), [.70, .25]);
  const afterShot = await saveAndRead(page);
  const shot = afterShot.frames[0].paths.find((path) => path.kind === "shot")!;
  const onRoute = pointOnBoardPath(shot, .5);

  const palette = await openAddPalette(page);
  await press(palette.getByRole("button", { name: "目标区", exact: true }));
  await expect(palette).toBeHidden();
  await clickBoardPoint(page, canvas, onRoute);

  let saved = await saveAndRead(page);
  expect(saved.frames[0].paths).toEqual(afterShot.frames[0].paths);
  expect(saved.frames[1].marks).toHaveLength(1);
  expect(saved.frames[1].marks[0]).toMatchObject({ kind: "target" });
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  await clickBoardPoint(page, canvas, onRoute);
  await expect(page.getByRole("button", { name: "删除目标区", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: "删除目标区", exact: true }));
  saved = await saveAndRead(page);
  expect(saved.frames[1].marks).toEqual([]);

  await press(page.getByRole("button", { name: /打开我的战术板的画板菜单/ }));
  const files = page.getByTestId("bottom-sheet");
  await press(files.getByRole("button", { name: /保存与分享/ }));
  const saveShare = page.getByRole("dialog", { name: "保存与分享" });
  const duration = `${saved.frames[0].duration.toFixed(1)} 秒`;
  await expect(saveShare.getByRole("button", { name: /分享球路视频.*推荐/ })).toContainText(duration);
  await expect(saveShare.getByRole("button", { name: /分享动态图/ })).toContainText(duration);
});

test("keeps the armed actor draggable when the ball and receiver share a point", async ({ page }) => {
  await openBoard(page);
  const board = currentBoardCanvas(page);
  const ballStart = starterPoint("网球");
  const receiverPoint = starterPoint("对手");

  // A realistic serve often ends exactly on the receiver. The guided actor
  // must win this ambiguous hit target on both the movement and return steps.
  await dragBoardPoint(page, board, ballStart, receiverPoint);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  await dragBoardPoint(page, board, receiverPoint, [.66, .34]);
  await expect(currentBoardGuide(page)).toContainText("跑位已记下。再拖动网球，画下一拍。");
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);
  let saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[1].paths).toEqual([]);

  await dragBoardPoint(page, board, receiverPoint, [.32, .75]);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);
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
  const canvas = currentBoardCanvas(page);
  const from = starterPoint("网球");
  const receiverStart = starterPoint("对手");
  const to: Point = [.70, .25];
  await dragBoardPoint(page, canvas, from, to);

  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

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
  await expect(currentBoardGuide(page)).toContainText("跑位已记下。再拖动网球，画下一拍。");
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);
  saved = await saveAndRead(page);
  const receiverMove = saved.frames[0].paths.find((path) => path.kind === "move");
  expect(receiverMove, "the receiver movement is synchronized with the incoming serve").toBeDefined();
  expect(saved.frames[1].paths, "the return frame stays empty until its outgoing shot is drawn").toEqual([]);
  await expectPathClearlyVisible(canvas, serve!, "shot", "the incoming serve stays clearly visible after receiver movement");
  await expectPathClearlyVisible(canvas, receiverMove!, "move", "the receiver movement is clearly visible with the incoming serve");

  await dragBoardPoint(page, canvas, [.70, .25], [.32, .75]);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);
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
  const board = currentBoardCanvas(page);
  await dragBoardPoint(page, board, starterPoint("网球"), [.70, .25]);
  await dragBoardPoint(page, board, starterPoint("对手"), [.66, .34]);
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
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);

  await press(redo);
  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].paths.map((path) => path.kind)).toEqual(["shot"]);
  expect(saved.frames[2].paths).toEqual([]);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);
});

test("can select the ball directly to skip receiver movement", async ({ page }) => {
  await openBoard(page);
  const board = currentBoardCanvas(page);

  await dragBoardPoint(page, board, starterPoint("网球"), [.70, .25]);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);
  await dragBoardPoint(page, board, [.70, .25], [.36, .72]);

  const saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[1].paths).toHaveLength(1);
  expect(saved.frames[1].paths[0]).toMatchObject({ kind: "shot", actorId: ball.id });
  expect(saved.frames[2].paths).toEqual([]);
});

test("synchronizes an extra player move before the armed receiver is skipped", async ({ page }) => {
  await openLegacyEmptyBoard(page);
  const play = playButton(page);
  const board = currentBoardCanvas(page);
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
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

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
  await expect(play).toHaveAccessibleName(/1\s*拍/);
  await expect(play).toHaveAccessibleName(/1\.5\s*秒/);

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
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  const board = currentBoardCanvas(page);
  await dragBoardPoint(page, board, [.56, .18], [.66, .34]);
  await expect(currentBoardGuide(page)).toContainText("跑位已保留。接下来请手动调整。");

  let saved = await saveAndRead(page);
  expect(saved.smartRally).toBeUndefined();
  expect(saved.frames[0].paths.find((path) => path.id === "existing-receiver-move")).toBeDefined();
  expect(saved.frames[1].paths).toContainEqual(expect.objectContaining({ kind: "move", actorId: "opponent" }));

  await press(page.getByRole("button", { name: "撤销", exact: true }));
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);
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

test("reopens a guided board safely after an opening player route switches it to manual", async ({ page }) => {
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  await dragBoardPoint(page, canvas, starterPoint("对手"), [.48, .24]);
  await expect(currentBoardGuide(page)).toContainText("跑位已保留。接下来请手动调整。");

  const manual = await saveAndRead(page);
  const opponent = manual.actors.find((actor) => actor.label === "对手")!;
  expect(manual.authoringMode).toBe("blank-rally");
  expect(manual.smartRally).toBeUndefined();
  const manualMove = manual.frames[0].paths.find((path) => path.actorId === opponent.id);
  expect(manualMove).toMatchObject({ kind: "move", actorId: opponent.id });
  expect(manualMove?.to[0]).toBeCloseTo(.48, 5);
  expect(manualMove?.to[1]).toBeCloseTo(.24, 5);

  await page.reload();
  await openDraftFromLibrary(page, "我的战术板");
  await expect(currentBoardCanvas(page)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const reopened = await saveAndRead(page);
  expect(reopened.smartRally).toBeUndefined();
  expect(reopened.frames[0].paths).toEqual(manual.frames[0].paths);

  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: "manual-guided-board.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      ...manual,
      id: "import-source-id",
      title: "导入的手动画板",
      updatedAt: new Date().toISOString(),
    })),
  });
  await expect(currentBoardCanvas(page)).toBeVisible();
  const imported = await saveAndRead(page);
  expect(imported.id).not.toBe(reopened.id);
  expect(imported.title).toBe("导入的手动画板（导入）");
  expect(imported.authoringMode).toBe("blank-rally");
  expect(imported.smartRally).toBeUndefined();
  expect(imported.frames[0].paths).toEqual(manual.frames[0].paths);
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
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);

  const board = currentBoardCanvas(page);
  const finalLanding: Point = [.28, .72];
  await dragBoardPoint(page, board, [.65, .25], finalLanding);
  await expect(currentBoardGuide(page)).toContainText("球路已保留。接下来请手动调整。");

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

test("keeps legacy empty and multiple-ball boards on the safe fallback path", async ({ page }) => {
  test.slow();
  await openLegacyEmptyBoard(page);
  const board = currentBoardCanvas(page);
  await expect(currentBoardGuide(page)).toContainText(/点选球员、网球或路线开始调整/);

  const palette = await openAddPalette(page);
  for (const label of [/^我方球员$/, /^对手球员$/, /^网球$/, /^画球路$/, /^画跑位$/, /^喂球路线$/, /^目标区$/, /^标志碟$/, /^球筐$/, /^文字提示$/, /^自由笔$/]) {
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
  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "画一条新球路", exact: true }));
  await waitForFlowSettled(page);
  const standard = currentBoardCanvas(page);
  await chooseAddItem(page, /^网球/);
  await clickBoardPoint(page, standard, [.78, .72]);
  await expect(currentBoardGuide(page)).toContainText(/已选中网球 2\/2/);

  const addSheet = await openAddPalette(page);
  const drawRoute = addSheet.getByRole("button", { name: /^画球路/ });
  await expect(drawRoute).toBeEnabled();
  await press(drawRoute);
  await expect(addSheet).toBeHidden();
  await expect(currentBoardGuide(page)).toContainText(/从网球拖到落点.*画出球路曲线/);
  await dragBoardPoint(page, standard, [.78, .72], [.78, .28]);
  saved = await saveAndRead(page);
  const balls = saved.actors.filter((actor) => actor.kind === "ball");
  expect(balls).toHaveLength(2);
  expect(saved.frames).toHaveLength(1);
  expect(saved.frames[0].paths).toHaveLength(1);
  expect(saved.frames[0].paths[0].actorId).toBe(balls[1].id);
});

test("restores the guided tool after an extra player is deleted from a legacy empty board", async ({ page }) => {
  await openLegacyEmptyBoard(page);
  const canvas = currentBoardCanvas(page);
  const ballStart: Point = [.34, .72];

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, canvas, [.62, .82]);
  await chooseAddItem(page, /^对手球员/);
  await clickBoardPoint(page, canvas, [.46, .18]);
  await chooseAddItem(page, /^网球/);
  await clickBoardPoint(page, canvas, ballStart);
  await expect(currentBoardGuide(page)).toContainText("两位球员和网球已就位");

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, canvas, [.80, .68]);
  await expect(currentBoardGuide(page)).toContainText(/已选中我方 2\/2/);
  await press(editorDock(page).getByRole("button", { name: "删除我方 2/2", exact: true }));
  await expect(currentBoardGuide(page)).toContainText("已恢复两位球员。现在从网球拖出去，画出发球路线。");

  await dragBoardPoint(page, canvas, ballStart, [.70, .25]);
  const saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  expect(saved.actors.filter((actor) => actor.kind === "player")).toHaveLength(2);
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths).toContainEqual(expect.objectContaining({ kind: "shot", actorId: ball.id }));
  expect(saved.smartRally).toMatchObject({ frameId: saved.frames[1].id, phase: "move" });
});

test("a legacy empty tactical board preserves consecutive ball routes as atomic rally beats", async ({ page }) => {
  test.slow();
  await openLegacyEmptyBoard(page);
  const canvas = currentBoardCanvas(page);
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
  await expect(currentBoardGuide(page)).toContainText(/从网球拖出去.*发球路线/);

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
  await expect(currentBoardGuide(page)).toContainText("跑位已记下。再拖动网球，画下一拍。");
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);
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
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);
});

test("normalizes a legacy empty draft and keeps restore available in the secondary menu", async ({ page }) => {
  await page.evaluate((key) => {
    const legacy: BoardDocument = {
      version: 1,
      id: "legacy-empty-blank",
      title: "我的空白战术",
      updatedAt: new Date().toISOString(),
      actors: [],
      frames: [{
        id: "legacy-empty-frame",
        label: "起始站位",
        duration: 1.5,
        poses: {},
        paths: [],
        marks: [],
      }],
    };
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [legacy] }));
  }, STORAGE_KEY);
  await page.reload();
  await openDraftFromLibrary(page, "我的空白战术");

  const untouched = await readLatest(page);
  expect(untouched.id).toBe("legacy-empty-blank");
  expect(untouched.authoringMode).toBeUndefined();
  expect(untouched.frames[0].label).toBe("起始站位");
  await press(page.getByRole("button", { name: /打开我的空白战术的画板菜单/ }));
  const boardMenu = page.getByTestId("bottom-sheet");
  await press(boardMenu.getByRole("button", { name: /^修改名称/ }));
  const rename = page.getByTestId("board-rename-layer");
  await rename.getByRole("textbox", { name: "画板名称" }).fill("我的空白战术 · 已整理");
  await press(rename.getByRole("button", { name: "完成", exact: true }));

  const normalized = await saveAndRead(page);
  expect(normalized.id).toBe("legacy-empty-blank");
  expect(normalized.authoringMode).toBe("blank-rally");
  expect(normalized.frames[0].label).toBe("第 1 拍 · 起始站位");
  await expect(page.getByRole("button", { name: /还原标准发球站位/ })).toHaveCount(0);
  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  const menu = page.getByTestId("bottom-sheet");
  await expect(menu.getByRole("button", { name: "一键还原发球站位，可撤销", exact: true })).toBeEnabled();
  await expect(menu.getByRole("button", { name: /一键清除/ })).toHaveCount(0);
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

  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);
  const untouched = await readLatest(page);
  expect(untouched.authoringMode).toBeUndefined();
  expect(untouched.frames).toHaveLength(1);

  const canvas = currentBoardCanvas(page);
  await dragBoardPoint(page, canvas, [.46, .18], [.66, .34]);
  await expect(currentBoardGuide(page)).toContainText("跑位已记下。再拖动网球，画下一拍。");
  let saved = await saveAndRead(page);
  expect(saved.authoringMode).toBe("blank-rally");
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[1].poses.ball).toEqual(firstLanding);
  expect(saved.smartRally).toMatchObject({
    frameId: saved.frames[1].id,
    phase: "shot",
    hitterId: "opponent",
    actorId: "ball",
  });

  // The normalized continuation is persisted only after that explicit edit,
  // and must then survive the real reopen path before the next shot.
  await page.reload();
  await openBoard(page);
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);
  await dragBoardPoint(page, currentBoardCanvas(page), firstLanding, [.32, .75]);

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
  const board = currentBoardCanvas(page);

  await dragBoardPoint(page, board, starterPoint("网球"), [.70, .25]);
  await dragBoardPoint(page, board, starterPoint("对手"), [.66, .34]);
  await expect(currentBoardGuide(page)).toContainText("跑位已记下。再拖动网球，画下一拍。");

  const saved = await saveAndRead(page);
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames).toHaveLength(2);
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[1].paths).toEqual([]);
  await expect(play).toBeEnabled();
  await expect(play).toHaveAccessibleName(/1\s*拍/);
  await expect(play).toHaveAccessibleName(`播放战术，1 拍，共 ${saved.frames[0].duration.toFixed(1)} 秒`);
});

test("playback ignores the automatic trailing empty frame and manages edge focus", async ({ page }) => {
  await openBoard(page);
  const play = playButton(page);
  const board = currentBoardCanvas(page);
  await dragBoardPoint(page, board, starterPoint("网球"), [.70, .25]);
  await dragBoardPoint(page, board, starterPoint("对手"), [.66, .34]);
  await dragBoardPoint(page, board, [.70, .25], [.32, .75]);

  const saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(3);
  expect(saved.frames[2].paths).toEqual([]);
  await expect(play).toBeEnabled();
  await expect(play).toHaveAccessibleName(/2\s*拍/);
  await expect(play).toHaveAccessibleName(`播放战术，2 拍，共 ${(saved.frames[0].duration + saved.frames[1].duration).toFixed(1)} 秒`);

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

  await press(page.getByRole("button", { name: "继续修改", exact: true }));
  await expect(page.locator(".board-editor")).toHaveClass(/is-editing/);
  await expect(currentBoardCanvas(page)).toBeFocused();
});

test("opens frame history directly from the visible beat control and edits a selected frame", async ({ page }) => {
  await openBoard(page);
  const board = currentBoardCanvas(page);
  await dragBoardPoint(page, board, starterPoint("网球"), [.70, .25]);
  const before = await saveAndRead(page);
  expect(before.frames).toHaveLength(2);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);

  const sheet = await openFrameEditor(page, 1);
  const label = sheet.locator(".board-field").filter({ hasText: "拍次口令" }).locator("input");
  const duration = sheet.locator('.board-field input[inputmode="decimal"]');
  await label.focus();
  await expect(label).toBeFocused();
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
  await label.fill("第 1 拍 · 外角发球");
  await expect(duration).toHaveCount(0);
  await press(sheet.getByRole("button", { name: "完成", exact: true }));
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.matches('input, textarea, [contenteditable="true"]') ?? false)).toBe(false);

  const saved = await saveAndRead(page);
  expect(saved.frames[0].label).toBe("第 1 拍 · 外角发球");
  expect(saved.frames[0].duration).toBe(before.frames[0].duration);
  expect(saved.frames[1].paths).toEqual([]);

  const secondFrame = await openFrameEditor(page, 2);
  await expect(secondFrame.locator('.board-field input[inputmode="decimal"]')).toHaveCount(0);
  await press(secondFrame.getByRole("button", { name: "取消编辑拍次", exact: true }));
  await expect(secondFrame).toBeHidden();
});

test("frameless direct manipulation keeps grab offset, ignores jitter, and records one undo", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
  await page.reload();
  await openBoard(page);
  const board = currentBoardCanvas(page);
  const undo = page.getByRole("button", { name: "撤销", exact: true });
  const actorStart = starterPoint("对手");
  await clickBoardPoint(page, board, actorStart);
  await expect(editorDock(page).getByRole("button", { name: "删除对手", exact: true })).toBeVisible();
  const center = await boardScreenPoint(board, actorStart);
  expect(center.scale).toBeCloseTo(1, 5);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 4, center.y);
  await page.mouse.up();
  await expect(undo).toBeDisabled();
  await expect(currentBoardGuide(page)).toContainText("对手");

  await dragBoardPoint(page, board, actorStart, [.70, .30], [7, 4]);
  await expect(undo).toBeEnabled();
  let saved = await saveAndRead(page);
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[0]).toBeCloseTo(.70, 1);
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[1]).toBeCloseTo(.30, 1);

  await press(undo);
  saved = await saveAndRead(page);
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(actorStart[0], 2);
  expect(saved.frames[0].poses[opponent.id][1]).toBeCloseTo(actorStart[1], 2);
  await expect(undo).toBeDisabled();
});

test("renames in a dedicated keyboard-safe layer and restores focus to its opener", async ({ page }) => {
  await openBoard(page);
  await expect.poll(async () => page.locator(".flow-screen").evaluateAll((screens) => screens
    .filter((screen) => screen.getAttribute("data-flow-current") !== "true")
    .every((screen) => screen.hasAttribute("inert") && screen.getAttribute("aria-hidden") === "true"))).toBe(true);

  const menuTrigger = page.getByRole("toolbar", { name: "战术板操作", exact: true })
    .getByRole("button", { name: /打开我的战术板的画板菜单/ });
  const stageTransform = await page.locator(".phone-stage").evaluate((element) => getComputedStyle(element).transform);
  await press(menuTrigger);
  const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await press(menu.getByRole("button", { name: /^修改名称/ }));
  const rename = page.getByTestId("board-rename-layer");
  await expect(rename).toBeVisible();
  await expect(rename.getByRole("heading", { name: "修改名称", exact: true })).toBeVisible();
  const title = rename.getByRole("textbox", { name: "画板名称" });
  await expect(title).toBeFocused();
  const fontSize = await title.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
  await title.fill("键盘安全名称");
  await page.keyboard.press("Escape");
  await expect(rename).toBeHidden();
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
  await expect(menuTrigger).toBeFocused();
  await expect(page.locator(".phone-stage")).toHaveCSS("transform", stageTransform);

  await press(addButton(page));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bottom-sheet")).toBeHidden();
  await expect(addButton(page)).toBeFocused();
});

test("opens directly in the app-level immersive board and returns with its state preserved", async ({ page }) => {
  await openBoard(page);
  const canvas = currentBoardCanvas(page);
  await dragBoardPoint(page, canvas, starterPoint("网球"), [.70, .25]);
  const authored = await saveAndRead(page);

  const editor = page.locator(".board-editor");
  const stage = page.locator(".phone-stage");
  await expect(editor).toHaveAttribute("data-immersive", "true");
  await expect(stage).toHaveAttribute("data-board-immersive", "true");
  await expect(page.getByRole("button", { name: /^(进入|退出)全屏战术板$/ })).toHaveCount(0);
  const stageBounds = await stage.boundingBox();
  expect(stageBounds).not.toBeNull();
  expect(stageBounds!.x).toBeCloseTo(0, 0);
  expect(stageBounds!.y).toBeCloseTo(0, 0);
  expect(stageBounds!.width).toBeCloseTo(1100, 0);
  expect(stageBounds!.height).toBeCloseTo(1100, 0);
  await expect(canvas).toBeVisible();

  const immersiveToolbar = page.getByRole("toolbar", { name: "战术板操作", exact: true });
  await clickBoardPoint(page, canvas, [.96, .48]);
  const history = editorDock(page).getByRole("button", { name: /打开拍次，当前第 2 拍/ });
  const historyBounds = await history.boundingBox();
  expect(historyBounds).not.toBeNull();
  expect(historyBounds!.width).toBeGreaterThanOrEqual(44);
  expect(historyBounds!.height).toBeGreaterThanOrEqual(44);
  await expect(history).toHaveText("");

  await press(immersiveToolbar.getByRole("button", { name: /打开我的战术板的画板菜单/ }));
  const menu = page.getByRole("dialog", { name: "画板菜单" });
  await expect(menu).toBeVisible();
  await expect(menu.locator(".board-menu-list > button")).toHaveCount(5);
  await expect(menu.getByRole("button", { name: "一键还原发球站位，可撤销", exact: true })).toBeEnabled();
  await page.getByTestId("sheet-overlay").click({ position: { x: 20, y: 20 } });
  await expect(menu).toBeHidden();
  await expect(editor).toHaveAttribute("data-immersive", "true");

  await press(immersiveToolbar.getByRole("button", { name: "返回上一页", exact: true }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
  await expect(stage).not.toHaveAttribute("data-board-immersive", "true");
  const afterExit = await readLatest(page);
  expect(afterExit.frames).toEqual(authored.frames);
  expect(afterExit.smartRally).toEqual(authored.smartRally);
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
  const canvas = currentBoardCanvas(page);
  await dragBoardPoint(page, canvas, starterPoint("网球"), [.70, .25]);
  const authored = await saveAndRead(page);

  await press(page.getByRole("button", { name: /打开我的战术板的画板菜单/ }));
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet.getByRole("heading", { name: "画板菜单", exact: true })).toBeVisible();
  await press(sheet.getByRole("button", { name: /保存与分享/ }));
  await expect(sheet.getByRole("heading", { name: "保存与分享", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /立即保存/ })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /备份画板.*之后可导入.*继续修改/ })).toBeVisible();
  const gifOption = sheet.getByRole("button", { name: /分享动态图/ });
  const videoOption = sheet.getByRole("button", { name: /分享球路视频.*推荐/ });
  await expect(gifOption).toBeEnabled();
  await expect(videoOption).toBeEnabled();

  await press(gifOption);
  const shareSheet = page.getByRole("dialog", { name: "分享战术动画" });
  await expect(shareSheet).toBeVisible();
  await expect(shareSheet).toContainText(/只在这台设备生成.*不会上传/);
  const gifPreview = shareSheet.getByRole("img", { name: "战术动态图预览" });
  await expect(gifPreview).toBeVisible({ timeout: 30_000 });
  const gifBytes = await gifPreview.evaluate(async (image) => {
    const response = await fetch((image as HTMLImageElement).src);
    return Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 6));
  });
  expect(String.fromCharCode(...gifBytes)).toBe("GIF89a");
  await press(shareSheet.getByRole("button", { name: "分享动态图", exact: true }));
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __sharedMedia?: { name: string } }).__sharedMedia?.name)).toMatch(/\.gif$/);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new DOMException("cancelled", "AbortError"); } }));
  await press(shareSheet.getByRole("button", { name: "分享动态图", exact: true }));
  await expect(shareSheet.getByRole("status")).toContainText(/已取消分享.*可以下载/);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => { throw new Error("share failed"); } }));
  await press(shareSheet.getByRole("button", { name: "分享动态图", exact: true }));
  await expect(shareSheet.getByRole("alert")).toContainText("这次没有分享成功，请重试或下载到设备");
  const gifDownload = page.waitForEvent("download");
  await press(shareSheet.getByRole("button", { name: "下载到设备", exact: true }));
  expect((await gifDownload).suggestedFilename()).toMatch(/\.gif$/);
  await expect(shareSheet.getByRole("alert")).toHaveCount(0);
  await expect(shareSheet.getByRole("status")).toContainText("已开始下载，请查看浏览器下载项");

  await press(shareSheet.getByRole("button", { name: "换一种格式", exact: true }));
  await press(shareSheet.getByRole("button", { name: /分享球路视频.*推荐/ }));
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
  const canvas = currentBoardCanvas(page);
  await dragBoardPoint(page, canvas, starterPoint("网球"), [.70, .25]);

  // Legacy files may contain zero duration; the removed duration UI must not
  // be reintroduced just to create this fixture.
  const legacy = await saveAndRead(page);
  legacy.frames.forEach(frame => { frame.duration = 0; });
  await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] })), { key: STORAGE_KEY, board: legacy });
  await page.reload();
  await openDraftFromLibrary(page, legacy.title);

  await press(page.getByRole("button", { name: /打开我的战术板的画板菜单/ }));
  const files = page.getByTestId("bottom-sheet");
  await press(files.getByRole("button", { name: /保存与分享/ }));
  const video = files.getByRole("button", { name: /分享球路视频.*推荐/ });
  const gif = files.getByRole("button", { name: /分享动态图/ });
  await expect(video).toBeDisabled();
  await expect(gif).toBeDisabled();
  await expect(video).toContainText("0.0 秒");
  await expect(gif).toContainText("0.0 秒");
});

test("shows validation failures inside the active sheet", async ({ page }) => {
  await openBoard(page);

  await press(page.getByRole("button", { name: /打开我的战术板的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /^修改名称/ }));
  const rename = page.getByTestId("board-rename-layer");
  const title = rename.getByRole("textbox", { name: "画板名称" });
  await title.fill("");
  await press(rename.getByRole("button", { name: "完成", exact: true }));
  await expect(rename).toBeVisible();
  await expect(rename.getByRole("alert")).toContainText(/画板名称|畫板名稱|不能留空/);

  await title.fill("我的战术板");
  await press(rename.getByRole("button", { name: "完成", exact: true }));
  await expect(rename).toBeHidden();

  await press(page.getByRole("button", { name: /打开我的战术板的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: "broken-board.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not-json"),
  });
  const importFailure = page.getByRole("alert");
  await expect(importFailure).toContainText("这个备份打不开，请换一个文件重试");
  await expect(importFailure.getByRole("button", { name: "重新选择", exact: true })).toBeVisible();
});

test("announces automatic saves without exposing a clickable manual-save status", async ({ page }) => {
  await openBoard(page);
  const opponentStart = starterPoint("对手");
  const live = page.getByTestId("board-save-live");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveAttribute("aria-atomic", "true");
  await expect(live).toHaveText("画板修改后保存");
  await expect.poll(async () => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();

  await clickBoardPoint(page, currentBoardCanvas(page), opponentStart);
  await dragBoardPoint(page, currentBoardCanvas(page), opponentStart, [.56, .25]);
  await expect(live).toHaveText("画板已保存", { timeout: 3000 });
  const opponent = (await readLatest(page)).actors.find((actor) => actor.label === "对手")!;
  await expect
    .poll(async () => (await readLatest(page)).frames[0].paths.find(path => path.actorId === opponent.id)?.to[0])
    .toBeGreaterThan(.5);
  await expect(page.locator(".board-save-status")).toContainText("已保存");
  await expect(page.locator("button.board-save-status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(已保存|待保存|保存中)$/ })).toHaveCount(0);
});

test("keeps an edited board open when edge-back cannot save", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype,"setItem",{
      configurable:true,
      value:()=>{throw new DOMException("Storage blocked","QuotaExceededError");},
    });
  });

  await dragBoardPoint(page,currentBoardCanvas(page),starterPoint("网球"),[.70,.25]);
  await swipeBoardFromLeftEdge(page);

  await expect(currentBoardCanvas(page)).toBeVisible();
  await expect(currentBoardGuide(page)).toContainText("这次修改尚未保存，请重试");
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toHaveCount(0);
});

test("keeps board library available without saving an untouched template", async ({ page }) => {
  test.slow();
  await openBoard(page);
  await dragBoardPoint(page, currentBoardCanvas(page), starterPoint("网球"), [.70, .25]);
  let saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(2);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);

  await press(page.getByRole("button", { name: /打开我的战术板的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "草稿与模板", exact:true })).toBeVisible();
  await press(page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: "我的战术板" }));
  await waitForFlowSettled(page);
  await expect(currentBoardCanvas(page)).toBeVisible();
  await press(page.getByRole("button", { name: "返回上一页" }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "草稿与模板", exact:true })).toBeVisible();
  await press(page.getByRole("button", { name: "返回上一页", exact:true }));
  await waitForFlowSettled(page);
  await expect(currentBoardCanvas(page)).toBeVisible();
  await press(page.getByRole("button", { name: "返回上一页" }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact:true })).toBeVisible();
  await press(page.getByRole("button", { name: "找个打法", exact:true }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "先稳住", exact:true }));
  await press(page.getByRole("button", { name: /^防守高深回中，9秒/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "改成我的打法" }));
  await waitForFlowSettled(page);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);
  await expect(page.getByTestId("board-save-live")).toHaveText("画板修改后保存");
  const draftsAfterTemplateVisit = await readLatest(page);
  expect(draftsAfterTemplateVisit.id).toBe(saved.id);
  expect(draftsAfterTemplateVisit.frames).toEqual(saved.frames);
  await expect(page.getByRole("button", { name: "看怎么练" })).toHaveCount(0);
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

  for (const control of await editorDock(page).getByRole("button").all()) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.round(bounds!.height)).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({ path: testInfo.outputPath("court-board-public-mobile.png") });
  expect(consoleErrors).toEqual([]);
});
