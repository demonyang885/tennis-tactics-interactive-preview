import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterBoard, type BoardDocument } from "../src/board/model";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";

type BoardPurpose = "tactic" | "practice" | "review";
type CategorizedBoard = BoardDocument & { purpose: BoardPurpose };

const purposeFixtures: Array<{
  purpose: BoardPurpose;
  label: "战术" | "练习" | "比赛回顾";
  id: string;
  title: string;
  updatedAt: string;
}> = [
  {
    purpose: "tactic",
    label: "战术",
    id: "history-tactic-board",
    title: "反手位发球球路",
    updatedAt: "2026-09-15T10:00:00.000Z",
  },
  {
    purpose: "practice",
    label: "练习",
    id: "history-practice-board",
    title: "发球后第一步练习",
    updatedAt: "2026-09-15T11:00:00.000Z",
  },
  {
    purpose: "review",
    label: "比赛回顾",
    id: "history-review-board",
    title: "第二盘关键一分",
    updatedAt: "2026-09-15T12:00:00.000Z",
  },
];

function categorizedBoard(
  id: string,
  title: string,
  purpose: BoardPurpose,
  updatedAt: string,
): CategorizedBoard {
  const starter = createStarterBoard(title);
  const ball = starter.actors.find((actor) => actor.kind === "ball");
  if (!ball) throw new Error("starter board is missing its ball");
  const { smartRally: _smartRally, ...manualBoard } = starter;

  return {
    ...manualBoard,
    id,
    title,
    purpose,
    updatedAt,
    frames: [{
      ...manualBoard.frames[0],
      duration: 1.4,
      paths: [{
        id: `${id}-serve`,
        kind: "shot",
        actorId: ball.id,
        from: [...manualBoard.frames[0].poses[ball.id]],
        to: [0.3, 0.18],
        control: [0.72, 0.5],
      }],
    }],
  };
}

function seededBoards(): CategorizedBoard[] {
  return purposeFixtures.map(({ id, title, purpose, updatedAt }) => (
    categorizedBoard(id, title, purpose, updatedAt)
  ));
}

async function openHomepage(page: Page, boards: BoardDocument[] = []) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ key, serialized }) => {
    window.localStorage.clear();
    if (serialized) window.localStorage.setItem(key, serialized);
  }, {
    key: STORAGE_KEY,
    serialized: boards.length ? JSON.stringify({ version: 1, boards }) : "",
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
}

async function storedBoards(page: Page): Promise<CategorizedBoard[]> {
  return page.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    if (!serialized) return [];
    return (JSON.parse(serialized) as { boards: CategorizedBoard[] }).boards;
  }, STORAGE_KEY);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const selectors = [
      "html",
      "body",
      '[data-testid="device-screen"]',
      '[data-testid="mobile-scroll"]',
      ".board-home-portrait",
      '[data-testid="home-history-hub"]',
    ];
    return selectors.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing overflow target: ${selector}`);
      return { selector, overflow: element.scrollWidth - element.clientWidth };
    });
  });

  for (const result of overflow) {
    expect(result.overflow, `${result.selector} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "touch target should have a rendered box").not.toBeNull();
  expect(box!.width, "touch target should be at least 44px wide").toBeGreaterThanOrEqual(44);
  expect(box!.height, "touch target should be at least 44px tall").toBeGreaterThanOrEqual(44);
}

async function openBoardMenu(page: Page) {
  const toolbar = page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true });
  const menu = toolbar.getByRole("button", { name: /打开.*的画板菜单/ });
  await expect(menu).toBeVisible();
  await menu.click();
}

async function renameCurrentBoard(page: Page, title: string) {
  await openBoardMenu(page);
  const sheet = page.getByTestId("bottom-sheet");
  await sheet.getByRole("button", { name: /修改名称/ }).click();
  const renameLayer = page.getByTestId("board-rename-layer");
  await expect(renameLayer).toBeVisible();
  await renameLayer.getByLabel("画板名称", { exact: true }).fill(title);
  await renameLayer.getByRole("button", { name: "完成", exact: true }).click();
  await expect(renameLayer).toBeHidden();
  await expect(page.getByTestId("board-save-live")).toHaveText("画板已保存", { timeout: 3_000 });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  test(`keeps categorized history below the board-first viewport at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openHomepage(page, seededBoards());

    const scroll = page.getByTestId("flow-current").getByTestId("mobile-scroll");
    const history = page.getByTestId("home-history-hub");
    const cue = page.getByTestId("home-scroll-cue");
    const board = page.getByTestId("home-board-playback");
    const [scrollBox, historyBox] = await Promise.all([scroll.boundingBox(), history.boundingBox()]);

    expect(scrollBox).not.toBeNull();
    expect(historyBox).not.toBeNull();
    expect(historyBox!.y).toBeGreaterThanOrEqual(scrollBox!.y + scrollBox!.height - 1);
    await expect(board).toBeInViewport();
    await expect(cue).toBeInViewport();
    await expect(cue).toHaveAttribute("aria-label", "上滑查看画板历史");
    await expectTouchTarget(cue);
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 390) {
      await cue.click();
    } else {
      await scroll.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "auto" }));
    }
    await expect(history).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });
}

test("filters history by purpose, shows full labels, and opens the exact saved board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomepage(page, seededBoards());
  await page.getByTestId("home-scroll-cue").click();

  const history = page.getByTestId("home-history-hub");
  await expect(history).toBeInViewport();

  for (const fixture of purposeFixtures) {
    const filter = history.getByRole("button", { name: fixture.label, exact: true });
    await expectTouchTarget(filter);
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");

    const visibleRows = history.getByTestId("home-history-board");
    await expect(visibleRows).toHaveCount(1);
    const row = history.locator(`[data-testid="home-history-board"][data-board-id="${fixture.id}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByText(fixture.label, { exact: true })).toBeVisible();
    await expect(row).toContainText(fixture.title);
    await expectTouchTarget(row);
  }

  const review = purposeFixtures.find((fixture) => fixture.purpose === "review");
  if (!review) throw new Error("review fixture is missing");
  await history.getByRole("button", { name: review.label, exact: true }).click();
  await history.locator(`[data-testid="home-history-board"][data-board-id="${review.id}"]`).click();

  const toolbar = page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true });
  await expect(toolbar.getByLabel("RallyPath", { exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: `打开${review.title}的画板菜单`, exact: true })).toBeVisible();
});

test("persists a genuinely edited recall board as a match review and finds it from home", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomepage(page);

  await page.getByRole("button", { name: "记下刚才一分", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  expect(await storedBoards(page)).toHaveLength(0);

  const editedTitle = "决胜局的长回合";
  await renameCurrentBoard(page, editedTitle);
  await expect.poll(async () => (await storedBoards(page)).length).toBe(1);
  const [saved] = await storedBoards(page);
  expect(saved.title).toBe(editedTitle);
  expect(saved.purpose).toBe("review");

  await page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true })
    .getByRole("button", { name: "返回上一页", exact: true }).click();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
  await page.getByTestId("home-scroll-cue").click();

  const history = page.getByTestId("home-history-hub");
  await history.getByRole("button", { name: "比赛回顾", exact: true }).click();
  const savedRow = history.locator(`[data-testid="home-history-board"][data-board-id="${saved.id}"]`);
  await expect(savedRow).toContainText(editedTitle);
  await expect(savedRow.getByText("比赛回顾", { exact: true })).toBeVisible();
});

test("creates a practice board from the selected home context only after a real edit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHomepage(page);
  await page.getByTestId("home-scroll-cue").click();

  const history = page.getByTestId("home-history-hub");
  const practiceFilter = history.getByRole("button", { name: "练习", exact: true });
  await practiceFilter.click();
  await expect(practiceFilter).toHaveAttribute("aria-pressed", "true");
  await history.locator(".home-history-new").click();

  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  expect(await storedBoards(page)).toHaveLength(0);

  const editedTitle = "周三发球落点练习";
  await renameCurrentBoard(page, editedTitle);
  await expect.poll(async () => (await storedBoards(page)).length).toBe(1);
  const [saved] = await storedBoards(page);
  expect(saved.title).toBe(editedTitle);
  expect(saved.purpose).toBe("practice");
});
