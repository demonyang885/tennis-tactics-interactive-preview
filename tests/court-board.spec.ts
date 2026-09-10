import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

async function clickBoardAt(page: Page, board: Locator, xRatio: number, yRatio: number) {
  const bounds = await board.boundingBox();
  if (!bounds) throw new Error("Board canvas has no bounding box");
  await page.mouse.click(
    bounds.x + bounds.width * xRatio,
    bounds.y + bounds.height * yRatio,
  );
}

async function press(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.click({ force: true });
}

async function openBoardHome(page: Page) {
  await press(page.getByRole("button", { name: /战术画板.*画球路/ }));
  await expect(page.getByRole("heading", { name: "战术画板" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "网球战术" })).toBeVisible();
});

test("creates, edits, undoes, redoes, and saves a blank tactical board", async ({ page }) => {
  await openBoardHome(page);
  await expect(page.getByRole("button", { name: /受压回深，回位再接一拍/ })).toBeVisible();

  await press(page.getByRole("button", { name: "新建空白画板" }));
  const board = page.getByTestId("board-canvas");
  const tools = page.getByRole("navigation", { name: "画板工具" });
  await expect(board).toBeVisible();
  await expect(page.getByRole("button", { name: "打开我的新战术的文件选项" })).toBeVisible();

  await press(tools.getByRole("button", { name: "球员", exact: true }));
  await press(page.getByRole("button", { name: "我方", exact: true }));
  await clickBoardAt(page, board, .42, .8);
  await press(page.getByRole("button", { name: "对手", exact: true }));
  await clickBoardAt(page, board, .58, .2);
  await press(page.getByRole("button", { name: "网球", exact: true }));
  await clickBoardAt(page, board, .48, .72);

  await press(tools.getByRole("button", { name: "选择", exact: true }));
  await clickBoardAt(page, board, .92, .92);
  await press(page.getByRole("button", { name: "对象列表" }));
  const objects = page.getByTestId("bottom-sheet");
  await expect(objects.getByRole("button", { name: /我方.*球员/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /对手.*球员/ })).toBeVisible();
  await expect(objects.getByRole("button", { name: /网球.*网球/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(objects).toHaveCount(0);

  await press(tools.getByRole("button", { name: "球路", exact: true }));
  await clickBoardAt(page, board, .3, .3);
  await press(tools.getByRole("button", { name: "选择", exact: true }));
  await expect(page.locator(".board-selection-name")).toHaveText("击球路线");

  const undo = page.getByRole("button", { name: "撤销" });
  const redo = page.getByRole("button", { name: "重做" });
  await press(page.getByRole("button", { name: "下一拍", exact: true }));
  const frames = page.locator(".board-frame-track > button");
  await expect(frames).toHaveCount(2);

  await press(undo);
  await expect(frames).toHaveCount(1);
  await expect(frames.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".board-canvas-meta")).toContainText("第 1 拍");

  await press(tools.getByRole("button", { name: "选择", exact: true }));
  await clickBoardAt(page, board, .58, .2);
  await expect(page.locator(".board-selection-name")).toHaveText("对手");

  await expect(redo).toBeEnabled();
  await press(redo);
  await expect(frames).toHaveCount(2);

  const save = page.locator(".board-save-status");
  await press(save);
  await expect(save).toContainText("已保存");
  await press(page.getByRole("button", { name: "返回画板列表" }));

  const savedDraft = page.locator(".board-draft-open").filter({ hasText: "我的新战术" });
  await expect(savedDraft).toBeVisible();
  await expect(savedDraft).toContainText("2 拍");
});

test("flushes the latest committed edit before leaving the board", async ({ page }) => {
  await openBoardHome(page);
  await press(page.getByRole("button", { name: "新建空白画板" }));

  const board = page.getByTestId("board-canvas");
  const tools = page.getByRole("navigation", { name: "画板工具" });
  await press(tools.getByRole("button", { name: "球员", exact: true }));
  await clickBoardAt(page, board, .42, .8);
  await press(page.getByRole("button", { name: "返回画板列表" }));

  const savedDraft = page.locator(".board-draft-open").filter({ hasText: "我的新战术" });
  await expect(savedDraft).toBeVisible();
  const savedActors = await page.evaluate(() => {
    const stored = window.localStorage.getItem("tennis-tactics:board-drafts:v1");
    if (!stored) return [];
    const envelope = JSON.parse(stored) as { boards?:Array<{ actors?:Array<{ label?:string }> }> };
    return envelope.boards?.[0]?.actors?.map(actor => actor.label) ?? [];
  });
  expect(savedActors).toContain("我方");
});

test("opens a library tactic in the board and exposes its on-court drill", async ({ page }) => {
  await press(page.getByRole("button", { name: /^防守高深回中，9秒/ }));
  await expect(page.getByRole("button", { name: "在画板中调整" })).toBeVisible();
  await press(page.getByRole("button", { name: "在画板中调整" }));

  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "打开防守高深回中的文件选项" })).toBeVisible();
  await expect(page.locator(".board-frame-track > button")).toHaveCount(5);

  await press(page.getByRole("button", { name: "练到场上" }));
  const drill = page.getByTestId("bottom-sheet");
  await expect(drill.getByRole("heading", { name: "受压回深，回位再接一拍" })).toBeVisible();
  await expect(drill.locator(".drill-stages details")).toHaveCount(4);
  await expect(drill.getByText("01 固定喂球 · 找到弧线与深度", { exact: true })).toBeVisible();
  await expect(drill.getByText("04 条件对抗 · 脱困后继续争分", { exact: true })).toBeVisible();
  await expect(drill.getByRole("button", { name: "带着画板去练" })).toBeVisible();
});

test("captures the Theme 1 editor at an unscaled iPhone viewport", async ({ page }) => {
  const consoleErrors:string[]=[];
  page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
  page.on("pageerror",error=>consoleErrors.push(error.message));
  await page.reload();
  await press(page.getByRole("button", { name: /^斜线调动再变线，11秒/ }));
  await press(page.getByRole("button", { name: "在画板中调整" }));
  await press(page.getByRole("button", { name: "对象列表" }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /击球路线/ }));
  await press(page.getByRole("button", { name: "弯曲", exact: true }));
  await clickBoardAt(page, page.getByTestId("board-canvas"), .04, .94);
  await press(page.getByRole("button", { name: "对象列表" }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /跑位路线.*对手/ }));
  await press(page.getByRole("button", { name: "删除所选对象" }));
  const tools = page.getByRole("navigation", { name: "画板工具" });
  await press(tools.getByRole("button", { name: "跑位", exact: true }));
  await clickBoardAt(page, page.getByTestId("board-canvas"), .43, .72);
  await press(tools.getByRole("button", { name: "球路", exact: true }));
  const screen = page.getByTestId("device-screen");
  const bounds = await screen.boundingBox();
  expect(bounds?.width).toBeCloseTo(393, 0);
  expect(bounds?.height).toBeCloseTo(852, 0);
  await screen.screenshot({
    path: path.join(process.cwd(), "docs/court-board/implementation-theme-1-screen-1x.png"),
  });
  expect(consoleErrors).toEqual([]);
});
