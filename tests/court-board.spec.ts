import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { BoardDocument, Point } from "../src/board/model";

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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "网球战术" })).toBeVisible();
});

test("uses the three-control Court Canvas hierarchy and restores direct manipulation", async ({ page }) => {
  await openBoard(page);
  const dock = editorDock(page);
  const objects = objectButton(page);
  const add = addButton(page);
  const play = playButton(page);

  await expect(dock).toBeVisible();
  await expect(objects).toBeVisible();
  await expect(add).toBeVisible();
  await expect(play).toBeVisible();
  await expect(play).toContainText(/1\s*拍/);
  await expect(play).toContainText(/1\.5\s*秒/);
  await expect(play).toBeDisabled();
  await expect(dock.getByRole("button", { name: /^(选择|球员|球路|跑位|标记)$/ })).toHaveCount(0);
  await expectObjectState(page);

  await press(objects);
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet.getByRole("button", { name: "选择我方", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "选择对手", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "选择网球", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(objects).toBeFocused();

  const board = page.getByTestId("board-canvas");
  await dragBoardPoint(page, board, [.46, .18], [.68, .28]);
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

test("offers one unified add palette and actor placement is one-shot", async ({ page }) => {
  test.slow();
  await openBlankBoard(page);
  const board = page.getByTestId("board-canvas");
  const palette = await openAddPalette(page);

  for (const label of [/^我方球员/, /^对手球员/, /^网球 点/, /^画球路/, /^画跑位/, /^标记与器材/]) {
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
  await expect(page.locator(".board-canvas-meta")).toContainText("我方");
  await expect(page.getByRole("button", { name: /用.*画跑位/ })).toBeVisible();

  let saved = await saveAndRead(page);
  expect(saved.actors).toHaveLength(1);
  const player = saved.actors[0];

  await dragBoardPoint(page, board, [.62, .82], [.42, .64]);
  saved = await saveAndRead(page);
  expect(saved.actors).toHaveLength(1);
  expect(saved.actors[0].id).toBe(player.id);
  expect(saved.frames[0].poses[player.id][0]).toBeCloseTo(.42, 1);
  expect(saved.frames[0].poses[player.id][1]).toBeCloseTo(.64, 1);

  await chooseAddItem(page, /^我方球员/);
  await clickBoardPoint(page, board, [.70, .72]);
  await expectObjectState(page);
  saved = await saveAndRead(page);
  expect(saved.actors).toHaveLength(2);

  await press(objectButton(page));
  const objects = page.getByTestId("bottom-sheet");
  await expect(objects.getByText("我方 1/2", { exact: true })).toBeVisible();
  await expect(objects.getByText("我方 2/2", { exact: true })).toBeVisible();
  await expect(objects.getByRole("button", { name: /选择我方 1\/2/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /选择我方 2\/2/ })).toBeVisible();
});

test("selected duplicate actor owns its contextual path and returns to object mode", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");

  await chooseAddItem(page, /^网球 点/);
  await clickBoardPoint(page, board, [.78, .72]);
  let saved = await saveAndRead(page);
  const balls = saved.actors.filter((actor) => actor.kind === "ball");
  expect(balls).toHaveLength(2);

  await clickBoardPoint(page, board, [.34, .72]);
  await expect(page.locator(".board-canvas-meta")).toContainText("网球 1/2");
  const drawShot = page.getByRole("button", { name: /用.*画球路/ });
  await expect(drawShot).toBeVisible();
  await press(drawShot);
  await expect(page.locator(".board-canvas-meta")).toContainText(/按住网球.*拖/);

  await dragBoardPoint(page, board, [.78, .72], [.78, .28]);
  await expect(page.getByRole("alert")).toContainText("请从已选中的网球开始拖动");
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths).toHaveLength(0);

  await dragBoardPoint(page, board, [.34, .72], [.70, .25]);
  await expectObjectState(page);
  await expect(playButton(page)).toBeEnabled();

  await clickBoardPoint(page, board, [.46, .18]);
  await expect(page.locator(".board-canvas-meta")).toContainText("对手");
  const drawMove = page.getByRole("button", { name: /用.*画跑位/ });
  await expect(drawMove).toBeVisible();
  await press(drawMove);
  await expect(page.locator(".board-canvas-meta")).toContainText(/按住已选球员.*拖/);
  await dragBoardPoint(page, board, [.46, .18], [.66, .34]);
  await expectObjectState(page);

  saved = await saveAndRead(page);
  expect(saved.frames[0].paths.map((item) => item.kind).sort()).toEqual(["move", "shot"]);
  expect(saved.frames[0].paths.find((item) => item.kind === "shot")?.actorId).toBe(balls[0].id);
  expect(saved.frames[0].paths.find((item) => item.kind === "shot")?.actorId).not.toBe(balls[1].id);
  expect(saved.frames[0].paths.find((item) => item.kind === "shot")?.to[0]).toBeCloseTo(.70, 1);
  expect(saved.frames[0].paths.find((item) => item.kind === "move")?.to[0]).toBeCloseTo(.66, 1);
});

test("frames have explicit edit and add controls, carry positions, and keep the active frame visible", async ({ page }) => {
  test.slow();
  await openBoard(page);
  const boardCanvas = page.getByTestId("board-canvas");
  await clickBoardPoint(page, boardCanvas, [.34, .72]);
  await press(page.getByRole("button", { name: /用.*画球路/ }));
  await dragBoardPoint(page, boardCanvas, [.34, .72], [.70, .25]);

  const editFrame = page.getByRole("button", { name: "编辑第 1 拍", exact: true });
  const addFrame = page.getByRole("button", { name: "新增一拍，从当前拍结束位置开始", exact: true });
  await expect(editFrame).toBeVisible();
  await expect(addFrame).toBeVisible();
  expect(Math.round((await editFrame.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  expect(Math.round((await addFrame.boundingBox())!.height)).toBeGreaterThanOrEqual(44);

  await press(editFrame);
  const frameSheet = page.getByTestId("bottom-sheet");
  await expect(frameSheet.getByRole("heading", { name: "第 1 拍" })).toBeVisible();
  const duration = frameSheet.locator('.board-field input[inputmode="decimal"]');
  await duration.fill("2.5");
  await press(frameSheet.getByRole("button", { name: "完成", exact: true }));
  await expect(frameSheet).toBeHidden();
  await expect(editFrame).toBeFocused();

  await press(addFrame);
  await expect(page.getByText("已新增第 2 拍，从上一拍结束位置开始。", { exact: true })).toBeVisible();
  await expectObjectState(page);
  let saved = await saveAndRead(page);
  const ball = saved.actors.find((actor) => actor.kind === "ball")!;
  expect(saved.frames[1].poses[ball.id][0]).toBeCloseTo(.70, 1);
  expect(saved.frames[1].poses[ball.id][1]).toBeCloseTo(.25, 1);
  expect(saved.frames[1].paths).toEqual([]);

  for (let total = 3; total <= 5; total += 1) {
    await press(addFrame);
    await expect(page.getByText(`已新增第 ${total} 拍，从上一拍结束位置开始。`, { exact: true })).toBeVisible();
  }

  const active = page.locator(".board-frame-track [data-frame-active='true']");
  await expect(active).toHaveAttribute("data-frame-index", "4");
  const [activeBounds, carouselBounds] = await Promise.all([
    active.boundingBox(),
    page.locator(".board-frame-carousel").boundingBox(),
  ]);
  expect(activeBounds).not.toBeNull();
  expect(carouselBounds).not.toBeNull();
  expect(activeBounds!.x).toBeGreaterThanOrEqual(carouselBounds!.x - 1);
  expect(activeBounds!.x + activeBounds!.width).toBeLessThanOrEqual(carouselBounds!.x + carouselBounds!.width + 1);

  saved = await saveAndRead(page);
  expect(saved.frames).toHaveLength(5);
});

test("inserting after an earlier frame keeps generated labels unique and screen order clear", async ({ page }) => {
  await openBoard(page);
  const addFrame = page.getByRole("button", { name: "新增一拍，从当前拍结束位置开始", exact: true });
  await press(addFrame);
  await press(addFrame);

  await press(page.locator(".board-frame-track [data-frame-index='0']"));
  await press(addFrame);
  const saved = await saveAndRead(page);
  const labels = saved.frames.map((frame) => frame.label);
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels).toEqual([
    "第 1 拍 · 起始站位",
    "第 2 拍",
    "第 3 拍",
    "第 4 拍",
  ]);

  const frameButtons = page.locator(".board-frame-track [data-frame-index]");
  await expect(frameButtons).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(frameButtons.nth(index)).toHaveAttribute("data-frame-index", String(index));
    await expect(frameButtons.nth(index)).toContainText(String(index + 1));
  }
  await expect(page.locator(".board-frame-track [data-frame-active='true']")).toHaveAttribute("data-frame-index", "1");
});

test("playback is gated, disables edge actions, and moves focus into and out of preview", async ({ page }) => {
  await openBoard(page);
  const play = playButton(page);
  await expect(play).toBeDisabled();

  const board = page.getByTestId("board-canvas");
  await clickBoardPoint(page, board, [.34, .72]);
  await press(page.getByRole("button", { name: /用.*画球路/ }));
  await dragBoardPoint(page, board, [.34, .72], [.70, .25]);
  await press(page.getByRole("button", { name: "新增一拍，从当前拍结束位置开始", exact: true }));
  await expect(play).toBeEnabled();
  await expect(play).toContainText(/2\s*拍/);
  await expect(play).toContainText(/3\.0\s*秒/);

  await press(play);
  const playback = page.getByTestId("board-playback-dock");
  await expect(playback).toBeVisible();
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
  await expect(page.locator(".board-frame-track [data-frame-active='true']")).toBeFocused();
});

test("scaled direct manipulation keeps grab offset, ignores jitter, and records one undo", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 700 });
  await page.reload();
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  const undo = page.getByRole("button", { name: "撤销" });
  const actorStart: Point = [.46, .18];
  const center = await boardScreenPoint(board, actorStart);
  expect(center.scale).toBeLessThan(1);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 4, center.y);
  await page.mouse.up();
  await expect(undo).toBeDisabled();
  await expect(page.locator(".board-canvas-meta")).toContainText("对手");

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

test("shows validation failures inside the active sheet", async ({ page }) => {
  await openBoard(page);

  await press(page.getByRole("button", { name: "编辑第 1 拍", exact: true }));
  let sheet = page.getByTestId("bottom-sheet");
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
  const live = page.getByTestId("board-save-live");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveAttribute("aria-atomic", "true");
  await expect(live).toHaveText("画板已保存", { timeout: 3000 });

  await dragBoardPoint(page, page.getByTestId("board-canvas"), [.46, .18], [.56, .25]);
  await expect(live).toHaveText("画板保存");
  await expect(live).toHaveText("画板已保存", { timeout: 3000 });
  await expect(page.getByRole("button", { name: "已保存", exact: true })).toHaveClass(/board-save-status/);
});

test("keeps board library and drill handoff available", async ({ page }) => {
  test.slow();
  await openBoard(page);
  await press(page.getByRole("button", { name: "新增一拍，从当前拍结束位置开始", exact: true }));
  await expect(page.locator(".board-frame-track [data-frame-index]")).toHaveCount(2);

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
  await expect(page.locator(".board-frame-track [data-frame-index]")).toHaveCount(5);
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
