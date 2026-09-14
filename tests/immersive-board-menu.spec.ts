import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BoardDocument } from "../src/board/model";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";

const authoredBoard: BoardDocument = {
  version: 1,
  id: "immersive-menu-board",
  title: "沉浸测试画板",
  updatedAt: "2026-09-12T10:08:00.000Z",
  actors: [
    { id: "near-player", label: "我方", kind: "player", color: "#d4ea72" },
    { id: "far-player", label: "对手", kind: "player", color: "#e9a36d" },
    { id: "match-ball", label: "网球", kind: "ball", color: "#edf76a" },
  ],
  frames: [
    {
      id: "authored-opening",
      label: "第 1 拍 · 发球后移动",
      duration: 2.4,
      poses: {
        "near-player": [0.64, 0.98],
        "far-player": [0.3, 0.07],
        "match-ball": [0.64, 0.96],
      },
      paths: [
        {
          id: "opening-serve",
          kind: "shot",
          actorId: "match-ball",
          from: [0.64, 0.96],
          to: [0.32, 0.18],
          control: [0.75, 0.5],
        },
        {
          id: "returner-move",
          kind: "move",
          actorId: "far-player",
          from: [0.3, 0.07],
          to: [0.46, 0.22],
          control: [0.38, 0.12],
        },
      ],
      marks: [],
    },
  ],
};

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

async function seedAndOpenBoard(page: Page) {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard });
  await page.reload();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
  const boardEntry = page.getByRole("button", { name: "接着画沉浸测试画板", exact: true });
  const usesTouch=await page.evaluate(()=>window.matchMedia("(pointer: coarse)").matches);
  if ((page.viewportSize()?.width ?? 1_100) <= 600||usesTouch) {
    await expect(boardEntry).toBeVisible();
    await boardEntry.tap();
  } else {
    await press(boardEntry);
  }
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await waitForFlowSettled(page);
  await page.addStyleTag({ content: ".mobile-cursor { display: none !important; }" });
  await page.getByTestId("status-time").evaluate((element) => {
    element.textContent = "10:08";
  });
}

async function currentStoredBoard(page: Page) {
  return page.evaluate(({ key, id }) => {
    const stored = window.localStorage.getItem(key);
    if (!stored) throw new Error("Expected a locally saved tactical board");
    const parsed = JSON.parse(stored) as { boards: BoardDocument[] };
    const board = parsed.boards.find((candidate) => candidate.id === id);
    if (!board) throw new Error(`Missing tactical board ${id}`);
    return board;
  }, { key: STORAGE_KEY, id: authoredBoard.id });
}

async function capture(locator: Locator, testInfo: TestInfo, name: string) {
  const options = {
    path: testInfo.outputPath(name),
    animations: "disabled",
    caret: "hide",
  } as const;
  await locator.screenshot(options);
  if (process.env.UPDATE_DESIGN_EVIDENCE === "1") {
    const evidenceDirectory = path.join(process.cwd(), "docs", "design-qa");
    await mkdir(evidenceDirectory, { recursive: true });
    await locator.screenshot({ ...options, path: path.join(evidenceDirectory, name) });
  }
}

async function swipeFromLeftEdge(page: Page) {
  await page.getByTestId("board-canvas").evaluate((target) => {
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

async function waitForSheetSettled(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(page.locator(".bottom-sheet")).toHaveCount(1);
  await expect.poll(async () => dialog.evaluate((element) => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.abs(transform.m42);
  })).toBeLessThan(1);
}

function expectBoxClose(actual: { x: number; y: number; width: number; height: number } | null, expected: { x: number; y: number; width: number; height: number }) {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(expected.x, 0);
  expect(actual!.y).toBeCloseTo(expected.y, 0);
  expect(actual!.width).toBeCloseTo(expected.width, 0);
  expect(actual!.height).toBeCloseTo(expected.height, 0);
}

test.describe("immersive tactical-board menu", () => {
  test.beforeEach(async ({ page }) => {
    await seedAndOpenBoard(page);
  });

  test("opens directly as an app-level immersive board with compact history and no fullscreen switch", async ({ page }, testInfo) => {
    const screen = page.getByTestId("device-screen");
    const stage = page.locator(".phone-stage");
    const editor = page.locator(".board-editor");
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    await expect(editor).toHaveAttribute("data-immersive", "true");
    await expect(stage).toHaveAttribute("data-board-immersive", "true");
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    expectBoxClose(await stage.boundingBox(), { x: 0, y: 0, width: viewport!.width, height: viewport!.height });
    await expect(page.getByRole("button", { name: /^(进入|退出)全屏战术板$/ })).toHaveCount(0);

    const toolbar = page.getByRole("toolbar", { name: "战术板操作", exact: true });
    const back = toolbar.getByRole("button", { name: "返回上一页", exact: true });
    const history = toolbar.getByRole("button", { name: "打开拍次历史，当前第 1 拍，共 1 拍", exact: true });
    await expect(back).toBeVisible();
    await expect(history).toBeVisible();
    await expect(history.locator("svg")).toHaveCount(1);
    await expect(history.locator("span")).toHaveText("1");
    const historyBox = await history.boundingBox();
    expect(historyBox).not.toBeNull();
    expect(historyBox!.width).toBeGreaterThanOrEqual(44);
    expect(historyBox!.height).toBeGreaterThanOrEqual(44);
    await capture(screen, testInfo, "01-default-immersive-board.png");

    await press(history);
    const historySheet = page.getByRole("dialog", { name: "拍次", exact: true });
    await waitForSheetSettled(page, historySheet);
    await expect(historySheet.getByRole("button", { name: /^编辑第 1 拍/ })).toBeVisible();
    await press(historySheet.getByRole("button", { name: "关闭拍次", exact: true }));
    await expect(historySheet).toBeHidden();
    await expect(history).toBeFocused();
  });

  test("keeps menu and share actions available without leaving immersive mode", async ({ page }, testInfo) => {
    const screen = page.getByTestId("device-screen");
    const editor = page.locator(".board-editor");
    const menuTrigger = page.getByRole("toolbar", { name: "战术板操作", exact: true })
      .getByRole("button", { name: "打开沉浸测试画板的画板菜单", exact: true });

    await press(menuTrigger);
    const rootMenu = page.getByRole("dialog", { name: "画板菜单", exact: true });
    await waitForSheetSettled(page, rootMenu);
    await expect(rootMenu.locator(".board-menu-list > button")).toHaveCount(4);
    await expect(rootMenu.getByRole("button", { name: /^修改名称/ })).toBeVisible();
    await expect(rootMenu.getByRole("button", { name: "一键还原发球站位，可撤销", exact: true })).toBeEnabled();
    await expect(rootMenu.getByRole("button", { name: /^保存与分享/ })).toBeVisible();
    await expect(rootMenu.getByRole("button", { name: /^草稿与模板/ })).toBeVisible();
    await expect(rootMenu.getByRole("button", { name: /清除|拍次历史|立即保存|导入备份/ })).toHaveCount(0);
    await capture(screen, testInfo, "02-root-board-menu.png");

    await press(rootMenu.getByRole("button", { name: /^保存与分享/ }));
    const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
    await waitForSheetSettled(page, saveShare);
    await expect(saveShare.getByText("分享成品", { exact: true })).toBeVisible();
    await expect(saveShare.getByText("保留可编辑版本", { exact: true })).toBeVisible();
    await expect(saveShare.getByRole("button", { name: /^分享球路视频/ })).toBeEnabled();
    await expect(saveShare.getByRole("button", { name: /^分享动态图/ })).toBeEnabled();
    await expect(saveShare.getByRole("button", { name: /^保存这一拍图片/ })).toBeVisible();
    await expect(saveShare.getByRole("button", { name: /^另存一份/ })).toBeVisible();
    await expect(saveShare.getByRole("button", { name: /^备份画板/ })).toBeVisible();
    await capture(screen, testInfo, "03-save-and-share-menu.png");
    await press(saveShare.getByRole("button", { name: "关闭保存与分享", exact: true }));
    await expect(saveShare).toBeHidden();
    await expect(editor).toHaveAttribute("data-immersive", "true");

    await press(menuTrigger);
    await waitForSheetSettled(page, rootMenu);
    await page.keyboard.press("Escape");
    await expect(rootMenu).toBeHidden();
    await expect(editor).toHaveAttribute("data-immersive", "true");
    await expect(menuTrigger).toBeFocused();
  });

  test("returns to the previous page and preserves the authored board", async ({ page }) => {
    const persistedBefore = await currentStoredBoard(page);
    const toolbar = page.getByRole("toolbar", { name: "战术板操作", exact: true });
    await press(toolbar.getByRole("button", { name: "返回上一页", exact: true }));
    await waitForFlowSettled(page);
    await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
    await expect(page.locator(".phone-stage")).not.toHaveAttribute("data-board-immersive", "true");

    const persistedAfter = await currentStoredBoard(page);
    expect(persistedAfter.title).toBe(persistedBefore.title);
    expect(persistedAfter.actors).toEqual(persistedBefore.actors);
    expect(persistedAfter.frames).toEqual(persistedBefore.frames);
  });

  test("renames in a keyboard-safe full-screen layer without scaling the phone preview", async ({ page }, testInfo) => {
    const screen = page.getByTestId("device-screen");
    const screenBefore = await screen.boundingBox();
    expectBoxClose(screenBefore, { x: 0, y: 0, width: 1100, height: 1100 });
    const phoneTransformBefore = await page.getByTestId("phone-frame").evaluate((element) => getComputedStyle(element).transform);

    const menuTrigger = page.getByRole("toolbar", { name: "战术板操作", exact: true })
      .getByRole("button", { name: "打开沉浸测试画板的画板菜单", exact: true });
    await press(menuTrigger);
    const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
    await waitForSheetSettled(page, menu);
    await expect(menu.getByRole("button", { name: "一键还原发球站位，可撤销", exact: true })).toBeEnabled();
    await press(menu.getByRole("button", { name: /^修改名称/ }));
    const layer = page.getByTestId("board-rename-layer");
    await expect(layer).toBeVisible();
    await expect(layer.getByRole("heading", { name: "修改名称", exact: true })).toBeVisible();
    await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);

    const input = layer.getByRole("textbox", { name: /^画板名称/ });
    await expect(input).toBeFocused();
    const inputFontSize = await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(inputFontSize).toBeGreaterThanOrEqual(16);
    await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
    expectBoxClose(await layer.boundingBox(), screenBefore!);
    await expect.poll(async () => layer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    await capture(screen, testInfo, "05-rename-with-simulator-keyboard.png");

    await input.fill("不会缩放的名称");
    await press(layer.getByRole("button", { name: "取消", exact: true }));
    await expect(layer).toBeHidden();
    await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
    await expect(menuTrigger).toBeFocused();
    await expect(page.getByRole("toolbar", { name: "战术板操作" })).toContainText("沉浸测试画板");
    expectBoxClose(await screen.boundingBox(), screenBefore!);
    await expect(page.getByTestId("phone-frame")).toHaveCSS("transform", phoneTransformBefore);
  });
});

test.describe("real-mobile rename viewport", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("uses a native-size input without painting the simulator keyboard or zooming", async ({ page }, testInfo) => {
    await seedAndOpenBoard(page);
    const screen = page.getByTestId("device-screen");
    const screenBefore = await screen.boundingBox();
    expectBoxClose(screenBefore, { x: 0, y: 0, width: 390, height: 844 });
    await expect(page.locator(".board-editor")).toHaveAttribute("data-immersive", "true");
    await expect(page.locator(".phone-stage")).toHaveAttribute("data-board-immersive", "true");
    await expect(page.getByRole("button", { name: /^(进入|退出)全屏战术板$/ })).toHaveCount(0);

    const toolbar = page.getByRole("toolbar", { name: "战术板操作", exact: true });
    const history = toolbar.getByRole("button", { name: "打开拍次历史，当前第 1 拍，共 1 拍", exact: true });
    const [historyBounds, guideBounds] = await Promise.all([
      history.boundingBox(),
      page.locator(".board-interaction-guide").boundingBox(),
    ]);
    expect(historyBounds).not.toBeNull();
    expect(historyBounds!.width).toBeGreaterThanOrEqual(44);
    expect(historyBounds!.height).toBeGreaterThanOrEqual(44);
    expect(guideBounds).not.toBeNull();
    expect(guideBounds!.height).toBeGreaterThanOrEqual(44);
    expect(guideBounds!.height).toBeLessThanOrEqual(48);
    await capture(screen, testInfo, "immersive-board-390x844.png");

    const menuTrigger = toolbar.getByRole("button", { name: "打开沉浸测试画板的画板菜单", exact: true });
    await press(menuTrigger);
    const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
    await waitForSheetSettled(page, menu);
    await expect(menu.getByRole("button", { name: "一键还原发球站位，可撤销", exact: true })).toBeEnabled();
    await capture(screen, testInfo, "immersive-menu-restore-390x844.png");
    await press(menu.getByRole("button", { name: /^修改名称/ }));
    const layer = page.getByTestId("board-rename-layer");
    const input = layer.getByRole("textbox", { name: /^画板名称/ });
    await expect(layer).toBeVisible();
    await expect(input).toBeFocused();
    expect(await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
    expectBoxClose(await layer.boundingBox(), screenBefore!);

    const viewportMetrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scale: window.visualViewport?.scale ?? 1,
    }));
    expect(viewportMetrics.innerWidth).toBe(390);
    expect(viewportMetrics.innerHeight).toBe(844);
    expect(viewportMetrics.scrollWidth).toBeLessThanOrEqual(viewportMetrics.innerWidth);
    expect(viewportMetrics.scrollX).toBe(0);
    expect(viewportMetrics.scrollY).toBe(0);
    expect(viewportMetrics.scale).toBe(1);

    await input.fill("移动端原生名称");
    await press(layer.getByRole("button", { name: "完成", exact: true }));
    await expect(layer).toBeHidden();
    await expect(toolbar).toContainText("移动端原生名称");
    await expect(toolbar.getByRole("button", { name: "打开移动端原生名称的画板菜单", exact: true })).toBeVisible();
    expectBoxClose(await screen.boundingBox(), screenBefore!);
  });
});

test.describe("real-mobile landscape board", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });

  test("keeps the save menu and immersive controls inside the landscape viewport", async ({ page }, testInfo) => {
    await seedAndOpenBoard(page);
    const stage = page.locator(".phone-stage");
    const editor = page.locator(".board-editor");
    await expect(editor).toHaveAttribute("data-immersive", "true");
    await expect(stage).toHaveAttribute("data-board-immersive", "true");
    await expect(page.getByRole("button", { name: /^(进入|退出)全屏战术板$/ })).toHaveCount(0);
    expectBoxClose(await stage.boundingBox(), { x: 0, y: 0, width: 844, height: 390 });

    const toolbar = page.getByRole("toolbar", { name: "战术板操作", exact: true });
    const back = toolbar.getByRole("button", { name: "返回上一页", exact: true });
    const backBox = await back.boundingBox();
    expect(backBox).not.toBeNull();
    expect(backBox!.y).toBeGreaterThanOrEqual(0);
    expect(backBox!.y + backBox!.height).toBeLessThanOrEqual(390);

    await press(toolbar.getByRole("button", { name: "打开沉浸测试画板的画板菜单", exact: true }));
    const rootMenu = page.getByRole("dialog", { name: "画板菜单", exact: true });
    await waitForSheetSettled(page, rootMenu);
    await press(rootMenu.getByRole("button", { name: /^保存与分享/ }));
    const saveShare = page.getByRole("dialog", { name: "保存与分享", exact: true });
    await waitForSheetSettled(page, saveShare);

    const sheetBox = await page.locator(".bottom-sheet").boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.y).toBeGreaterThanOrEqual(0);
    expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(390);
    await expect(saveShare.getByRole("button", { name: "返回画板菜单", exact: true })).toBeVisible();
    await expect(saveShare.getByRole("button", { name: "关闭保存与分享", exact: true })).toBeVisible();
    const backup = saveShare.getByRole("button", { name: /^备份画板/ });
    await backup.scrollIntoViewIfNeeded();
    await expect(backup).toBeVisible();
    await capture(stage, testInfo, "06-landscape-save-and-share.png");

    await press(saveShare.getByRole("button", { name: "关闭保存与分享", exact: true }));
    await swipeFromLeftEdge(page);
    await waitForFlowSettled(page);
    await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
    await expect(stage).not.toHaveAttribute("data-board-immersive", "true");
  });
});
