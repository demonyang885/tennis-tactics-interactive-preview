import { waitForWorkspace, openBoardSettings, openWorkspaceLibrary } from "./workspace-navigation";
import { expect, test, type Page } from "@playwright/test";
import { createStarterBoard, type BoardDocument } from "../src/board/model";
import { BOARD_STORAGE_KEY } from "../src/board/storage";
import { BOARD_DELETE_JOURNAL_KEY } from "../src/learning/deleteJournal";
import { BOARD_DISCOVERY_STORAGE_KEY, type BoardDiscovery } from "../src/learning/discovery";
import { BOARD_FOLLOW_UP_STORAGE_KEY, type BoardFollowUp } from "../src/learning/followUp";
import { type BoardLearningChoice } from "../src/learning/model";
import { BOARD_LEARNING_STORAGE_KEY } from "../src/learning/storage";
import { confirmBoardDeletion } from "./board-library-helpers";

const TARGET_ID = "delete-confirmation-target";
const COMPANION_ID = "delete-confirmation-companion";
const TARGET_TITLE = "待确认删除的画板";
const UPDATED_AT = "2026-09-25T00:00:00.000Z";
const storageKeys = {
  boards: BOARD_STORAGE_KEY,
  learning: BOARD_LEARNING_STORAGE_KEY,
  followUp: BOARD_FOLLOW_UP_STORAGE_KEY,
  discovery: BOARD_DISCOVERY_STORAGE_KEY,
  journal: BOARD_DELETE_JOURNAL_KEY,
};

function authoredBoard(id: string, title: string): BoardDocument {
  const starter = createStarterBoard(title);
  const ball = starter.actors.find(actor => actor.kind === "ball");
  if (!ball) throw new Error("starter board is missing its ball");
  const { smartRally: _smartRally, ...manual } = starter;
  return {
    ...manual,
    id,
    purpose: "tactic",
    updatedAt: UPDATED_AT,
    frames: [{
      ...manual.frames[0],
      duration: 2.4,
      paths: [{
        id: `${id}-serve`,
        kind: "shot",
        actorId: ball.id,
        from: [...manual.frames[0].poses[ball.id]],
        to: [0.32, 0.18],
        control: [0.73, 0.5],
      }],
    }],
  };
}

function linkedFixtures(title = TARGET_TITLE) {
  const boards = [
    authoredBoard(TARGET_ID, title),
    authoredBoard(COMPANION_ID, "必须保留的另一份画板"),
  ];
  const learning: BoardLearningChoice[] = boards.map(board => ({
    version: 1,
    boardId: board.id,
    route: "skill",
    skillId: "recovery",
    updatedAt: UPDATED_AT,
  }));
  const followUp: BoardFollowUp[] = boards.map(board => ({
    version: 1,
    id: `${board.id}-follow-up`,
    boardId: board.id,
    frameId: board.frames[0].id,
    progress: .65,
    skillId: "recovery",
    skillLabel: "击球后回位",
    question: "击球以后，能不能先回到下一拍的位置？",
    note: `${board.title}的练后记录`,
    uncertain: false,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  }));
  const discovery: BoardDiscovery[] = boards.map(board => ({
    version: 1,
    id: `${board.id}-discovery`,
    boardId: board.id,
    frameId: board.frames[0].id,
    progress: .4,
    note: `${board.title}的个人发现`,
    nextTry: "下次先回位，再准备击球",
    uncertain: false,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  }));
  return { boards, learning, followUp, discovery };
}

async function storageSnapshot(page: Page) {
  return page.evaluate(keys => ({
    boards: localStorage.getItem(keys.boards),
    learning: localStorage.getItem(keys.learning),
    followUp: localStorage.getItem(keys.followUp),
    discovery: localStorage.getItem(keys.discovery),
    journal: localStorage.getItem(keys.journal),
  }), storageKeys);
}

async function openLibrary(page: Page) {
  await waitForWorkspace(page);
  await openWorkspaceLibrary(page);
  await expect(page.getByRole("heading", { name: "打开一份画板", exact: true })).toBeVisible();
  await expect(page.locator(".board-draft-delete")).toHaveCount(2);
}

async function seedAndOpenLibrary(page: Page, title = TARGET_TITLE) {
  const fixtures = linkedFixtures(title);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ keys, fixtures }) => {
    localStorage.clear();
    // Keep intentional whitespace so cancel assertions also catch a rewrite
    // of valid existing storage, even if the parsed values are unchanged.
    localStorage.setItem(keys.boards, JSON.stringify({ version: 1, boards: fixtures.boards }, null, 2));
    for (const key of ["learning", "followUp", "discovery"] as const) {
      localStorage.setItem(keys[key], JSON.stringify({ version: 1, records: fixtures[key] }, null, 2));
    }
  }, { keys: storageKeys, fixtures });
  await page.reload();
  await openLibrary(page);
  return fixtures;
}

function confirmation(page: Page) {
  return page.getByRole("dialog", { name: "删除画板？", exact: true });
}

async function expectCompanionOnly(page: Page, fixtures: ReturnType<typeof linkedFixtures>) {
  const stored = await storageSnapshot(page);
  expect(JSON.parse(stored.boards!).boards).toEqual([fixtures.boards[1]]);
  for (const key of ["learning", "followUp", "discovery"] as const) {
    expect(JSON.parse(stored[key]!).records).toEqual([fixtures[key][1]]);
  }
  expect(stored.journal).toBeNull();
  await expect(page.getByRole("button", { name: `删除${fixtures.boards[0].title}`, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `删除${fixtures.boards[1].title}`, exact: true })).toBeVisible();
}

test("opening and canceling deletion leaves the board, linked records, and journal untouched", async ({ page }) => {
  await seedAndOpenLibrary(page);
  const before = await storageSnapshot(page);
  await page.getByRole("button", { name: `删除${TARGET_TITLE}`, exact: true }).click();
  const sheet = confirmation(page);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".board-delete-confirmation-title")).toHaveText(TARGET_TITLE);
  await expect(sheet).toHaveAccessibleDescription("画板与关联的技能选择、旧记录会从本机删除，无法撤销。");
  expect(await storageSnapshot(page)).toEqual(before);
  expect(before.journal).toBeNull();

  await sheet.getByRole("button", { name: "取消", exact: true }).click();
  await expect(sheet).toBeHidden();
  expect(await storageSnapshot(page)).toEqual(before);
  await expect(page.locator(".board-draft-delete")).toHaveCount(2);
});

test("confirmation removes only the named board and its linked records", async ({ page }) => {
  const fixtures = await seedAndOpenLibrary(page);
  await page.getByRole("button", { name: `删除${TARGET_TITLE}`, exact: true }).click();
  await confirmBoardDeletion(page);
  await expectCompanionOnly(page, fixtures);
});

test("deleting every saved board and returning to the workspace never resurrects the former editor", async ({ page }) => {
  const fixtures = await seedAndOpenLibrary(page);
  for (const board of fixtures.boards) {
    await page.getByRole("button", { name: `删除${board.title}`, exact: true }).click();
    await confirmBoardDeletion(page);
  }
  const deleted = await storageSnapshot(page);
  expect(deleted.boards ? JSON.parse(deleted.boards).boards : []).toEqual([]);
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await waitForWorkspace(page);
  expect(await storageSnapshot(page)).toEqual(deleted);
  await page.reload();
  await waitForWorkspace(page);
  expect(await storageSnapshot(page)).toEqual(deleted);
});

test("keyboard confirmation traps focus and Escape or cancel returns it to the delete button", async ({ page }) => {
  await seedAndOpenLibrary(page);
  const before = await storageSnapshot(page);
  const opener = page.getByRole("button", { name: `删除${TARGET_TITLE}`, exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const sheet = confirmation(page);
  const cancel = sheet.getByRole("button", { name: "取消", exact: true });
  const confirm = sheet.getByRole("button", { name: "确认删除", exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await storageSnapshot(page)).toEqual(before);

  await page.keyboard.press("Enter");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await storageSnapshot(page)).toEqual(before);
});

test("a board renamed in another tab while confirmation waits keeps its newer content and links", async ({ page }) => {
  await seedAndOpenLibrary(page);
  await page.getByRole("button", { name: `删除${TARGET_TITLE}`, exact: true }).click();
  const other = await page.context().newPage();
  try {
    await other.goto("/");
    await waitForWorkspace(other);
    await openBoardSettings(other);
    await other.getByRole("dialog", { name: "画板菜单", exact: true })
      .getByRole("button", { name: /^修改名称/ }).click();
    const rename = other.getByTestId("board-rename-layer");
    await rename.getByRole("textbox", { name: "画板名称", exact: true }).fill("另一页刚改好的画板");
    await rename.getByRole("button", { name: "完成", exact: true }).click();
    await expect.poll(async () => {
      const stored = await storageSnapshot(page);
      return JSON.parse(stored.boards!).boards.find((board: BoardDocument) => board.id === TARGET_ID)?.title;
    }).toBe("另一页刚改好的画板");
    const newer = await storageSnapshot(page);
    await expect(confirmation(page).locator(".board-delete-confirmation-title")).toHaveText(TARGET_TITLE);

    await confirmBoardDeletion(page);
    await expect(page.getByRole("status").filter({ hasText: "已在另一页修改，未删除" })).toBeVisible();
    expect(await storageSnapshot(page)).toEqual(newer);
    expect(newer.journal).toBeNull();
    await expect(page.getByRole("button", { name: "删除另一页刚改好的画板", exact: true })).toBeVisible();
  } finally {
    await other.close();
  }
});

test("confirmation does not resurrect a board already deleted in another tab", async ({ page }) => {
  const fixtures = await seedAndOpenLibrary(page);
  await page.getByRole("button", { name: `删除${TARGET_TITLE}`, exact: true }).click();
  const other = await page.context().newPage();
  try {
    await other.goto("/");
    await openLibrary(other);
    await other.getByRole("button", { name: `删除${TARGET_TITLE}`, exact: true }).click();
    await confirmBoardDeletion(other);
    await expectCompanionOnly(other, fixtures);
    const deleted = await storageSnapshot(page);

    await confirmBoardDeletion(page);
    await expect(page.getByRole("status").filter({ hasText: "已在另一页删除，列表已更新" })).toBeVisible();
    expect(await storageSnapshot(page)).toEqual(deleted);
    await expectCompanionOnly(page, fixtures);
  } finally {
    await other.close();
  }
});

test("retrying a failed delete asks for a fresh confirmation and can still be canceled", async ({ page }) => {
  const fixtures = await seedAndOpenLibrary(page);
  await page.evaluate(key => {
    const originalSetItem = Storage.prototype.setItem;
    let failOnce = true;
    Storage.prototype.setItem = function (storageKey: string, value: string) {
      if (this === localStorage && storageKey === key && failOnce) {
        failOnce = false;
        throw new Error("test delete failure");
      }
      return originalSetItem.call(this, storageKey, value);
    };
  }, BOARD_STORAGE_KEY);
  await page.getByRole("button", { name: `删除${TARGET_TITLE}`, exact: true }).click();
  await confirmBoardDeletion(page);
  const failure = page.getByRole("alert").filter({ hasText: "暂时无法删除" });
  await expect(failure).toBeVisible();
  const afterFailure = await storageSnapshot(page);
  expect(JSON.parse(afterFailure.boards!).boards).toEqual(fixtures.boards);
  for (const key of ["learning", "followUp", "discovery"] as const) {
    expect(JSON.parse(afterFailure[key]!).records).toEqual(expect.arrayContaining(fixtures[key]));
    expect(JSON.parse(afterFailure[key]!).records).toHaveLength(2);
  }
  expect(afterFailure.journal).toBeNull();

  const retry = failure.getByRole("button", { name: "再试一次", exact: true });
  await retry.click();
  await expect(confirmation(page)).toBeVisible();
  expect(await storageSnapshot(page)).toEqual(afterFailure);
  await confirmation(page).getByRole("button", { name: "取消", exact: true }).click();
  await expect(confirmation(page)).toBeHidden();
  await expect(retry).toBeFocused();
  expect(await storageSnapshot(page)).toEqual(afterFailure);

  await retry.click();
  await confirmBoardDeletion(page);
  await expectCompanionOnly(page, fixtures);
});

test.describe("narrow mobile confirmation", () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test("a maximum-length title stays in a sheet within five eighths of the screen with usable actions", async ({ page }, testInfo) => {
    const title = "这是一个需要完整确认才能删除的很长画板名称".repeat(6).slice(0, 120);
    const fixtures = await seedAndOpenLibrary(page, title);
    const before = await storageSnapshot(page);
    await page.getByRole("button", { name: `删除${title}`, exact: true }).click();
    const sheet = confirmation(page);
    await expect(sheet).toBeVisible();
    await expect.poll(() => sheet.evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)))
      .toBeLessThan(1);
    await expect(sheet.locator(".board-delete-confirmation-title")).toHaveText(title);
    const content = sheet.locator(".sheet-content");
    const cancel = sheet.getByRole("button", { name: "取消", exact: true });
    const confirm = sheet.getByRole("button", { name: "确认删除", exact: true });
    await confirm.scrollIntoViewIfNeeded();
    await expect(cancel).toBeInViewport();
    await expect(confirm).toBeInViewport();
    const layout = await sheet.evaluate(element => {
      const box = element.getBoundingClientRect();
      const screen = document.querySelector('[data-testid="device-screen"]')!.getBoundingClientRect();
      const buttons = Array.from(element.querySelectorAll("button")).map(button => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height, x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom };
      });
      return { height: box.height, x: box.x, right: box.right, y: box.y, bottom: box.bottom, screenHeight: screen.height,
        screenX: screen.x, screenRight: screen.right, screenBottom: screen.bottom, overflow: element.scrollWidth - element.clientWidth, buttons };
    });
    await page.screenshot({ path: testInfo.outputPath("narrow-long-title-delete-confirmation.png"), fullPage: true });
    expect(layout.height).toBeLessThanOrEqual(layout.screenHeight * 5 / 8 + 1);
    expect(layout.x).toBeGreaterThanOrEqual(layout.screenX - 1);
    expect(layout.right).toBeLessThanOrEqual(layout.screenRight + 1);
    expect(layout.bottom).toBeLessThanOrEqual(layout.screenBottom + 1);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(await content.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    for (const button of layout.buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.x).toBeGreaterThanOrEqual(layout.x);
      expect(button.right).toBeLessThanOrEqual(layout.right);
      expect(button.y).toBeGreaterThanOrEqual(layout.y);
      expect(button.bottom).toBeLessThanOrEqual(layout.bottom + 1);
    }

    await cancel.click();
    await expect(sheet).toBeHidden();
    expect(await storageSnapshot(page)).toEqual(before);
    await page.getByRole("button", { name: `删除${title}`, exact: true }).click();
    await confirmBoardDeletion(page);
    await expectCompanionOnly(page, fixtures);
  });
});
