import { expect, test, type Locator, type Page } from "@playwright/test";
import type { BoardDocument } from "../src/board/model";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";

const recentDraft: BoardDocument = {
  version: 1,
  id: "homepage-recent-draft",
  title: "周六发球训练",
  updatedAt: "2026-09-13T10:30:00.000Z",
  authoringMode: "blank-rally",
  actors: [
    { id: "recent-me", label: "我方", kind: "player", color: "#d4ea72" },
    { id: "recent-opponent", label: "对手", kind: "player", color: "#e9a36d" },
    { id: "recent-ball", label: "网球", kind: "ball", color: "#edf76a" },
  ],
  frames: [
    {
      id: "recent-opening",
      label: "第 1 拍 · 发球后移动",
      duration: 2.4,
      poses: {
        "recent-me": [0.64, 0.98],
        "recent-opponent": [0.3, 0.07],
        "recent-ball": [0.64, 0.96],
      },
      paths: [
        {
          id: "recent-serve",
          kind: "shot",
          actorId: "recent-ball",
          from: [0.64, 0.96],
          to: [0.3, 0.2],
          control: [0.72, 0.52],
        },
        {
          id: "recent-returner-move",
          kind: "move",
          actorId: "recent-opponent",
          from: [0.3, 0.07],
          to: [0.45, 0.21],
          control: [0.36, 0.12],
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

async function openCleanHomepage(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
  await expect(page.getByText("RallyPath", { exact: true })).toBeVisible();
}

async function storedBoards(page: Page): Promise<BoardDocument[]> {
  return page.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    if (!serialized) return [];
    return (JSON.parse(serialized) as { boards: BoardDocument[] }).boards;
  }, STORAGE_KEY);
}

async function renameCurrentBoardAndReadSaved(page: Page, title: string): Promise<BoardDocument> {
  const header = page.getByTestId("flow-fixed-header");
  const toolbar = page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true });
  await press(toolbar.getByRole("button", { name: /打开.*的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /修改名称/ }));
  const renameLayer = page.getByTestId("board-rename-layer");
  await expect(renameLayer).toBeVisible();
  await renameLayer.getByLabel("画板名称", { exact: true }).fill(title);
  await press(renameLayer.getByRole("button", { name: "完成", exact: true }));
  await expect(renameLayer).toBeHidden();
  await expect(header.getByTestId("board-save-live")).toHaveText("画板已保存", { timeout: 3_000 });
  await expect.poll(async () => (await storedBoards(page)).some((board) => board.title === title)).toBe(true);
  const saved = (await storedBoards(page)).find((board) => board.title === title);
  if (!saved) throw new Error(`Expected edited board ${title} to be saved`);
  return saved;
}

async function expectBoardEditor(page: Page) {
  const current = page.getByTestId("flow-current");
  await expect(current.getByTestId("board-canvas")).toBeVisible();
  await waitForFlowSettled(page);
  const dock = current.getByRole("navigation", { name: "画板编辑工具", exact: true });
  await expect(dock.getByRole("button")).toHaveCount(3);
  await expect(dock.getByRole("button").nth(0)).toHaveAccessibleName(/^(添加对象|调整)/);
  await expect(dock.getByRole("button").nth(2)).toHaveAccessibleName(/^(打开拍次|删除)/);
  await expect(dock).toHaveText("");
}

async function expectBoardEditorTitle(page: Page, title: string) {
  const toolbar = page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button", { name: `打开${title}的画板菜单`, exact: true })).toBeVisible();
  await expect(toolbar).toHaveText("");
}

async function openCurrentBoardLibrary(page: Page) {
  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  await press(page.getByTestId("bottom-sheet").getByRole("button", { name: /草稿与模板/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "草稿与模板", exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openCleanHomepage(page);
});

test("opens directly on the converged board-first homepage without a back affordance", async ({ page }) => {
  await expect(page.getByRole("button", { name: "画第一拍", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "想下一分", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "记下刚才一分", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "找个打法", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^想一拍|^去训练|^刚打完|看组合打法/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /返回上一页|返回画板列表/ })).toHaveCount(0);
  await expect(page.locator(".header-back")).toHaveCount(0);
  await expect(page.locator(".home-resume-card")).toHaveCount(0);
});

test("opens the content explanation from the quiet top-right help control", async ({ page }) => {
  const help = page.getByRole("button", { name: "打开内容说明", exact: true });
  await expect(help).toBeVisible();
  await expect(help.locator("svg")).toHaveCount(1);
  await press(help);

  const dialog = page.getByRole("dialog", { name: "关于 RallyPath", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("用球路和跑位，看懂青少年单打战术。");
  await expect(dialog).toContainText("蓝色是我方，红色是对手，黄色是网球");
  await press(dialog.getByRole("button", { name: "知道了", exact: true }));
  await expect(dialog).toHaveCount(0);
});

test("opens a canonical ready-to-serve board without creating a draft before editing", async ({ page }) => {
  await press(page.getByRole("button", { name: "想下一分", exact: true }));
  await expectBoardEditor(page);
  await expectBoardEditorTitle(page, "我的战术板");
  await expect(page.getByTestId("flow-current").locator(".board-interaction-guide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "查看画板操作说明", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择球场主题", exact: true })).toHaveCount(0);
  const toolbar = page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true });
  await press(toolbar.getByRole("button", { name: "打开我的战术板的画板菜单", exact: true }));
  const menu = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await expect(menu.getByRole("button", { name: "硬地", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "红土", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "草地", exact: true })).toBeVisible();
  await expect.poll(async () => (await storedBoards(page)).length).toBe(0);
});

test("keeps the homepage visible with a real draft and opens the board shown in its preview", async ({ page }) => {
  await page.evaluate(({ key, board }) => {
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: recentDraft });
  await page.reload();

  await expect(page.getByText("RallyPath", { exact: true })).toBeVisible();
  await expect(page.getByTestId("home-board-playback")).toHaveAttribute("data-board-id", recentDraft.id);
  await expect(page.getByRole("button", { name: `接着画${recentDraft.title}`, exact: true })).toBeVisible();
  await expect(page.locator(".home-preview-heading,.home-board-playback-replay")).toHaveCount(0);
  await expect(page.locator(".home-preview-card")).not.toContainText(/最后编辑|发球站位|我方|对手|网球|球路|跑位/);
  await press(page.getByTestId("home-board-open"));
  await expectBoardEditor(page);
  await expectBoardEditorTitle(page, recentDraft.title);
  await expect(page.getByRole("button", { name: /播放战术，1 拍，共 2\.4 秒/ })).toBeEnabled();

  const restored = (await storedBoards(page)).find((board) => board.id === recentDraft.id);
  expect(restored?.frames[0].paths).toEqual(recentDraft.frames[0].paths);
  expect(restored?.frames[0].poses).toEqual(recentDraft.frames[0].poses);
});

test("does not present a failed first draft read as an empty account", async ({ page }) => {
  await page.evaluate(({ key, board }) => {
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: recentDraft });
  await page.addInitScript((key) => {
    const originalGetItem = Storage.prototype.getItem;
    Object.defineProperty(window, "__allowBoardReads", {
      configurable: true,
      value: false,
      writable: true,
    });
    Storage.prototype.getItem = function getItem(storageKey: string) {
      const controlledWindow = window as Window & { __allowBoardReads?: boolean };
      if (storageKey === key && !controlledWindow.__allowBoardReads) {
        throw new Error("test read failure");
      }
      return originalGetItem.call(this, storageKey);
    };
  }, STORAGE_KEY);
  await page.reload();

  const homeFailure = page.getByRole("alert");
  await expect(homeFailure).toContainText("暂时读不到此浏览器里的画板，请重试");
  await expect(homeFailure.getByRole("button", { name: "重试", exact: true })).toBeVisible();
  await expect(page.locator(".home-plan-primary")).toHaveCount(0);
  await expect(page.getByText("画第一拍", { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    (window as Window & { __allowBoardReads?: boolean }).__allowBoardReads = true;
  });
  await press(homeFailure.getByRole("button", { name: "重试", exact: true }));
  await expect(homeFailure).toHaveCount(0);
  await expect(page.getByTestId("home-board-playback")).toHaveAttribute("data-board-id", recentDraft.id);

  await press(page.getByTestId("home-board-open"));
  await expectBoardEditor(page);
  await page.evaluate(() => {
    (window as Window & { __allowBoardReads?: boolean }).__allowBoardReads = false;
  });
  await openCurrentBoardLibrary(page);

  const library = page.getByTestId("flow-current");
  const libraryFailure = library.getByRole("alert");
  await expect(libraryFailure).toContainText("暂时读不到此浏览器里的画板，请重试");
  await expect(library.getByText("画板还没读出来。重试后再看。", { exact: true })).toBeVisible();
  await expect(library.getByText(/这里还没有画板/)).toHaveCount(0);
  await expect(library.getByText("未读取", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    (window as Window & { __allowBoardReads?: boolean }).__allowBoardReads = true;
  });
  await press(libraryFailure.getByRole("button", { name: "重试", exact: true }));
  await expect(libraryFailure).toHaveCount(0);
  await expect(library.locator(".board-draft-open").filter({ hasText: recentDraft.title })).toBeVisible();
});

test("offers a real file picker after an import failure", async ({ page }) => {
  await press(page.getByRole("button", { name: "想下一分", exact: true }));
  await expectBoardEditor(page);
  await openCurrentBoardLibrary(page);

  const library = page.getByTestId("flow-current");
  await library.locator('input[type="file"]').setInputFiles({
    name: "broken-board.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not-json"),
  });
  const failure = library.getByRole("alert");
  await expect(failure).toContainText("这个备份打不开，请换一个文件重试");
  await expect(failure.getByRole("button", { name: "重新选择", exact: true })).toBeVisible();
  await expect(failure.getByRole("button", { name: "重试", exact: true })).toHaveCount(0);

  const chooserPromise = page.waitForEvent("filechooser");
  await failure.getByRole("button", { name: "重新选择", exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "valid-board.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(recentDraft)),
  });

  await expectBoardEditor(page);
  await expectBoardEditorTitle(page, "周六发球训练（导入）");
  await expect.poll(async () => (await storedBoards(page)).some((board) => board.title === "周六发球训练（导入）")).toBe(true);
});

test("retries the original deletion instead of refreshing the library", async ({ page }) => {
  const removableDraft: BoardDocument = {
    ...recentDraft,
    id: "delete-retry-draft",
    title: "待删除草稿",
    updatedAt: "2026-09-13T09:30:00.000Z",
  };
  await page.evaluate(({ key, boards }) => {
    window.localStorage.setItem(key, JSON.stringify({ version: 1, boards }));
  }, { key: STORAGE_KEY, boards: [recentDraft, removableDraft] });
  await page.reload();
  await press(page.getByTestId("home-board-open"));
  await expectBoardEditor(page);
  await openCurrentBoardLibrary(page);

  await page.evaluate((key) => {
    const originalSetItem = Storage.prototype.setItem;
    let failNextDeleteWrite = true;
    Storage.prototype.setItem = function setItem(storageKey: string, value: string) {
      if (storageKey === key && failNextDeleteWrite) {
        failNextDeleteWrite = false;
        throw new Error("test delete failure");
      }
      return originalSetItem.call(this, storageKey, value);
    };
  }, STORAGE_KEY);

  const library = page.getByTestId("flow-current");
  const removableRow = library.locator("article").filter({ hasText: removableDraft.title });
  await press(removableRow.getByRole("button", { name: `删除${removableDraft.title}`, exact: true }));
  const failure = library.getByRole("alert");
  await expect(failure).toContainText("暂时无法删除「待删除草稿」，请重试");
  await expect(failure.getByRole("button", { name: "再试一次", exact: true })).toBeVisible();
  await expect(failure.getByRole("button", { name: "重试", exact: true })).toHaveCount(0);
  await expect(removableRow).toBeVisible();

  await press(failure.getByRole("button", { name: "再试一次", exact: true }));
  await expect(failure).toHaveCount(0);
  await expect(removableRow).toHaveCount(0);
  await expect(library.getByRole("status")).toContainText(`已删除「${removableDraft.title}」`);
  await expect.poll(async () => (await storedBoards(page)).some((board) => board.id === removableDraft.id)).toBe(false);
});

test("opens the full tactical knowledge library from the short first-action entry", async ({ page }) => {
  await press(page.getByRole("button", { name: "找个打法", exact: true }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "战术知识库", exact: true })).toBeVisible();

  await press(page.getByRole("button", { name: "改变节奏", exact: true }));
  await expect(page.getByRole("button", { name: /^小球\+挑高，10秒/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^接发深回中路，8秒/ })).toHaveCount(0);

  const singles = page.getByRole("button", { name: /^单项打法/ });
  const combinations = page.getByRole("button", { name: /^组合打法/ });
  await press(combinations);
  await expect(combinations).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /打开压深后引上网/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /打开接发稳住再上网/ })).toHaveCount(0);
  await press(page.getByRole("button", { name: "先稳住", exact: true }));
  await expect(page.getByRole("button", { name: /打开接发稳住再上网/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /打开压深后引上网/ })).toHaveCount(0);
  await press(singles);
  await expect(singles).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^接发深回中路，8秒/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^小球\+挑高，10秒/ })).toHaveCount(0);
});

test("keeps the board focused and does not reintroduce an unfinished training CTA", async ({ page }) => {
  await press(page.getByRole("button", { name: "找个打法", exact: true }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "先稳住", exact: true }));
  await press(page.getByRole("button", { name: /^防守高深回中，9秒/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "改成我的打法", exact: true }));
  await expectBoardEditor(page);
  await expectBoardEditorTitle(page, "防守高深回中");
  await expect.poll(async () => (await storedBoards(page)).length).toBe(0);
  await expect(page.getByRole("button", { name: "看怎么练", exact: true })).toHaveCount(0);
});

test("preserves a multi-frame single tactic and saves it only after an explicit edit", async ({ page }) => {
  await press(page.getByRole("button", { name: "找个打法", exact: true }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "先稳住", exact: true }));
  await press(page.getByRole("button", { name: /^防守高深回中，9秒/ }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "防守高深回中", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: "改成我的打法", exact: true }));
  await expectBoardEditor(page);
  await expectBoardEditorTitle(page, "防守高深回中");
  await expect.poll(async () => (await storedBoards(page)).length).toBe(0);

  const board = await renameCurrentBoardAndReadSaved(page, "单项战术结构检查");
  expect(await storedBoards(page)).toHaveLength(1);
  expect(board.sourceTacticId).toBe("defend-high-middle");
  expect(board.frames.length).toBeGreaterThan(1);
  expect(board.frames.flatMap((frame) => frame.paths).length).toBeGreaterThan(1);
});

test("preserves a full multi-beat combination and saves it only after an explicit edit", async ({ page }) => {
  await press(page.getByRole("button", { name: "找个打法", exact: true }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: /^组合打法/ }));
  await press(page.getByRole("button", { name: /打开发球后抢先手/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "思路", exact: true }));
  await waitForFlowSettled(page);
  await expect(page.getByRole("heading", { name: "发球后抢先手 · 思路", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: /^整套放入画板/ }));
  await expectBoardEditor(page);
  await expectBoardEditorTitle(page, "发球后抢先手");
  await expect.poll(async () => (await storedBoards(page)).length).toBe(0);

  const board = await renameCurrentBoardAndReadSaved(page, "组合打法结构检查");
  expect(await storedBoards(page)).toHaveLength(1);
  expect(board.frames.length).toBeGreaterThan(1);
  expect(board.frames.filter((frame) => frame.paths.length > 0).length).toBeGreaterThan(1);
  expect(board.frames.flatMap((frame) => frame.paths).length).toBeGreaterThan(1);
});

test("restores accessibility isolation after returning from a deep board to the board library", async ({ page }) => {
  await press(page.getByRole("button", { name: "找个打法", exact: true }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: /^组合打法/ }));
  await press(page.getByRole("button", { name: /打开发球后抢先手/ }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: "思路", exact: true }));
  await waitForFlowSettled(page);
  await press(page.getByRole("button", { name: /^整套放入画板/ }));
  await expectBoardEditor(page);

  await press(page.getByRole("button", { name: /打开.*的画板菜单/ }));
  await press(page.getByRole("button", { name: /草稿与模板/ }));
  await expect(page.getByRole("heading", { name: "草稿与模板", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: "画一条新球路", exact: true }));
  await expectBoardEditor(page);

  const inactiveScreens = page.locator('.flow-screen[data-flow-current="false"]');
  const inactiveCount = await inactiveScreens.count();
  expect(inactiveCount).toBeGreaterThan(0);
  for (let index = 0; index < inactiveCount; index += 1) {
    await expect(inactiveScreens.nth(index)).toHaveAttribute("inert", "");
    await expect(inactiveScreens.nth(index)).toHaveAttribute("aria-hidden", "true");
  }
  await page.keyboard.press("Tab");
  await expect.poll(async () => page.evaluate(() => document.activeElement?.closest('.flow-screen')?.getAttribute('data-flow-current'))).toBe("true");
});
