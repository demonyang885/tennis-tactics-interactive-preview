import { waitForWorkspace, expandBoardTools, openBoardSettings, openWorkspaceLibrary, openTacticCatalogue } from "./workspace-navigation";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createBlankBoard, getShotDurationForPace, type BoardDocument, type Point } from "../src/board/model";
import { getBoardGeometry, pointOnBoardPath } from "../src/board/render";
import { BOARD_IMPORT_MAX_CHARACTERS } from "../src/board/validate";

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
  if (!await locator.isVisible() && /撤销|重做|画板菜单|查看画板操作说明/.test(locator.toString())) {
    if (/查看画板操作说明/.test(locator.toString())) await openBoardSettings(locator.page());
    else await expandBoardTools(locator.page());
  }
  await expect(locator).toBeVisible();
  await locator.click();
}

async function waitForFlowSettled(page: Page) {
  await expect(page.getByTestId("flow-current")).toHaveCount(1);
  await expect.poll(async () => page.getByTestId("flow-current").evaluateAll((elements) => {
    if (elements.length !== 1) return Infinity;
    const transform = new DOMMatrixReadOnly(getComputedStyle(elements[0]).transform);
    return Math.abs(transform.m41);
  })).toBeLessThan(1);
}

async function openBoard(page: Page) {
  await waitForWorkspace(page);
  await expect(currentBoardCanvas(page)).toBeVisible();
  await waitForFlowSettled(page);
}

async function openDraftFromLibrary(page: Page, title: string) {
  await openBoard(page);
  await openBoardSettings(page);
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
  await expect(addButton(page)).toBeVisible();
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

function expectDraggedCoordinate(actual: number | undefined, expected: number) {
  // WebKit rounds subpixel mouse positions differently from Chromium; this remains under one canvas pixel.
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(.0025);
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
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toHaveText("画板已保存", { timeout: 3_000 });
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
  await waitForWorkspace(page);
});

test("uses the icon-only dock hierarchy and keeps direct canvas editing available", async ({ page }) => {
  await openBoard(page);
  const dock = editorDock(page);
  const adjust = addButton(page);
  const play = playButton(page);
  const remove = dock.getByRole("button", { name: "删除网球", exact: true });

  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button")).toHaveCount(5);
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

  await page.reload();
  await openBoard(page);
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[0]).toBeCloseTo(.68, 1);
});

test("writes a court note in a keyboard-safe dialog without shrinking the court", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  const palette = await openAddPalette(page);
  await expect(palette.getByRole("button", { name: "我方球员" })).toContainText("我方");
  await expect(palette.getByRole("button", { name: "对手球员" })).toContainText("对手");
  await press(palette.getByRole("button", { name: "文字备注" }));
  const courtHeight = await page.locator(".board-canvas-shell").evaluate(element => element.getBoundingClientRect().height);
  await clickBoardPoint(page, currentBoardCanvas(page), [.50, .48]);
  const editor = page.getByTestId("board-inline-note-editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "画板备注" })).toBeFocused();
  await expect(page.locator(".board-editor")).toHaveClass(/is-note-editing/);
  await expect(page.locator(".board-edit-dock")).toBeHidden();
  await expect(page.getByTestId("board-learning-entry")).toBeHidden();
  await expect(editor).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("dialog", { name: "这一拍的发现" })).toHaveCount(0);
  await editor.getByRole("button", { name: "先回位" }).click();
  await expect(editor.getByRole("textbox", { name: "画板备注" })).toHaveValue("先回位");
  await page.setViewportSize({ width: 390, height: 420 });
  await expect.poll(() => page.locator(".board-canvas-shell").evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(courtHeight, 0);
  await expect.poll(() => editor.evaluate(element => {
    const input = element.querySelector<HTMLInputElement>("input")!.getBoundingClientRect();
    const save = element.querySelector<HTMLButtonElement>("button[data-note-save]")!.getBoundingClientRect();
    return input.top >= 0 && input.bottom <= window.innerHeight && save.bottom <= window.innerHeight;
  })).toBe(true);
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(editor).toHaveCount(0);
  const saved = await saveAndRead(page);
  const note = saved.frames[0].marks.find(mark => mark.kind === "text" && mark.text === "先回位");
  expect(note?.position[0]).toBeCloseTo(.50, 1);
  expect(note?.position[1]).toBeCloseTo(.48, 1);
  await page.reload();
  await openDraftFromLibrary(page, saved.title);
  const restored = await saveAndRead(page);
  expect(restored.frames[0].marks.some(mark => mark.kind === "text" && mark.text === "先回位")).toBe(true);
});

test("cancelling a court note creates no draft, and tapping a saved note edits it in place", async ({ page }) => {
  await openBoard(page);
  await chooseAddItem(page, /文字备注/);
  await clickBoardPoint(page, currentBoardCanvas(page), [.50, .48]);
  const editor = page.getByTestId("board-inline-note-editor");
  await editor.getByRole("textbox", { name: "画板备注" }).fill("先看空当");
  await editor.getByRole("button", { name: "取消备注" }).click();
  expect(await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();

  await chooseAddItem(page, /文字备注/);
  await clickBoardPoint(page, currentBoardCanvas(page), [.50, .48]);
  await editor.getByRole("textbox", { name: "画板备注" }).fill("先看空当");
  await editor.getByRole("button", { name: "保存" }).click();
  await clickBoardPoint(page, currentBoardCanvas(page), [.50, .48]);
  await expect(editor.getByRole("textbox", { name: "画板备注" })).toHaveValue("先看空当");
  await editor.getByRole("textbox", { name: "画板备注" }).fill("下一拍抢空当");
  await editor.getByRole("button", { name: "保存" }).click();
  const saved = await saveAndRead(page);
  expect(saved.frames[0].marks.filter(mark => mark.kind === "text")).toMatchObject([{ text: "下一拍抢空当" }]);
  await expect(page.getByRole("button", { name: "记住这一拍" })).toHaveCount(0);
});

test("a failed court-note save stays visibly unsaved and can be retried", async ({ page }) => {
  await openBoard(page);
  await chooseAddItem(page, /文字备注/);
  await clickBoardPoint(page, currentBoardCanvas(page), [.50, .48]);
  const editor = page.getByTestId("board-inline-note-editor");
  await editor.getByRole("textbox", { name: "画板备注" }).fill("看对手站位");
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) throw new DOMException("storage full", "QuotaExceededError");
      return original.call(this, name, value);
    };
    (window as Window & { restoreNoteStorage?: () => void }).restoreNoteStorage = () => { Storage.prototype.setItem = original; };
  }, STORAGE_KEY);
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(editor).toBeVisible();
  await expect(page.locator(".board-toast.is-error")).toHaveCount(0);
  await expect(page.getByTestId("board-save-live")).toContainText("未保存");
  await page.evaluate(() => (window as Window & { restoreNoteStorage?: () => void }).restoreNoteStorage?.());
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(editor).toHaveCount(0);
  const saved = await saveAndRead(page);
  expect(saved.frames[0].marks.filter(mark => mark.kind === "text")).toMatchObject([{ text: "看对手站位" }]);
});

test("cancelling after a failed note save leaves no hidden draft or delayed note", async ({ page }) => {
  await openBoard(page);
  await chooseAddItem(page, /文字备注/);
  await clickBoardPoint(page, currentBoardCanvas(page), [.50, .48]);
  const editor = page.getByTestId("board-inline-note-editor");
  await editor.getByRole("textbox", { name: "画板备注" }).fill("这句不要留下");
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === key) throw new DOMException("storage full", "QuotaExceededError");
      return original.call(this, name, value);
    };
    (window as Window & { restoreNoteStorage?: () => void }).restoreNoteStorage = () => { Storage.prototype.setItem = original; };
  }, STORAGE_KEY);
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "取消备注" }).click();
  await page.evaluate(() => (window as Window & { restoreNoteStorage?: () => void }).restoreNoteStorage?.());
  await page.waitForTimeout(900);
  expect(await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect(page.getByTestId("board-save-live")).not.toContainText("未保存");
});

test("iPhone-sized touch flow keeps note input and save above the keyboard viewport", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const phone = await context.newPage();
  try {
    await phone.goto("/");
    await phone.emulateMedia({ reducedMotion: "reduce" });
    await waitForWorkspace(phone);
    await waitForFlowSettled(phone);
    await expect(currentBoardCanvas(phone)).toBeVisible();
    await addButton(phone).tap();
    const sheet = phone.getByTestId("bottom-sheet");
    await sheet.getByRole("button", { name: "文字备注" }).tap();
    await expect(sheet).toBeHidden();
    const at = await boardScreenPoint(currentBoardCanvas(phone), [.62, .74]);
    await phone.touchscreen.tap(at.x, at.y);
    const editor = phone.getByTestId("board-inline-note-editor");
    await expect(editor).toBeVisible();
    const field = editor.getByRole("textbox", { name: "画板备注" });
    await field.tap();
    await phone.setViewportSize({ width: 390, height: 420 });
    await expect.poll(() => editor.evaluate(element => {
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const input = element.querySelector<HTMLInputElement>("input")!.getBoundingClientRect();
      const save = element.querySelector<HTMLButtonElement>("button[data-note-save]")!.getBoundingClientRect();
      return input.top >= top && input.bottom <= bottom && save.top >= top && save.bottom <= bottom;
    })).toBe(true);
    await phone.setViewportSize({ width: 320, height: 420 });
    await expect.poll(() => editor.evaluate(element => {
      const viewport = window.visualViewport;
      const right = window.innerWidth;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const input = element.querySelector<HTMLInputElement>("input")!.getBoundingClientRect();
      const save = element.querySelector<HTMLButtonElement>("button[data-note-save]")!.getBoundingClientRect();
      return input.left >= 0 && save.right <= right && input.bottom <= bottom && save.bottom <= bottom;
    })).toBe(true);
    await editor.getByRole("button", { name: "看对手站位" }).tap();
    await expect(field).toHaveValue("看对手站位");
    await editor.getByRole("button", { name: "保存" }).tap();
    await expect(editor).toHaveCount(0);
    await phone.setViewportSize({ width: 390, height: 844 });
    const stored = await saveAndRead(phone);
    expect(stored.frames[0].marks.some(mark => mark.kind === "text" && mark.text === "看对手站位")).toBe(true);
    await phone.reload();
    await waitForWorkspace(phone);
    await expect(currentBoardCanvas(phone)).toBeVisible();
    expect((await saveAndRead(phone)).frames[0].marks.some(mark => mark.kind === "text" && mark.text === "看对手站位")).toBe(true);
  } finally {
    await context.close();
  }
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

  await openBoardSettings(page);
  const restoreMenu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  const restoreButton = restoreMenu.getByRole("button", { name: "一区发球", exact: true });
  await expect(restoreButton).toBeEnabled();
  await press(restoreButton);
  await restoreMenu.getByRole("button", { name: "确认替换站位" }).click();
  await expect(canvas).toBeFocused();
  await expect(currentBoardGuide(page)).toContainText(/开局站位已调整，可撤销/);
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
    label: "第 1 拍 · 一区发球",
    paths: [],
    marks: [],
  });
  expect(actorPoint(restored, "我方")).toEqual([.64, 1.02]);
  expect(actorPoint(restored, "对手")).toEqual([.28, -.02]);
  expect(actorPoint(restored, "网球")).toEqual([.64, .98]);
  expect(restored.smartRally).toMatchObject({ phase: "shot" });
  await expect(page.getByRole("button", { name: /^(现在就是发球站位|还原标准发球站位)/ })).toHaveCount(0);

  await press(page.getByRole("button", { name: "撤销", exact: true }));
  let reverted = await saveAndRead(page);
  expect(reverted.id).toBe(beforeRestore.id);
  expect(reverted.title).toBe(beforeRestore.title);
  expect(reverted.actors).toEqual(beforeRestore.actors);
  expect(reverted.frames).toEqual(beforeRestore.frames);
  expect(reverted.smartRally).toEqual(beforeRestore.smartRally);

  await press(page.getByRole("button", { name: "重做", exact: true }));
  restored = await saveAndRead(page);
  expect(restored.actors).toHaveLength(3);
  expect(restored.frames).toHaveLength(1);
  expect(restored.frames[0].paths).toEqual([]);

  await page.reload();
  await openDraftFromLibrary(page, "我的画板");
  restored = await readLatest(page);
  expect(restored.id).toBe(beforeRestore.id);
  expect(restored.actors).toHaveLength(3);
  expect(restored.frames).toHaveLength(1);
  await expect(playButton(page)).toBeDisabled();

  await openBoardSettings(page);
  const files = page.getByTestId("bottom-sheet");
  await expect(files.getByRole("heading", { name: "画板菜单", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "保存与分享", exact: true })).toBeVisible();
  await expect(files.getByRole("button", { name: "一分的发现", exact: true })).toHaveCount(0);
  await expect(files.getByRole("button", { name: "练后发现", exact: true })).toHaveCount(0);
  await expect(files.getByRole("button", { name: /修改名称/ })).toBeVisible();
  await expect(files.getByRole("button", { name: "一区发球", exact: true })).toBeEnabled();
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
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球，画下一拍|接球跑位已记下/);
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
  await expect.poll(async () => (await readLatest(page)).frames[0].paths.find(path => path.kind === "shot")?.control).toBeUndefined();
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

  await openBoardSettings(page);
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
  const landing: Point = [.70, .25];

  // Move the receiver to the incoming landing, then draw the return from the
  // shared ball/player point. A receiver already at the landing now skips the
  // movement phase, which is covered by v032-rally-authoring.spec.ts.
  await dragBoardPoint(page, board, ballStart, landing);
  await expect(currentBoardGuide(page)).toContainText(/拖动接球球员.*画出跑位/);

  await dragBoardPoint(page, board, receiverPoint, landing);
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球，画下一拍|接球跑位已记下/);
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球.*画下一拍/);
  let saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].paths.map((path) => path.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((path) => path.kind === "move")).toMatchObject({ actorId: opponent.id });
  expect(saved.frames[1].paths).toEqual([]);
  expect(saved.frames[1].poses[opponent.id]).toEqual(saved.frames[1].poses[ball.id]);

  await dragBoardPoint(page, board, landing, [.32, .75]);
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
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球，画下一拍|接球跑位已记下/);
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
  test.slow();
  await openLegacyEmptyBoard(page);
  await openBoardSettings(page);
  await page.getByRole("switch", { name: "二段跑位，已关", exact: true }).click();
  await page.keyboard.press("Escape");
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
  await expect(play).toHaveAccessibleName(new RegExp(`${saved.frames[0].duration.toFixed(1).replace(".", "\\.")}\\s*秒`));

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

test("undo restores the prior receiving route after a single-stage correction", async ({ page }) => {
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
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球，画下一拍|接球跑位已记下/);

  let saved = await saveAndRead(page);
  expect(saved.smartRally).toMatchObject({ phase: "shot" });
  expect(saved.frames[0].paths.filter(path => path.kind === "move")).toHaveLength(1);
  expect(saved.frames[0].paths.find(path => path.kind === "move")?.to[0]).toBeCloseTo(.66, 1);
  expect(saved.frames[1].paths).toEqual([]);

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
  expectDraggedCoordinate(manualMove?.to[0], .48);
  expectDraggedCoordinate(manualMove?.to[1], .24);

  await page.reload();
  await openDraftFromLibrary(page, "我的画板");
  await expect(currentBoardCanvas(page)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const reopened = await saveAndRead(page);
  expect(reopened.smartRally).toBeUndefined();
  expect(reopened.frames[0].paths).toEqual(manual.frames[0].paths);

  await openBoardSettings(page);
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
  for (const label of [/^我方球员$/, /^对手球员$/, /^网球$/, /^画球路$/, /^画跑位$/, /^喂球路线$/, /^目标区$/, /^标志碟$/, /^球筐$/, /^文字备注$/, /^自由笔$/]) {
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
  await openBoardSettings(page);
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
  test.slow();
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
  expectDraggedCoordinate(firstRoute?.to[0], firstLanding[0]);
  expectDraggedCoordinate(firstRoute?.to[1], firstLanding[1]);
  expect(saved.frames).toHaveLength(2);
  expectDraggedCoordinate(saved.frames[1].poses[ball.id][0], firstLanding[0]);
  expectDraggedCoordinate(saved.frames[1].poses[ball.id][1], firstLanding[1]);
  expect(saved.frames[1].paths).toEqual([]);
  await expectPathClearlyVisible(canvas, firstRoute!, "shot", "the pure blank board must keep its first route visible on the next beat");

  await dragBoardPoint(page, canvas, opponentStart, opponentEnd);
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球，画下一拍|接球跑位已记下/);
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
  expectDraggedCoordinate(secondRoute?.from[0], firstLanding[0]);
  expectDraggedCoordinate(secondRoute?.from[1], firstLanding[1]);
  expectDraggedCoordinate(secondRoute?.to[0], secondLanding[0]);
  expectDraggedCoordinate(secondRoute?.to[1], secondLanding[1]);
  expectDraggedCoordinate(saved.frames[2].poses[ball.id][0], secondLanding[0]);
  expectDraggedCoordinate(saved.frames[2].poses[ball.id][1], secondLanding[1]);

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
  await openBoardSettings(page);
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
  await openBoardSettings(page);
  const menu = page.getByTestId("bottom-sheet");
  await expect(menu.getByRole("button", { name: "一区发球", exact: true })).toBeEnabled();
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
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球，画下一拍|接球跑位已记下/);
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
  expectDraggedCoordinate(saved.frames[2].poses.ball[0], .32);
  expectDraggedCoordinate(saved.frames[2].poses.ball[1], .75);
});

test("playback counts a synchronized opening shot and receiver movement as one beat", async ({ page }) => {
  await openBoard(page);
  const play = playButton(page);
  const board = currentBoardCanvas(page);

  await dragBoardPoint(page, board, starterPoint("网球"), [.70, .25]);
  await dragBoardPoint(page, board, starterPoint("对手"), [.66, .34]);
  await expect(currentBoardGuide(page)).toContainText(/再拖动网球，画下一拍|接球跑位已记下/);

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
  expect(center.scale).toBeCloseTo(1, 3);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 4, center.y);
  await page.mouse.up();
  await expandBoardTools(page);
  await expect(undo).toBeDisabled();
  await expect(currentBoardGuide(page)).toContainText("对手");

  await dragBoardPoint(page, board, actorStart, [.70, .30], [7, 4]);
  await expandBoardTools(page);
  await expect(undo).toBeEnabled();
  let saved = await saveAndRead(page);
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[0]).toBeCloseTo(.70, 1);
  expect(saved.frames[0].paths.find(path => path.actorId === opponent.id)?.to[1]).toBeCloseTo(.30, 1);

  await press(undo);
  saved = await saveAndRead(page);
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(actorStart[0], 2);
  expect(saved.frames[0].poses[opponent.id][1]).toBeCloseTo(actorStart[1], 2);
  await expandBoardTools(page);
  await expect(undo).toBeDisabled();
});

test("renames in a dedicated keyboard-safe layer and restores focus to its opener", async ({ page }) => {
  await openBoard(page);
  await expect.poll(async () => page.locator(".flow-screen").evaluateAll((screens) => screens
    .filter((screen) => screen.getAttribute("data-flow-current") !== "true")
    .every((screen) => screen.hasAttribute("inert") && screen.getAttribute("aria-hidden") === "true"))).toBe(true);

  const menuTrigger = page.locator("[data-dock-expand]");
  const stageTransform = await page.locator(".phone-stage").evaluate((element) => getComputedStyle(element).transform);
  await openBoardSettings(page);
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

  await clickBoardPoint(page, canvas, [.96, .48]);
  const history = editorDock(page).getByRole("button", { name: /打开拍次，当前第 2 拍/ });
  const historyBounds = await history.boundingBox();
  expect(historyBounds).not.toBeNull();
  expect(historyBounds!.width).toBeGreaterThanOrEqual(44);
  expect(historyBounds!.height).toBeGreaterThanOrEqual(44);
  await expect(history).toHaveText("");

  await openBoardSettings(page);
  const menu = page.getByRole("dialog", { name: "画板菜单" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "保存与分享", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "一分的发现", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "练后发现", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "一区发球", exact: true })).toBeEnabled();
  await page.getByTestId("sheet-overlay").click({ position: { x: 20, y: 20 } });
  await expect(menu).toBeHidden();
  await expect(editor).toHaveAttribute("data-immersive", "true");

  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await expect(page.locator(".board-library")).toBeVisible();
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

  await openBoardSettings(page);
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet.getByRole("heading", { name: "画板菜单", exact: true })).toBeVisible();
  await press(sheet.getByRole("button", { name: /保存与分享/ }));
  await expect(sheet.getByRole("heading", { name: "保存与分享", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /立即保存/ })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /^备份画板/ })).toBeVisible();
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

  await page.evaluate(() => {
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      URL.createObjectURL = createObjectURL;
      throw new Error(`test download unavailable: ${blob.type}`);
    };
  });
  await press(shareSheet.getByRole("button", { name: "下载到设备", exact: true }));
  await expect(shareSheet.getByRole("alert")).toContainText("这次动态图没有下载，请重试");
  await expect(shareSheet).not.toContainText("已开始下载，请查看浏览器下载项");

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
  await page.evaluate(() => {
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      URL.createObjectURL = createObjectURL;
      throw new Error(`test download unavailable: ${blob.type}`);
    };
  });
  await press(shareSheet.getByRole("button", { name: "下载到设备", exact: true }));
  await expect(shareSheet.getByRole("alert")).toContainText("这次球路视频没有下载，请重试");

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

  await openBoardSettings(page);
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

  await openBoardSettings(page);
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /^修改名称/ }));
  const rename = page.getByTestId("board-rename-layer");
  const title = rename.getByRole("textbox", { name: "画板名称" });
  await title.fill("");
  await press(rename.getByRole("button", { name: "完成", exact: true }));
  await expect(rename).toBeVisible();
  await expect(rename.getByRole("alert")).toContainText(/画板名称|畫板名稱|不能留空/);

  await title.fill("我的画板");
  await press(rename.getByRole("button", { name: "完成", exact: true }));
  await expect(rename).toBeHidden();

  await openBoardSettings(page);
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

test("imports and reopens a v0.2 backup larger than the old two-million-character limit", async ({ page }) => {
  test.slow();
  const base = createBlankBoard("可恢复的旧版大画板");
  const board: BoardDocument = {
    ...base,
    frames: Array.from({ length: 30 }, (_, frameIndex) => ({
      ...base.frames[0],
      id: `frame-${frameIndex}`,
      label: `第 ${frameIndex + 1} 拍`,
      marks: Array.from({ length: 100 }, (_, markIndex) => ({
        id: `mark-${frameIndex}-${markIndex}`,
        kind: "text" as const,
        position: [.5, .5] as Point,
        text: "回位".repeat(300),
      })),
    })),
  };
  const backup = JSON.stringify(board, null, 2);
  expect(backup.length).toBeGreaterThan(2_000_000);

  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: "v0.2-large-board.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(currentBoardCanvas(page)).toBeVisible();
  const stored = await readLatest(page);
  expect(stored.title).toBe("可恢复的旧版大画板（导入）");
  expect(stored.frames).toHaveLength(30);
  expect(stored.frames[29].marks).toHaveLength(100);

  await page.reload();
  await openDraftFromLibrary(page, stored.title);
  await expect(currentBoardCanvas(page)).toBeVisible();
  expect((await readLatest(page)).frames[29].marks).toHaveLength(100);
});

test("rejects an oversized backup without changing an existing board", async ({ page }) => {
  await openBoard(page);
  const opponentStart = starterPoint("对手");
  await clickBoardPoint(page, currentBoardCanvas(page), opponentStart);
  await dragBoardPoint(page, currentBoardCanvas(page), opponentStart, [.56, .25]);
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toHaveText("画板已保存");
  const before = await readLatest(page);

  await openBoardSettings(page);
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: "oversized-board.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(BOARD_IMPORT_MAX_CHARACTERS + 1, 32),
  });
  await expect(page.getByRole("alert")).toContainText("备份文件过大，未导入");
  expect(await readLatest(page)).toEqual(before);

  await page.reload();
  await openDraftFromLibrary(page, before.title);
  expect(await readLatest(page)).toEqual(before);
});

test("imports a large UTF-8 backup without reading the whole file at once", async ({ page }) => {
  const board = createBlankBoard("多位元组备份");
  const backup = JSON.stringify({
    kind: "rallypath-board-backup",
    version: 1,
    board,
    unusedDescription: "界".repeat(5_500_000),
  });
  expect(backup.length).toBeLessThan(BOARD_IMPORT_MAX_CHARACTERS);
  expect(Buffer.byteLength(backup)).toBeGreaterThan(BOARD_IMPORT_MAX_CHARACTERS);

  await page.evaluate((threshold) => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.size > threshold) throw new Error("whole-file read disabled for large imports");
      return original.call(this);
    };
  }, BOARD_IMPORT_MAX_CHARACTERS);

  await openWorkspaceLibrary(page);
  await waitForFlowSettled(page);
  await page.getByTestId("flow-current").locator('input[type="file"]').setInputFiles({
    name: "large-utf8-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(currentBoardCanvas(page)).toBeVisible();
  expect((await readLatest(page)).title).toBe("多位元组备份（导入）");
});

test("announces automatic saves without exposing a clickable manual-save status", async ({ page }) => {
  await openBoard(page);
  const opponentStart = starterPoint("对手");
  const live = page.getByTestId("flow-current").getByTestId("board-save-live");
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

test("keeps a just-finished board edit when the tab closes before autosave", async ({ page, context }) => {
  await openBoard(page);
  await dragBoardPoint(page, currentBoardCanvas(page), starterPoint("对手"), [.56, .25]);
  // Leave immediately after pointerup, without waiting for the 700 ms debounce or a save label.
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto("/");
  await openDraftFromLibrary(reopened, "我的画板");
  const stored = await readLatest(reopened);
  const opponent = stored.actors.find((actor) => actor.label === "对手")!;
  expect(stored.frames[0].paths.find((path) => path.actorId === opponent.id)?.to[0]).toBeCloseTo(.56, 1);
  expect(stored.frames[0].paths.find((path) => path.actorId === opponent.id)?.to[1]).toBeCloseTo(.25, 1);
  expect(await reopened.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null")?.boards.length, STORAGE_KEY)).toBe(1);
});

test("flushes a just-finished board edit on the hidden-page event", async ({ page }) => {
  await openBoard(page);
  await dragBoardPoint(page, currentBoardCanvas(page), starterPoint("对手"), [.56, .25]);

  // Playwright's headless tab activation does not change visibilityState on this host.
  // Keep the edit in the normal UI, then simulate only the standard page lifecycle event.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), { timeout: 400 }).not.toBeNull();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toHaveText("画板已保存");
  const stored = await readLatest(page);
  const opponent = stored.actors.find((actor) => actor.label === "对手")!;
  expect(stored.frames[0].paths.find((path) => path.actorId === opponent.id)?.to[0]).toBeCloseTo(.56, 1);
});

test("does not claim a hidden-page edit was saved when browser storage rejects it", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: () => { throw new DOMException("Storage blocked", "QuotaExceededError"); },
    });
  });
  await dragBoardPoint(page, currentBoardCanvas(page), starterPoint("对手"), [.56, .25]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toContainText("未保存", { timeout: 400 });
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
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

  await openBoardSettings(page);
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "草稿与模板", exact:true })).toBeVisible();
  await press(page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: "我的画板" }));
  await waitForFlowSettled(page);
  await expect(currentBoardCanvas(page)).toBeVisible();
  await openWorkspaceLibrary(page);
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForWorkspace(page);
  await openTacticCatalogue(page);
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: /^防守高深回中，9秒/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "改成我的打法" }));
  await waitForFlowSettled(page);
  await expect(page.locator(".board-frame-rail")).toHaveCount(0);
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toHaveText("画板修改后保存");
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
