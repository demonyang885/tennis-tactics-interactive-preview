import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterBoard, type BoardDocument } from "../src/board/model";
import { expandBoardTools, openBoardSettings, openWorkspaceLibrary, waitForWorkspace } from "./workspace-navigation";

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

async function openWorkspace(page: Page, boards: BoardDocument[] = []) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, boards }) => {
    window.localStorage.clear();
    if (boards.length) window.localStorage.setItem(key, JSON.stringify({ version: 1, boards }));
  }, { key: STORAGE_KEY, boards });
  await page.reload();
  await waitForWorkspace(page);
}

async function storedBoards(page: Page): Promise<CategorizedBoard[]> {
  return page.evaluate((key) => {
    const serialized = window.localStorage.getItem(key);
    return serialized ? JSON.parse(serialized).boards : [];
  }, STORAGE_KEY);
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => [document.documentElement, document.body, document.querySelector<HTMLElement>('[data-testid="flow-current"]')!]
    .map(element => element.scrollWidth - element.clientWidth));
  for (const overflow of sizes) expect(overflow).toBeLessThanOrEqual(1);
}

async function renameCurrentBoard(page: Page, title: string) {
  await openBoardSettings(page);
  await page.getByTestId("bottom-sheet").getByRole("button", { name: "修改名称", exact: true }).click();
  const renameLayer = page.getByTestId("board-rename-layer");
  await renameLayer.getByLabel("画板名称", { exact: true }).fill(title);
  await renameLayer.getByRole("button", { name: "完成", exact: true }).click();
  await expect(renameLayer).toBeHidden();
  await expect(page.getByTestId("flow-current").getByTestId("board-save-live")).toHaveText("画板已保存");
}

async function expectCurrentTitle(page: Page, title: string) {
  await expandBoardTools(page);
  await expect(page.getByRole("button", { name: `打开${title}的画板菜单`, exact: true })).toBeVisible();
  await page.getByTestId("flow-current").locator("[data-dock-expand]").click();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 700 }, { width: 820, height: 1180 }]) {
  test(`keeps history one icon away without horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openWorkspace(page, seededBoards());
    await expectNoHorizontalOverflow(page);
    await expectTouchTarget(page.getByRole("button", { name: "我的画板", exact: true }));
    await openWorkspaceLibrary(page);
    for (const fixture of purposeFixtures) {
      const row = page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: fixture.title });
      await row.scrollIntoViewIfNeeded();
      await expect(row).toContainText(fixture.label);
      await expectTouchTarget(row);
    }
    await expectNoHorizontalOverflow(page);
    expect(await storedBoards(page)).toHaveLength(3);
  });
}

test("library preserves every purpose label and opens the exact saved document", async ({ page }) => {
  const originals = seededBoards();
  await openWorkspace(page, originals);
  for (const fixture of purposeFixtures) {
    await openWorkspaceLibrary(page);
    const row = page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: fixture.title });
    await expect(row).toContainText(fixture.label);
    await row.click();
    await waitForWorkspace(page);
    await expectCurrentTitle(page, fixture.title);
    const current = (await storedBoards(page)).find(board => board.id === fixture.id);
    expect(current).toEqual(originals.find(board => board.id === fixture.id));
  }
});

for (const purpose of ["review", "practice"] as const) {
  test(`editing and reopening a saved ${purpose} board preserves its purpose and routes`, async ({ page }) => {
    const fixture = seededBoards().find(board => board.purpose === purpose)!;
    await openWorkspace(page, [fixture]);
    const title = purpose === "review" ? "决胜局的长回合" : "周三发球落点练习";
    await renameCurrentBoard(page, title);
    const [saved] = await storedBoards(page);
    expect(saved.id).toBe(fixture.id);
    expect(saved.title).toBe(title);
    expect(saved.purpose).toBe(purpose);
    expect(saved.frames).toEqual(fixture.frames);
    expect(saved.actors).toEqual(fixture.actors);
    await page.reload();
    await waitForWorkspace(page);
    await expectCurrentTitle(page, title);
    await openWorkspaceLibrary(page);
    const row = page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: title });
    await expect(row).toContainText(purpose === "review" ? "比赛回顾" : "练习");
    expect(await storedBoards(page)).toHaveLength(1);
  });
}

test("a new board remains unsaved until an explicit edit and appears once in the library", async ({ page }) => {
  await openWorkspace(page);
  expect(await storedBoards(page)).toHaveLength(0);
  await openWorkspaceLibrary(page);
  await page.getByRole("button", { name: "画一条新球路", exact: true }).click();
  await waitForWorkspace(page);
  expect(await storedBoards(page)).toHaveLength(0);
  await renameCurrentBoard(page, "周五接发练习");
  const [saved] = await storedBoards(page);
  expect(saved.purpose).toBe("tactic");
  expect(saved.title).toBe("周五接发练习");
  await openWorkspaceLibrary(page);
  await expect(page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: saved.title })).toHaveCount(1);
  expect(await storedBoards(page)).toHaveLength(1);
});
