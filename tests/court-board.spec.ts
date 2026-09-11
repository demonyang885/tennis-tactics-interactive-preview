import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";
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

test("opens straight into a safe starter board and restores the latest draft", async ({ page }) => {
  await openBoard(page);
  await expect(page.getByRole("button", { name: "打开我的战术板的文件选项" })).toBeVisible();

  const tools = page.getByRole("toolbar", { name: "画板工具" });
  await expect(tools.getByRole("button")).toHaveCount(5);
  for (const label of ["选择", "球员", "球路", "跑位", "标记"]) {
    const button = tools.getByRole("button", { name: label, exact: true });
    await expect(button).toBeVisible();
    expect(Math.round((await button.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  }
  const selectTool = tools.getByRole("button", { name: "选择", exact: true });
  const actorTool = tools.getByRole("button", { name: "球员", exact: true });
  const markTool = tools.getByRole("button", { name: "标记", exact: true });
  await expect(selectTool).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "对象", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "添加", exact: true })).toHaveCount(0);

  await press(selectTool);
  const objects = page.getByTestId("bottom-sheet");
  await expect(objects.getByRole("button", { name: /我方.*球员/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /对手.*球员/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /网球.*网球/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(objects).toBeHidden();
  await expect(selectTool).toBeFocused();

  await press(actorTool);
  await expect(objects.getByRole("button", { name: /^我方球员/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /^对手球员/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /^网球/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(objects).toBeHidden();
  await expect(actorTool).toBeFocused();
  await press(markTool);
  await expect(objects.getByRole("button", { name: /^目标区/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /^喂球路线/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(objects).toBeHidden();
  await expect(markTool).toBeFocused();

  let saved = await saveAndRead(page);
  expect(saved.actors).toHaveLength(3);
  const ball = saved.actors.find((actor) => actor.kind === "ball");
  const ballPoint = ball ? saved.frames[0].poses[ball.id] : undefined;
  const playerPoints = saved.actors.filter((actor) => actor.kind === "player").map((actor) => saved.frames[0].poses[actor.id]);
  expect(ballPoint).toBeDefined();
  expect(playerPoints.every((player) => Math.hypot(player[0] - ballPoint![0], player[1] - ballPoint![1]) > .08)).toBe(true);

  const board = page.getByTestId("board-canvas");
  await dragBoardPoint(page, board, [.46, .18], [.68, .28]);
  saved = await saveAndRead(page);
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(.68, 1);
  expect(saved.frames[0].poses[opponent.id][1]).toBeCloseTo(.28, 1);

  await press(page.getByRole("button", { name: "返回画板列表" }));
  await expect(page.getByRole("heading", { name: "网球战术" })).toBeVisible();
  await waitForFlowSettled(page);
  await openBoard(page);
  const reopened = await saveAndRead(page);
  expect(reopened.id).toBe(saved.id);
  expect(reopened.frames[0].poses[opponent.id][0]).toBeCloseTo(.68, 1);
});

test("isolates inactive screens and keeps board sheets styled and keyboard-safe", async ({ page }) => {
  await openBoard(page);
  await expect.poll(async () => page.locator(".flow-screen").evaluateAll((screens) => screens
    .filter((screen) => screen.getAttribute("data-flow-current") !== "true")
    .every((screen) => screen.hasAttribute("inert") && screen.getAttribute("aria-hidden") === "true"))).toBe(true);
  await expect(page.getByRole("button", { name: /^防守高深回中，9秒/ })).toHaveCount(0);

  const play = page.getByRole("button", { name: /^播放战术/ });
  await expect.poll(async () => play.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.display}|${style.backgroundColor}`;
  })).toBe("flex|rgb(23, 61, 44)");
  const playBounds = await play.boundingBox();
  const screenBounds = await page.getByTestId("device-screen").boundingBox();
  expect(playBounds!.width / screenBounds!.width).toBeGreaterThan(.9);

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

  const board = page.getByTestId("board-canvas");
  await clickBoardPoint(page, board, [.34, .72]);
  await expect(page.locator(".board-canvas-meta > strong")).toHaveText("网球");
  const adjustBall = page.getByRole("button", { name: "调整网球", exact: true });
  await press(adjustBall);
  const nudge = page.getByTestId("bottom-sheet").getByRole("button", { name: "向上" });
  expect(Math.round((await nudge.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(adjustBall).toBeFocused();
});

test("scaled dragging preserves grab offset, ignores jitter, and records one undo", async ({ page }) => {
  await page.setViewportSize({ width: 500, height: 700 });
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
  await expect(page.locator(".board-canvas-meta > strong")).toHaveText("对手");

  await dragBoardPoint(page, board, actorStart, [.70, .30], [7, 4]);
  await expect(undo).toBeEnabled();
  let saved = await saveAndRead(page);
  const opponentActor = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].poses[opponentActor.id][0]).toBeCloseTo(.70, 1);
  expect(saved.frames[0].poses[opponentActor.id][1]).toBeCloseTo(.30, 1);

  await press(undo);
  saved = await saveAndRead(page);
  expect(saved.frames[0].poses[opponentActor.id][0]).toBeCloseTo(actorStart[0], 2);
  expect(saved.frames[0].poses[opponentActor.id][1]).toBeCloseTo(actorStart[1], 2);
  await expect(undo).toBeDisabled();
});

test("creates a blank board, adds objects, redoes, and cancels a drag cleanly", async ({ page }) => {
  test.slow();
  await openBoard(page);
  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "新建纯空白画板" }));
  await waitForFlowSettled(page);

  const board = page.getByTestId("board-canvas");
  const addObject = async (name: string, point: Point) => {
    const entry = ["目标区", "标志碟", "文字提示"].includes(name) ? "标记" : "球员";
    await press(page.getByRole("toolbar", { name: "画板工具" }).getByRole("button", { name: entry, exact: true }));
    const sheet = page.getByTestId("bottom-sheet");
    await press(sheet.getByRole("button", { name: new RegExp(`^${name}`) }));
    await expect(sheet).toBeHidden();
    await clickBoardPoint(page, board, point);
  };

  await addObject("我方球员", [.62, .82]);
  await expect(page.getByRole("button", { name: "球员", exact: true })).toHaveAttribute("aria-pressed", "true");
  await addObject("网球", [.34, .72]);
  await expect(page.getByRole("button", { name: "球员", exact: true })).toHaveAttribute("aria-pressed", "true");
  await addObject("目标区", [.70, .25]);
  await expect(page.getByRole("button", { name: "标记", exact: true })).toHaveAttribute("aria-pressed", "true");

  let saved = await saveAndRead(page);
  expect(saved.actors.map((actor) => actor.kind)).toEqual(["player", "ball"]);
  expect(saved.frames[0].marks).toHaveLength(1);
  await press(page.getByRole("button", { name: "撤销" }));
  await press(page.getByRole("button", { name: "重做" }));
  saved = await saveAndRead(page);
  expect(saved.frames[0].marks).toHaveLength(1);

  await press(page.getByRole("button", { name: "选择", exact: true }));
  await clickBoardPoint(page, board, [.62, .82]);
  const start = await boardScreenPoint(board, [.62, .82]);
  const end = await boardScreenPoint(board, [.42, .64]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await board.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: end.x, clientY: end.y, buttons: 0 });
  await page.mouse.up();

  saved = await saveAndRead(page);
  const player = saved.actors.find((actor) => actor.kind === "player")!;
  expect(saved.frames[0].poses[player.id][0]).toBeCloseTo(.62, 2);
  expect(saved.frames[0].poses[player.id][1]).toBeCloseTo(.82, 2);
  await press(page.getByRole("button", { name: "撤销" }));
  saved = await saveAndRead(page);
  expect(saved.frames[0].marks).toHaveLength(0);

  await addObject("标志碟", [.26, .32]);
  await addObject("标志碟", [.74, .32]);
  await press(page.getByRole("button", { name: "选择", exact: true }));
  await press(page.getByRole("button", { name: "选择", exact: true }));
  const objects = page.getByTestId("bottom-sheet");
  await expect(objects.getByRole("button", { name: "选择标志碟 1/2", exact: true })).toBeVisible();
  await expect(objects.getByRole("button", { name: "选择标志碟 2/2", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "选择", exact: true })).toBeFocused();

  await addObject("文字提示", [.50, .48]);
  await press(page.getByRole("button", { name: "选择", exact: true }));
  const adjustText = page.getByRole("button", { name: "调整文字提示", exact: true });
  await press(adjustText);
  const objectSheet = page.getByTestId("bottom-sheet");
  await objectSheet.getByRole("textbox").fill("回中");
  await press(objectSheet.getByRole("button", { name: "更新文字", exact: true }));
  await expect(objectSheet).toBeHidden();
  await expect(adjustText).toBeFocused();
  await press(adjustText);
  await press(objectSheet.getByRole("button", { name: "删除这个对象", exact: true }));
  await expect(objectSheet).toBeHidden();
  await expect(page.getByRole("button", { name: "选择", exact: true })).toBeFocused();
});

test("draws an opponent route from the direct tool rail and edits its curve handle", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  await clickBoardPoint(page, board, [.46, .18]);
  await expect(page.locator(".board-canvas-meta > strong")).toHaveText("对手");
  await press(page.getByRole("button", { name: "跑位", exact: true }));
  await dragBoardPoint(page, board, [.46, .18], [.74, .34]);

  await expect(page.getByRole("button", { name: "跑位", exact: true })).toHaveAttribute("aria-pressed", "true");
  const routeEnd: Point = [.64, .38];
  await dragBoardPoint(page, board, [.46, .18], routeEnd);
  let saved = await saveAndRead(page);
  let route = saved.frames[0].paths.find((item) => item.kind === "move")!;
  const opponent = saved.actors.find((actor) => actor.label === "对手")!;
  expect(saved.frames[0].poses[opponent.id][0]).toBeCloseTo(.46, 2);
  expect(saved.frames[0].poses[opponent.id][1]).toBeCloseTo(.18, 2);
  expect(route.from[0]).toBeCloseTo(.46, 2);
  expect(route.from[1]).toBeCloseTo(.18, 2);
  expect(route.to[0]).toBeCloseTo(routeEnd[0], 1);
  expect(route.to[1]).toBeCloseTo(routeEnd[1], 1);

  await press(page.getByRole("button", { name: "选择", exact: true }));
  await expect(page.locator(".board-canvas-meta > strong")).toHaveText("跑位路线");
  const adjustRoute = page.getByRole("button", { name: "调整跑位路线", exact: true });
  await press(adjustRoute);
  await expect(page.getByTestId("bottom-sheet").getByRole("button", { name: "改为直线", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bottom-sheet")).toBeHidden();
  await expect(adjustRoute).toBeFocused();
  await press(page.getByRole("button", { name: "选择", exact: true }));
  const objects = page.getByTestId("bottom-sheet");
  const routeEntry = objects.getByRole("button", { name: /跑位路线.*对手/ });
  await expect(routeEntry).toBeVisible();
  await press(routeEntry);
  await expect(objects).toBeHidden();
  await expect(board).toBeFocused();

  const originalControl: Point = [(.46 + routeEnd[0]) / 2 + (routeEnd[1] - .18) * .16, (.18 + routeEnd[1]) / 2 - (routeEnd[0] - .46) * .12];
  const nextControl: Point = [.40, .30];
  await dragBoardPoint(page, board, originalControl, nextControl);
  saved = await saveAndRead(page);
  route = saved.frames[0].paths.find((item) => item.kind === "move")!;
  expect(route.actorId).toBe(opponent.id);
  expect(route.control?.[0]).toBeCloseTo(nextControl[0], 1);
  expect(route.control?.[1]).toBeCloseTo(nextControl[1], 1);

  await press(page.getByRole("button", { name: "撤销" }));
  await expect(page.getByRole("button", { name: "重做" })).toBeEnabled();
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths[0].control?.[0]).toBeCloseTo(originalControl[0], 1);
  expect(saved.frames[0].paths).toHaveLength(1);
  await press(page.getByRole("button", { name: "重做" }));
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths[0].control?.[0]).toBeCloseTo(nextControl[0], 1);
  await press(page.getByRole("button", { name: "撤销" }));
  await saveAndRead(page);
  await press(page.getByRole("button", { name: "撤销" }));
  await saveAndRead(page);
  await press(page.getByRole("button", { name: "撤销" }));
  saved = await saveAndRead(page);
  expect(saved.frames[0].paths).toHaveLength(0);
});

test("pause, resume, scrub, step, replay, and explicit exit all stay in the preview state", async ({ page }) => {
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  await press(page.getByRole("button", { name: "球路", exact: true }));
  await dragBoardPoint(page, board, [.34, .72], [.70, .25]);

  const activeFrame = page.locator(".board-frame-track > button[aria-pressed='true']");
  await press(activeFrame);
  const frameSheet = page.getByTestId("bottom-sheet");
  const duration = frameSheet.locator('.board-field input[inputmode="decimal"]');
  await duration.fill("");
  await duration.pressSequentially("8");
  await expect(duration).toHaveValue("8");
  await page.waitForTimeout(50);
  await frameSheet.getByRole("button", { name: "完成", exact: true }).click();
  await expect(frameSheet).toBeHidden();
  await expect(activeFrame).toBeFocused();

  await press(page.getByRole("button", { name: /播放战术，1 拍，共 8\.0 秒/ }));
  await expect(page.getByRole("toolbar", { name: "画板工具" })).toHaveCount(0);
  await page.waitForTimeout(260);
  await press(page.getByRole("button", { name: "暂停", exact: true }));
  const progress = page.getByRole("slider", { name: "画板播放进度" });
  const paused = Number(await progress.inputValue());
  expect(paused).toBeGreaterThan(.05);
  await expect(page.locator(".board-editor")).toHaveClass(/is-previewing/);
  await expect(page.getByRole("button", { name: "继续", exact: true })).toBeVisible();

  await press(page.getByRole("button", { name: "继续", exact: true }));
  await page.waitForTimeout(180);
  await press(page.getByRole("button", { name: "暂停", exact: true }));
  expect(Number(await progress.inputValue())).toBeGreaterThan(paused);

  await progress.fill("4");
  await expect(page.locator(".board-editor")).toHaveClass(/is-previewing/);
  await press(page.getByRole("button", { name: "下一拍", exact: true }));
  await expect(page.locator(".board-editor")).toHaveClass(/is-previewing/);
  await press(page.getByRole("button", { name: "上一拍", exact: true }));
  await expect(page.locator(".board-editor")).toHaveClass(/is-previewing/);

  await progress.fill("8");
  await expect(page.getByRole("button", { name: "重播", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: "重播", exact: true }));
  await page.waitForTimeout(120);
  await press(page.getByRole("button", { name: "暂停", exact: true }));
  expect(Number(await progress.inputValue())).toBeLessThan(8);
  await press(page.getByRole("button", { name: "完成 · 回到编辑" }));
  await expect(page.locator(".board-editor")).toHaveClass(/is-editing/);
});

test("adds a continuous frame, exposes secondary library actions, and keeps drill content", async ({ page }) => {
  await openBoard(page);
  await press(page.getByRole("button", { name: "新建下一拍" }));
  await expect(page.locator(".board-frame-track > button")).toHaveCount(2);
  const saved = await saveAndRead(page);
  expect(saved.frames[1].poses).toEqual(saved.frames[0].poses);
  expect(saved.frames[1].paths).toEqual([]);

  const currentFrame = page.locator(".board-frame-track > button[aria-pressed='true']");
  await press(currentFrame);
  const carryForward = page.getByTestId("bottom-sheet").getByRole("button", { name: "沿用布置到下一拍" });
  await expect(carryForward).toBeVisible();
  expect(Math.round((await carryForward.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bottom-sheet")).toBeHidden();
  await expect(currentFrame).toBeFocused();
  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "战术画板" })).toBeVisible();
  await press(page.getByRole("button", { name: /我的战术板.*2 拍/ }));
  await waitForFlowSettled(page);
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await press(page.getByRole("button", { name: /打开我的战术板的文件选项/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "战术画板" })).toBeVisible();
  await press(page.getByRole("button", { name: "返回上一页" }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "网球战术" })).toBeVisible();

  await press(page.getByRole("button", { name: /^防守高深回中，9秒/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "在画板中调整" }));
  await waitForFlowSettled(page);
  await expect(page.locator(".board-frame-track > button")).toHaveCount(5);
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

test("captures the simplified Theme 1 editor at an unscaled iPhone viewport", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await openBoard(page);
  const board = page.getByTestId("board-canvas");
  await press(page.getByRole("button", { name: "球路", exact: true }));
  await dragBoardPoint(page, board, [.34, .72], [.72, .26]);

  const screen = page.getByTestId("device-screen");
  const bounds = await screen.boundingBox();
  expect(bounds?.width).toBeCloseTo(393, 0);
  expect(bounds?.height).toBeCloseTo(852, 0);
  await screen.screenshot({ path: path.join(process.cwd(), "docs/court-board/implementation-theme-1-screen-1x.png") });
  expect(consoleErrors).toEqual([]);
});
