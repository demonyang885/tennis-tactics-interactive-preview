import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createStarterBoard, type BoardDocument } from "../src/board/model";
import { parseBoardBackupJSON } from "../src/learning/storage";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";
const LEARNING_KEY = "rallypath:board-learning:v1";

function authoredBoard(): BoardDocument {
  const starter = createStarterBoard("并行编辑测试");
  const ball = starter.actors.find(actor => actor.kind === "ball");
  if (!ball) throw new Error("starter board is missing its ball");
  const { smartRally: _smartRally, ...manual } = starter;
  return {
    ...manual,
    id: "concurrent-edit-board",
    updatedAt: "2026-09-25T00:00:00.000Z",
    frames: [{
      ...manual.frames[0],
      duration: 2.4,
      paths: [{
        id: "concurrent-serve",
        kind: "shot",
        actorId: ball.id,
        from: [...manual.frames[0].poses[ball.id]],
        to: [0.32, 0.18],
        control: [0.73, 0.5],
      }],
    }],
  };
}

async function openSavedBoard(page: Page) {
  await page.goto("/");
  await page.getByTestId("home-board-open").click();
  await expect(page.getByRole("toolbar", { name: "战术板操作" })).toBeVisible();
}

async function renameFromBoard(page: Page, title: string) {
  const toolbar = page.getByRole("toolbar", { name: "战术板操作" });
  await toolbar.getByRole("button", { name: /打开.*的画板菜单/ }).click();
  await page.getByRole("dialog", { name: "画板菜单" }).getByRole("button", { name: /^修改名称/ }).click();
  const layer = page.getByTestId("board-rename-layer");
  await layer.getByRole("textbox", { name: "画板名称" }).fill(title);
  await layer.getByRole("button", { name: "完成" }).click();
  await expect(layer).toBeHidden();
}

async function storedTitle(page: Page) {
  return page.evaluate(key => {
    const serialized = localStorage.getItem(key);
    if (!serialized) throw new Error("Missing saved boards");
    const envelope = JSON.parse(serialized) as { boards: BoardDocument[] };
    return envelope.boards.find(board => board.id === "concurrent-edit-board")?.title;
  }, STORAGE_KEY);
}

async function openSkillDemo(page: Page, skillName: string) {
  await page.getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: "练一项" }).click();
  await page.getByRole("dialog", { name: "这次先练好一件事" }).getByRole("button", { name: new RegExp(skillName) }).last().click();
  await expect(page.getByTestId("skill-practice-board")).toBeVisible();
}

async function chooseSkill(page: Page, skillName: string) {
  await openSkillDemo(page, skillName);
  await page.getByRole("button", { name: new RegExp(`打开${skillName}训练说明`) }).click();
  await page.getByRole("dialog", { name: skillName, exact: true }).getByRole("button", { name: "练这个" }).click();
  await expect(page.getByRole("toolbar", { name: "战术板操作" })).toBeVisible();
}

test("a stale skill demo cannot replace another tab's newer skill choice", async ({ page }) => {
  test.setTimeout(45_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await openSavedBoard(page);
  await openSkillDemo(page, "击球后回位");

  const other = await page.context().newPage();
  try {
    await other.emulateMedia({ reducedMotion: "reduce" });
    await openSavedBoard(other);
    await chooseSkill(other, "发球落点");

    await page.getByRole("button", { name: /打开击球后回位训练说明/ }).click();
    const guide = page.getByRole("dialog", { name: "击球后回位" });
    await guide.getByRole("button", { name: "练这个" }).click();
    await expect(guide.getByRole("alert")).toContainText("另一页");
    await expect(page.getByTestId("skill-practice-board")).toBeVisible();
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), LEARNING_KEY);
    expect(stored).toMatchObject({ records: [{ skillId: "serve-placement" }] });
  } finally {
    await other.close();
  }
});

test("a stale tactic demo cannot replace another tab's newer skill choice", async ({ page }) => {
  test.setTimeout(45_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await openSavedBoard(page);
  await page.getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: /拉开空档/ }).click();
  await page.locator(".tactic-card").first().click();
  await expect(page.getByRole("button", { name: "选这个打法" })).toBeVisible();

  const other = await page.context().newPage();
  try {
    await other.emulateMedia({ reducedMotion: "reduce" });
    await openSavedBoard(other);
    await chooseSkill(other, "发球落点");

    await page.getByRole("button", { name: "选这个打法" }).click();
    await expect(page.getByRole("alert")).toContainText("另一页");
    await expect(page.getByRole("button", { name: "选这个打法" })).toBeVisible();
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), LEARNING_KEY);
    expect(stored).toMatchObject({ records: [{ route: "skill", skillId: "serve-placement" }] });

    await page.getByRole("button", { name: "返回上一页" }).click();
    await expect(page.getByRole("heading", { name: "找个打法", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭打法列表" }).click();
    await expect(page.getByRole("toolbar", { name: "战术板操作" })).toBeVisible();
    await page.getByTestId("board-learning-entry").click();
    await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: "练一项" }).click();
    await expect(page.getByRole("dialog", { name: "这次先练好一件事" })).toContainText("发球落点");
  } finally {
    await other.close();
  }
});

test("a stale tab cannot silently overwrite a board saved in another tab", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await page.getByTestId("home-board-open").click();
  await expect(page.getByRole("toolbar", { name: "战术板操作" })).toBeVisible();

  const other = await page.context().newPage();
  try {
    await openSavedBoard(other);
    await renameFromBoard(page, "先保存的改动");
    await expect.poll(() => storedTitle(page)).toBe("先保存的改动");

    await renameFromBoard(other, "后保存的改动");
    await expect(other.getByTestId("board-save-live")).toContainText("未保存");
    await expect(other.getByRole("alert")).toContainText("另一");
    await expect.poll(() => storedTitle(page)).toBe("先保存的改动");

    await other.getByRole("toolbar", { name: "战术板操作" }).getByRole("button", { name: "返回上一页" }).click();
    await expect(other.getByRole("toolbar", { name: "战术板操作" })).toBeVisible();
    await expect.poll(() => storedTitle(page)).toBe("先保存的改动");

    await other.getByRole("toolbar", { name: "战术板操作" }).getByRole("button", { name: /打开.*的画板菜单/ }).click();
    await other.getByRole("dialog", { name: "画板菜单" }).getByRole("button", { name: "保存与分享" }).click();
    const downloadPromise = other.waitForEvent("download");
    await other.getByRole("dialog", { name: "保存与分享" }).getByRole("button", { name: /备份画板/ }).click();
    const backup = JSON.parse(await readFile(await (await downloadPromise).path(), "utf8")) as { board: BoardDocument };
    expect(backup.board.title).toBe("后保存的改动");
  } finally {
    await other.close();
  }
  await expect.poll(() => storedTitle(page)).toBe("先保存的改动");
});

test("a deleted board cannot enter skill selection from an unchanged stale tab", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await page.getByTestId("home-board-open").click();
  await expect(page.getByTestId("board-learning-entry")).toBeVisible();

  const other = await page.context().newPage();
  try {
    await other.goto("/");
    await other.getByTestId("home-scroll-cue").click();
    await other.getByRole("button", { name: "全部画板" }).click();
    await other.getByRole("button", { name: "删除并行编辑测试" }).click();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    await page.getByTestId("board-learning-entry").click();
    await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: "练一项" }).click();
    const sheet = page.getByRole("dialog", { name: "这次先练好一件事" });
    await sheet.getByRole("button", { name: /击球后回位/ }).last().click();
    await expect(sheet.getByRole("alert")).toContainText("已删除");
    await expect(page.getByTestId("skill-practice-board")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("tennis-tactics:board-learning:v1"))).toBeNull();
  } finally {
    await other.close();
  }
});

test("a stale editor can save an independent copy after another tab deletes the original", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await page.getByTestId("home-board-open").click();
  await expect(page.getByRole("toolbar", { name: "战术板操作" })).toBeVisible();

  const other = await page.context().newPage();
  try {
    await other.goto("/");
    await other.getByTestId("home-scroll-cue").click();
    await other.getByRole("button", { name: "全部画板" }).click();
    await other.getByRole("button", { name: "删除并行编辑测试" }).click();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    await renameFromBoard(page, "删除后尚未保存的修改");
    await expect(page.getByTestId("board-save-live")).toContainText("未保存");
    await expect(page.getByRole("alert")).toContainText("已在另一个页面删除");

    await page.getByRole("toolbar", { name: "战术板操作" }).getByRole("button", { name: /打开.*的画板菜单/ }).click();
    await page.getByRole("dialog", { name: "画板菜单" }).getByRole("button", { name: "保存与分享" }).click();
    const share = page.getByRole("dialog", { name: "保存与分享" });
    await expect(share).toContainText("原画板已在另一页删除。当前画面尚未保存");
    await share.getByRole("button", { name: /另存一份/ }).click();
    await expect(share.getByRole("status").filter({ hasText: "当前原画板仍未保存" })).toContainText("副本「删除后尚未保存的修改 副本」已保存到此浏览器；当前原画板仍未保存。");

    const boards = await page.evaluate(key => {
      const serialized = localStorage.getItem(key);
      return serialized ? (JSON.parse(serialized) as { boards: BoardDocument[] }).boards : [];
    }, STORAGE_KEY);
    expect(boards).toHaveLength(1);
    expect(boards[0].id).not.toBe("concurrent-edit-board");
    expect(boards[0].title).toBe("删除后尚未保存的修改 副本");
    expect(boards[0].frames[0].paths).toHaveLength(1);

    await page.reload();
    await expect(page.getByRole("button", { name: /接着画删除后尚未保存的修改 副本/ })).toBeVisible();
  } finally {
    await other.close();
  }
});

test("deleting a board does not remove a newer learning choice written during deletion", async ({ page }) => {
  const board = authoredBoard();
  const oldChoice = { version: 1, boardId: board.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-25T00:00:00.000Z" };
  const newerChoice = { ...oldChoice, skillId: "serve-placement", updatedAt: "2026-09-26T00:00:00.000Z" };
  await page.goto("/");
  await page.evaluate(({ boardKey, learningKey, board, oldChoice }) => {
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(learningKey, JSON.stringify({ version: 1, records: [oldChoice] }));
  }, { boardKey: STORAGE_KEY, learningKey: LEARNING_KEY, board, oldChoice });
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  await expect(page.getByRole("button", { name: "删除并行编辑测试" })).toBeVisible();

  // Simulate another tab's write at the journal boundary, after the UI has
  // read the old choice but before it attempts to remove that relationship.
  await page.evaluate(({ learningKey, newerChoice }) => {
    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === "rallypath:board-delete-pending:v1" && !injected) {
        injected = true;
        originalSetItem.call(this, learningKey, JSON.stringify({ version: 1, records: [newerChoice] }));
      }
      return originalSetItem.call(this, key, value);
    };
  }, { learningKey: LEARNING_KEY, newerChoice });
  await page.getByRole("button", { name: "删除并行编辑测试" }).click();

  await expect(page.getByRole("alert")).toContainText("另一页改变");
  expect(await storedTitle(page)).toBe("并行编辑测试");
  const result = await page.evaluate(({ learningKey }) => ({
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null"),
    journal: localStorage.getItem("rallypath:board-delete-pending:v1"),
  }), { learningKey: LEARNING_KEY });
  expect(result.learning).toMatchObject({ records: [{ skillId: "serve-placement" }] });
  expect(result.journal).toBeNull();
});

test("deleting an unlinked board does not orphan a choice created just after the first link read", async ({ page }) => {
  const board = authoredBoard();
  const newChoice = { version: 1, boardId: board.id, route: "skill", skillId: "serve-placement", updatedAt: "2026-09-26T00:00:00.000Z" };
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board });
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  await page.evaluate(({ learningKey, choice }) => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    Storage.prototype.getItem = function (key) {
      const value = originalGetItem.call(this, key);
      if (this === localStorage && key === learningKey && !injected) {
        injected = true;
        originalSetItem.call(this, learningKey, JSON.stringify({ version: 1, records: [choice] }));
      }
      return value;
    };
  }, { learningKey: LEARNING_KEY, choice: newChoice });

  await page.getByRole("button", { name: "删除并行编辑测试" }).click();
  await expect(page.getByRole("alert")).toContainText("另一页");
  expect(await storedTitle(page)).toBe("并行编辑测试");
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), LEARNING_KEY);
  expect(stored).toMatchObject({ records: [{ boardId: board.id, skillId: "serve-placement" }] });
});

test("deleting an unlinked board restores it when a choice appears during the board write", async ({ page }) => {
  const board = authoredBoard();
  const newChoice = { version: 1, boardId: board.id, route: "skill", skillId: "serve-placement", updatedAt: "2026-09-26T00:00:00.000Z" };
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board });
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  await page.evaluate(({ boardKey, learningKey, choice }) => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    Storage.prototype.removeItem = function (key) {
      originalRemoveItem.call(this, key);
      if (this === localStorage && key === boardKey && !injected) {
        injected = true;
        originalSetItem.call(this, learningKey, JSON.stringify({ version: 1, records: [choice] }));
      }
    };
  }, { boardKey: STORAGE_KEY, learningKey: LEARNING_KEY, choice: newChoice });

  await page.getByRole("button", { name: "删除并行编辑测试" }).click();
  await expect(page.getByRole("alert")).toContainText("另一页改变");
  expect(await storedTitle(page)).toBe("并行编辑测试");
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), LEARNING_KEY);
  expect(stored).toMatchObject({ records: [{ boardId: board.id, skillId: "serve-placement" }] });
});

test("a failed post-delete restore offers the original board as an editable backup", async ({ page }) => {
  const board = authoredBoard();
  const newChoice = { version: 1, boardId: board.id, route: "skill", skillId: "serve-placement", updatedAt: "2026-09-26T00:00:00.000Z" };
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board });
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  await page.evaluate(({ boardKey, learningKey, choice }) => {
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    let allowRestore = false;
    Object.defineProperty(window, "__allowBoardRestoreTest", { value: () => { allowRestore = true; } });
    Storage.prototype.removeItem = function (key) {
      originalRemoveItem.call(this, key);
      if (this === localStorage && key === boardKey && !injected) {
        injected = true;
        originalSetItem.call(this, learningKey, JSON.stringify({ version: 1, records: [choice] }));
      }
    };
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === boardKey && injected && !allowRestore) throw new Error("board storage unavailable");
      return originalSetItem.call(this, key, value);
    };
  }, { boardKey: STORAGE_KEY, learningKey: LEARNING_KEY, choice: newChoice });

  await page.getByRole("button", { name: "删除并行编辑测试" }).click();
  await expect(page.getByRole("alert")).toContainText("画板暂时无法恢复");
  await expect(page.getByRole("status").filter({ hasText: "已删除" })).toHaveCount(0);
  await page.evaluate(key => window.dispatchEvent(new StorageEvent("storage", { key })), STORAGE_KEY);
  await expect(page.getByRole("button", { name: "下载画板备份" })).toBeVisible();
  await page.evaluate(key => {
    const originalGetItem = Storage.prototype.getItem;
    let blockRead = true;
    let blockedReads = 0;
    Object.defineProperty(window, "__boardReadFailureTest", { value: {
      stop: () => { blockRead = false; },
      get blockedReads() { return blockedReads; },
    } });
    Storage.prototype.getItem = function (itemKey) {
      if (this === localStorage && itemKey === key && blockRead) {
        blockedReads += 1;
        throw new Error("board read unavailable");
      }
      return originalGetItem.call(this, itemKey);
    };
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, STORAGE_KEY);
  expect(await page.evaluate(() => (window as unknown as { __boardReadFailureTest: { blockedReads: number } }).__boardReadFailureTest.blockedReads)).toBeGreaterThan(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("button", { name: "下载画板备份" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载画板备份" }).click();
  const backup = parseBoardBackupJSON(await readFile(await (await downloadPromise).path(), "utf8"));
  expect(backup.ok).toBe(true);
  if (!backup.ok) throw new Error(backup.error);
  expect(backup.value.board.id).toBe(board.id);
  expect(backup.value.board.frames[0].paths[0].id).toBe("concurrent-serve");
  expect(backup.value.learning?.skillId).toBe("serve-placement");
  await page.evaluate(() => (window as unknown as { __boardReadFailureTest: { stop: () => void } }).__boardReadFailureTest.stop());
  await page.evaluate(() => (window as unknown as { __allowBoardRestoreTest: () => void }).__allowBoardRestoreTest());
  await page.getByRole("button", { name: "重试恢复" }).click();
  await expect(page.getByRole("button", { name: "下载画板备份" })).toHaveCount(0);
  expect(await storedTitle(page)).toBe("并行编辑测试");
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  expect(await storedTitle(page)).toBe("并行编辑测试");
  const choice = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), LEARNING_KEY);
  expect(choice).toMatchObject({ records: [{ boardId: board.id, skillId: "serve-placement" }] });
});

test("deleting a board restores its old choice when another link type appears mid-delete", async ({ page }) => {
  const board = authoredBoard();
  const oldChoice = { version: 1, boardId: board.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-25T00:00:00.000Z" };
  const newDiscovery = { version: 1, id: "new-discovery", boardId: board.id, frameId: "opening", note: "另一页刚记录", nextTry: "", uncertain: false, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" };
  await page.goto("/");
  await page.evaluate(({ boardKey, learningKey, board, choice }) => {
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(learningKey, JSON.stringify({ version: 1, records: [choice] }));
  }, { boardKey: STORAGE_KEY, learningKey: LEARNING_KEY, board, choice: oldChoice });
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  await page.evaluate(discovery => {
    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === "rallypath:board-delete-pending:v1" && !injected) {
        injected = true;
        originalSetItem.call(this, "rallypath:board-discovery:v1", JSON.stringify({ version: 1, records: [discovery] }));
      }
      return originalSetItem.call(this, key, value);
    };
  }, newDiscovery);

  await page.getByRole("button", { name: "删除并行编辑测试" }).click();
  await expect(page.getByRole("alert")).toContainText("另一页");
  expect(await storedTitle(page)).toBe("并行编辑测试");
  const records = await page.evaluate(({ learningKey }) => ({
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null"),
    discovery: JSON.parse(localStorage.getItem("rallypath:board-discovery:v1") ?? "null"),
    journal: localStorage.getItem("rallypath:board-delete-pending:v1"),
  }), { learningKey: LEARNING_KEY });
  expect(records.learning).toMatchObject({ records: [{ skillId: "recovery" }] });
  expect(records.discovery).toMatchObject({ records: [{ note: "另一页刚记录" }] });
  expect(records.journal).toBeNull();
});

for (const linked of [
  {
    name: "retired practice note",
    key: "rallypath:board-follow-up:v1",
    old: { version: 1, id: "practice-note", boardId: "concurrent-edit-board", frameId: "opening", skillId: "recovery", skillLabel: "击球后回位", question: "这次先看回位", note: "先回位", uncertain: false, createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z" },
    newerNote: "另一页的新练后发现",
  },
  {
    name: "retired point discovery",
    key: "rallypath:board-discovery:v1",
    old: { version: 1, id: "point-discovery", boardId: "concurrent-edit-board", frameId: "opening", note: "先回位", nextTry: "再打深", uncertain: false, createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z" },
    newerNote: "另一页的新一分发现",
  },
]) {
  test(`deleting a board preserves a newer ${linked.name} written during deletion`, async ({ page }) => {
    const board = authoredBoard();
    const newer = { ...linked.old, note: linked.newerNote, updatedAt: "2026-09-26T00:00:00.000Z" };
    await page.goto("/");
    await page.evaluate(({ boardKey, linkedKey, board, old }) => {
      localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
      localStorage.setItem(linkedKey, JSON.stringify({ version: 1, records: [old] }));
    }, { boardKey: STORAGE_KEY, linkedKey: linked.key, board, old: linked.old });
    await page.reload();
    await page.getByTestId("home-scroll-cue").click();
    await page.getByRole("button", { name: "全部画板" }).click();
    await expect(page.getByRole("button", { name: "删除并行编辑测试" })).toBeVisible();
    await page.evaluate(({ linkedKey, newer }) => {
      const originalSetItem = Storage.prototype.setItem;
      let injected = false;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key === "rallypath:board-delete-pending:v1" && !injected) {
          injected = true;
          originalSetItem.call(this, linkedKey, JSON.stringify({ version: 1, records: [newer] }));
        }
        return originalSetItem.call(this, key, value);
      };
    }, { linkedKey: linked.key, newer });
    await page.getByRole("button", { name: "删除并行编辑测试" }).click();

    await expect(page.getByRole("alert")).toContainText("另一页改变");
    expect(await storedTitle(page)).toBe("并行编辑测试");
    const result = await page.evaluate(linkedKey => ({
      linked: JSON.parse(localStorage.getItem(linkedKey) ?? "null"),
      journal: localStorage.getItem("rallypath:board-delete-pending:v1"),
    }), linked.key);
    expect(result.linked).toMatchObject({ records: [{ note: linked.newerNote }] });
    expect(result.journal).toBeNull();
  });
}

test("a changed discovery aborts a partly completed delete and restores only the older removed link", async ({ page }) => {
  const board = authoredBoard();
  const oldChoice = { version: 1, boardId: board.id, route: "skill", skillId: "recovery", updatedAt: "2026-09-25T00:00:00.000Z" };
  const discovery = { version: 1, id: "discovery-linked", boardId: board.id, frameId: "opening", note: "先回位", nextTry: "再打深", uncertain: false, createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z" };
  const newerDiscovery = { ...discovery, note: "另一页刚写的新发现", updatedAt: "2026-09-26T00:00:00.000Z" };
  await page.goto("/");
  await page.evaluate(({ boardKey, learningKey, discoveryKey, board, oldChoice, discovery }) => {
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [board] }));
    localStorage.setItem(learningKey, JSON.stringify({ version: 1, records: [oldChoice] }));
    localStorage.setItem(discoveryKey, JSON.stringify({ version: 1, records: [discovery] }));
  }, { boardKey: STORAGE_KEY, learningKey: LEARNING_KEY, discoveryKey: "rallypath:board-discovery:v1", board, oldChoice, discovery });
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  await page.evaluate(newer => {
    const originalSetItem = Storage.prototype.setItem;
    let injected = false;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === "rallypath:board-delete-pending:v1" && !injected) {
        injected = true;
        originalSetItem.call(this, "rallypath:board-discovery:v1", JSON.stringify({ version: 1, records: [newer] }));
      }
      return originalSetItem.call(this, key, value);
    };
  }, newerDiscovery);
  await page.getByRole("button", { name: "删除并行编辑测试" }).click();

  await expect(page.getByRole("alert")).toContainText("另一页改变");
  expect(await storedTitle(page)).toBe("并行编辑测试");
  const result = await page.evaluate(({ learningKey, discoveryKey }) => ({
    learning: JSON.parse(localStorage.getItem(learningKey) ?? "null"),
    discovery: JSON.parse(localStorage.getItem(discoveryKey) ?? "null"),
    journal: localStorage.getItem("rallypath:board-delete-pending:v1"),
  }), { learningKey: LEARNING_KEY, discoveryKey: "rallypath:board-discovery:v1" });
  expect(result.learning).toMatchObject({ records: [{ skillId: "recovery" }] });
  expect(result.discovery).toMatchObject({ records: [{ note: "另一页刚写的新发现" }] });
  expect(result.journal).toBeNull();
});

test("a practice choice cannot attach to a board deleted while its demo is open", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await page.getByTestId("home-board-open").click();
  await page.getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: "练一项" }).click();
  await page.getByRole("dialog", { name: "这次先练好一件事" }).getByRole("button", { name: /击球后回位/ }).last().click();
  await expect(page.getByTestId("skill-practice-board")).toBeVisible();

  const other = await page.context().newPage();
  try {
    await other.goto("/");
    await other.getByTestId("home-scroll-cue").click();
    await other.getByRole("button", { name: "全部画板" }).click();
    await other.getByRole("button", { name: "删除并行编辑测试" }).click();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    await page.getByRole("button", { name: /打开击球后回位训练说明/ }).click();
    const guide = page.getByRole("dialog", { name: "击球后回位" });
    await guide.getByRole("button", { name: "练这个" }).click();
    await expect(guide.getByRole("alert")).toContainText("已删除");
    expect(await page.evaluate(() => localStorage.getItem("tennis-tactics:board-learning:v1"))).toBeNull();
  } finally {
    await other.close();
  }
});

test("a practice choice does not attach to a board changed while its demo is open", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await openSavedBoard(page);
  await openSkillDemo(page, "击球后回位");

  const other = await page.context().newPage();
  try {
    await openSavedBoard(other);
    await renameFromBoard(other, "另一页已修改的一分");
    await expect.poll(() => storedTitle(page)).toBe("另一页已修改的一分");

    await page.getByRole("button", { name: /打开击球后回位训练说明/ }).click();
    const guide = page.getByRole("dialog", { name: "击球后回位" });
    await guide.getByRole("button", { name: "练这个" }).click();
    await expect(guide.getByRole("alert")).toContainText("另一页修改");
    await expect(page.getByTestId("skill-practice-board")).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), LEARNING_KEY)).toBeNull();
  } finally {
    await other.close();
  }
});

test("a tactic choice cannot attach to a board deleted while its demo is open", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await page.getByTestId("home-board-open").click();
  await page.getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: /拉开空档/ }).click();
  await page.locator(".tactic-card").first().click();
  await expect(page.getByRole("button", { name: "选这个打法" })).toBeVisible();

  const other = await page.context().newPage();
  try {
    await other.goto("/");
    await other.getByTestId("home-scroll-cue").click();
    await other.getByRole("button", { name: "全部画板" }).click();
    await other.getByRole("button", { name: "删除并行编辑测试" }).click();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    await page.getByRole("button", { name: "选这个打法" }).click();
    await expect(page.getByRole("alert")).toContainText("已删除");
    expect(await page.evaluate(() => localStorage.getItem("tennis-tactics:board-learning:v1"))).toBeNull();
  } finally {
    await other.close();
  }
});

test("a tactic choice does not attach to a board changed while its demo is open", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await openSavedBoard(page);
  await page.getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: /拉开空档/ }).click();
  await page.locator(".tactic-card").first().click();
  await expect(page.getByRole("button", { name: "选这个打法" })).toBeVisible();

  const other = await page.context().newPage();
  try {
    await openSavedBoard(other);
    await renameFromBoard(other, "另一页已修改的一分");
    await expect.poll(() => storedTitle(page)).toBe("另一页已修改的一分");

    await page.getByRole("button", { name: "选这个打法" }).click();
    await expect(page.getByRole("alert")).toContainText("另一页修改");
    await expect(page.getByRole("button", { name: "选这个打法" })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), LEARNING_KEY)).toBeNull();
  } finally {
    await other.close();
  }
});

test("a tactic choice does not use a board changed while the category list is open", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: STORAGE_KEY, board: authoredBoard() });
  await page.reload();
  await openSavedBoard(page);
  await page.getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: /拉开空档/ }).click();

  const other = await page.context().newPage();
  try {
    await openSavedBoard(other);
    await renameFromBoard(other, "另一页已修改的一分");
    await expect.poll(() => storedTitle(page)).toBe("另一页已修改的一分");

    await page.locator(".tactic-card").first().click();
    await page.getByRole("button", { name: "选这个打法" }).click();
    await expect(page.getByRole("alert")).toContainText("另一页修改");
    expect(await page.evaluate(key => localStorage.getItem(key), LEARNING_KEY)).toBeNull();
  } finally {
    await other.close();
  }
});

test("retrying deletion from a stale library does not remove another tab's newer board", async ({ page }) => {
  const companion = { ...createStarterBoard("另一份画板"), id: "concurrent-companion-board" };
  await page.goto("/");
  await page.evaluate(({ key, boards }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, boards }));
  }, { key: STORAGE_KEY, boards: [authoredBoard(), companion] });
  await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByRole("button", { name: "全部画板" }).click();
  await expect(page.getByRole("button", { name: "删除并行编辑测试" })).toBeVisible();

  await page.evaluate(key => {
    const originalSetItem = Storage.prototype.setItem;
    let failOnce = true;
    Storage.prototype.setItem = function setItem(storageKey: string, value: string) {
      if (storageKey === key && failOnce) {
        failOnce = false;
        throw new Error("test delete failure");
      }
      return originalSetItem.call(this, storageKey, value);
    };
  }, STORAGE_KEY);
  await page.getByRole("button", { name: "删除并行编辑测试" }).click();
  const failure = page.getByRole("alert");
  await expect(failure).toContainText("暂时无法删除");

  const other = await page.context().newPage();
  try {
    await other.goto("/");
    await other.getByTestId("home-scroll-cue").click();
    await other.locator('[data-testid="home-history-board"][data-board-id="concurrent-edit-board"]').click();
    await renameFromBoard(other, "另一页改名后的画板");
    await expect.poll(() => storedTitle(page)).toBe("另一页改名后的画板");

    await failure.getByRole("button", { name: "再试一次" }).click();
    await expect.poll(() => storedTitle(page)).toBe("另一页改名后的画板");
    await expect(page.getByRole("status")).toContainText("另一页");
  } finally {
    await other.close();
  }
});
