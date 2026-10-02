import { expect, test, type Page } from "@playwright/test";
import { createStarterBoard, type BoardDocument, type Point } from "../src/board/model";
import { getBoardGeometry } from "../src/board/render";
import type { BoardDiscovery } from "../src/learning/discovery";
import type { BoardFollowUp } from "../src/learning/followUp";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const DISCOVERY_KEY = "rallypath:board-discovery:v1";
const FOLLOW_UP_KEY = "rallypath:board-follow-up:v1";
const LEARNING_KEY = "rallypath:board-learning:v1";
const starter = createStarterBoard();
const ballId = starter.actors.find(actor => actor.kind === "ball")!.id;
const point: BoardDocument = {
  ...starter, id: "v032-discovery-original", title: "我的发现原分", purpose: "review",
  smartRally: undefined, updatedAt: "2026-10-01T09:00:00.000Z",
  frames: [{ ...starter.frames[0], id: "opening", paths: [{ id: "serve", kind: "shot", actorId: ballId, from: [.64, .96], to: [.28, .18] }] },
    { ...starter.frames[0], id: "reply", label: "回球", poses: { ...starter.frames[0].poses, [ballId]: [.28, .18] }, paths: [{ id: "reply-shot", kind: "shot", actorId: ballId, from: [.28, .18], to: [.75, .85] }] }],
};

test.use({ viewport: { width: 1280, height: 900 } });
const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');
const canvas = (page: Page) => current(page).getByTestId("board-canvas");

async function settled(page: Page) {
  await expect(current(page)).toHaveCount(1);
  await expect.poll(() => current(page).evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(1);
}

async function fresh(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function openPoint(page: Page) {
  await fresh(page);
  await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] })), { key: BOARD_KEY, board: point });
  await page.reload();
  await page.getByRole("button", { name: `接着画${point.title}`, exact: true }).click();
  await settled(page); await expect(canvas(page)).toBeVisible();
}

async function openNotes(page: Page, kind: "point" | "practice" = "point") {
  await current(page).getByRole("button", { name: /打开.*的画板菜单/ }).click();
  const name = kind === "point" ? "一分的发现" : "练后发现";
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name, exact: true }).click();
  const sheet = page.getByRole("dialog", { name, exact: true });
  await expect(sheet).toBeVisible(); return sheet;
}

async function storedBoards(page: Page): Promise<BoardDocument[]> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{"boards":[]}').boards, BOARD_KEY);
}

async function pointRecords(page: Page): Promise<BoardDiscovery[]> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{"records":[]}').records, DISCOVERY_KEY);
}

async function seedTacticChoice(page: Page) {
  const original = JSON.stringify({ version: 1, records: [{ version: 1, boardId: point.id, route: "tactic", tacticId: "serve-plus-one", updatedAt: "2026-10-01T09:00:00.000Z" }] });
  await page.evaluate(({ key, value }) => { localStorage.setItem(key, value); window.dispatchEvent(new Event("rallypath-board-learning-changed")); }, { key: LEARNING_KEY, value: original });
  return original;
}

async function openPracticeFollowUp(page: Page) {
  await current(page).getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？", exact: true }).getByRole("button", { name: "练一项", exact: true }).click();
  await page.getByRole("dialog", { name: "这次先练好一件事", exact: true }).getByRole("button", { name: /^接发深度/ }).click();
  await settled(page);
  await page.getByRole("button", { name: "打开接发深度训练说明", exact: true }).click();
  await page.getByRole("dialog", { name: "接发深度", exact: true }).getByRole("button", { name: "练后发现", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "练后发现", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("combobox", { name: "这次练的技能", exact: true })).toHaveValue("return-depth");
  return sheet;
}

test("A1: home note entry is visible and optional, cancelling creates no board or note", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "记下刚才一分", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "一分的发现", exact: true });
  await expect(sheet.getByRole("textbox", { name: "发现了什么", exact: true })).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "下次想试", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "保存发现", exact: true })).toBeDisabled();
  await sheet.getByRole("button", { name: "先不记", exact: true }).click();
  await expect(sheet).toBeHidden();
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click();
  await settled(page);
  expect(await storedBoards(page)).toEqual([]);
  expect(await pointRecords(page)).toEqual([]);
});

test("A2: save a new home discovery and find the same editable note after return and refresh", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: "记下刚才一分", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "一分的发现", exact: true });
  await sheet.getByRole("textbox", { name: "发现了什么", exact: true }).fill("接发太短，下一拍很被动");
  await sheet.getByRole("textbox", { name: "下次想试", exact: true }).fill("先回深中路");
  await sheet.getByRole("button", { name: "保存发现", exact: true }).click();
  await expect(sheet).toBeHidden();
  const [savedBoard] = await storedBoards(page), [savedNote] = await pointRecords(page);
  expect(savedBoard.purpose).toBe("review");
  expect(savedNote).toMatchObject({ boardId: savedBoard.id, note: "接发太短，下一拍很被动", nextTry: "先回深中路" });
  expect(savedBoard.frames.flatMap(frame => frame.marks)).toEqual([]);
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click();
  await settled(page); await page.reload();
  await page.getByTestId("home-scroll-cue").click();
  await page.getByTestId("home-history-hub").getByRole("button", { name: "比赛回顾", exact: true }).click();
  await page.getByTestId("home-history-board").filter({ hasText: savedBoard.title }).click();
  await settled(page);
  const reopened = await openNotes(page);
  await expect(reopened.getByRole("textbox", { name: "发现了什么", exact: true })).toHaveValue(savedNote.note);
  await expect(reopened.getByRole("textbox", { name: "下次想试", exact: true })).toHaveValue(savedNote.nextTry);
  await reopened.getByRole("textbox", { name: "发现了什么", exact: true }).fill("先回深中路，回位时间更多了");
  await reopened.getByRole("button", { name: "保存发现", exact: true }).click();
  expect(await storedBoards(page)).toHaveLength(1);
  expect(await pointRecords(page)).toMatchObject([{ id: savedNote.id, boardId: savedBoard.id, createdAt: savedNote.createdAt, note: "先回深中路，回位时间更多了" }]);
});

test("A3: notes can select a beat and save uncertainty without requiring text", async ({ page }) => {
  await openPoint(page);
  const before = await storedBoards(page), sheet = await openNotes(page);
  await sheet.getByRole("combobox", { name: "记录在哪一拍", exact: true }).selectOption("reply");
  await sheet.getByRole("checkbox", { name: "还不确定，下次再看", exact: true }).check();
  await sheet.getByRole("button", { name: "保存发现", exact: true }).click();
  expect(await storedBoards(page)).toEqual(before);
  expect(await pointRecords(page)).toMatchObject([{ boardId: point.id, frameId: "reply", note: "", nextTry: "", uncertain: true }]);
  const reopened = await openNotes(page);
  await expect(reopened.getByRole("combobox", { name: "记录在哪一拍", exact: true })).toHaveValue("reply");
  await expect(reopened.getByRole("checkbox", { name: "还不确定，下次再看", exact: true })).toBeChecked();
});

test("practice follow-up saves on the original board without replacing its selected tactic", async ({ page }) => {
  await openPoint(page);
  const originalChoice = await seedTacticChoice(page);
  const before = await storedBoards(page);
  const sheet = await openPracticeFollowUp(page);
  await sheet.getByRole("textbox", { name: "练后发现了什么", exact: true }).fill("接发过了发球线，下一拍有时间回位");
  await sheet.getByRole("button", { name: "保存发现", exact: true }).click();
  expect(await storedBoards(page)).toEqual(before);
  const followUps = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).records as BoardFollowUp[], FOLLOW_UP_KEY);
  expect(followUps).toMatchObject([{ boardId: point.id, skillId: "return-depth", note: "接发过了发球线，下一拍有时间回位" }]);
  expect(await page.evaluate(key => localStorage.getItem(key), LEARNING_KEY)).toBe(originalChoice);
  await page.reload();
  await page.getByRole("button", { name: `接着画${point.title}`, exact: true }).click(); await settled(page);
  const reopened = await openNotes(page, "practice");
  await expect(reopened.getByRole("textbox", { name: "练后发现了什么", exact: true })).toHaveValue(followUps[0].note);
});

test("cancelling practice follow-up preserves the original board, tactic choice and note keys", async ({ page }) => {
  await openPoint(page);
  await seedTacticChoice(page);
  const existingNote = { version: 1, id: "original-point-discovery", boardId: point.id, frameId: "opening", note: "原来的发现", nextTry: "继续观察", uncertain: false, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" };
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] })), { key: DISCOVERY_KEY, record: existingNote });
  const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, LEARNING_KEY, DISCOVERY_KEY, FOLLOW_UP_KEY]);
  const sheet = await openPracticeFollowUp(page);
  await sheet.getByRole("textbox", { name: "练后发现了什么", exact: true }).fill("这次先不保存");
  await sheet.getByRole("button", { name: "先不记", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(canvas(page)).toBeVisible();
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, LEARNING_KEY, DISCOVERY_KEY, FOLLOW_UP_KEY])).toEqual(before);
});

test("A4: complete multiple interactive choices and save a discovery on the self-authored original point", async ({ page }) => {
  test.setTimeout(90_000);
  await fresh(page);
  await page.getByRole("button", { name: "想下一分", exact: true }).click(); await settled(page);
  const metrics = await canvas(page).evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, rect: element.getBoundingClientRect().toJSON() }));
  const pixel = (point: Point) => { const value = getBoardGeometry(metrics.width, metrics.height).toCanvas(point); return { x: metrics.rect.x + value[0] * metrics.rect.width / metrics.width, y: metrics.rect.y + value[1] * metrics.rect.height / metrics.height }; };
  const from = pixel([.64, .96]), to = pixel([.28, .18]);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await storedBoards(page))[0]?.frames[0].paths.length).toBe(1);
  const before = await storedBoards(page);
  await current(page).getByTestId("board-learning-entry").click();
  await page.getByRole("dialog", { name: "这分卡在哪？", exact: true }).getByRole("button", { name: "看看全部打法", exact: true }).click();
  await page.getByRole("button", { name: /^打开接发稳住再上网互动对打/ }).click();
  for (let decision = 0; decision < 2; decision++) {
    const choices = current(page).locator(".rally-choice-button");
    await expect(choices.first()).toBeVisible({ timeout: 22_000 });
    await choices.first().click();
    await expect(current(page).getByText(`回合第 ${decision + 2} 段`, { exact: true })).toBeVisible();
  }
  await current(page).getByRole("button", { name: "记下这一分的发现", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "一分的发现", exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: "发现了什么", exact: true }).fill("先看回球深浅，有短球才上网");
  await sheet.getByRole("button", { name: "保存发现", exact: true }).click();
  expect(await storedBoards(page)).toEqual(before);
  expect(await pointRecords(page)).toMatchObject([{ boardId: before[0].id, note: "先看回球深浅，有短球才上网" }]);
  await expect(canvas(page)).toBeVisible();
});

test("a concurrent note update is reported and preserves the other tab's record", async ({ page }) => {
  await openPoint(page);
  const sheet = await openNotes(page);
  await sheet.getByRole("textbox", { name: "发现了什么", exact: true }).fill("这一页的新发现");
  const external = { version: 1, id: "another-tab", boardId: point.id, frameId: "opening", note: "另一页刚保存的发现", nextTry: "保持深度", uncertain: false, createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z" };
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] })), { key: DISCOVERY_KEY, record: external });
  await sheet.getByRole("button", { name: "保存发现", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("已在另一页改变，未覆盖");
  expect(await pointRecords(page)).toEqual([external]);
  await expect(sheet.getByRole("textbox", { name: "发现了什么", exact: true })).toHaveValue("这一页的新发现");
});

test("failed note storage keeps the draft visible and does not claim it was saved", async ({ page }) => {
  await openPoint(page);
  const before = await storedBoards(page), sheet = await openNotes(page);
  await sheet.getByRole("textbox", { name: "发现了什么", exact: true }).fill("需要再看一次来球");
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (entry, value) { if (entry === key) throw new DOMException("blocked", "QuotaExceededError"); return original.call(this, entry, value); };
  }, DISCOVERY_KEY);
  await sheet.getByRole("button", { name: "保存发现", exact: true }).click();
  await expect(sheet.getByRole("alert")).toContainText("尚未保存");
  await expect(sheet.getByRole("textbox", { name: "发现了什么", exact: true })).toHaveValue("需要再看一次来球");
  expect(await pointRecords(page)).toEqual([]);
  expect(await storedBoards(page)).toEqual(before);
});

test("old notes reopen unchanged and retain their identity and playback anchor when edited", async ({ page }) => {
  await openPoint(page);
  const legacy = { version: 1, id: "legacy-discovery", boardId: point.id, frameId: "opening", progress: .5, note: "旧发现", nextTry: "旧试法", uncertain: false, createdAt: "2026-09-29T10:00:00.000Z", updatedAt: "2026-09-29T10:00:00.000Z" };
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] })), { key: DISCOVERY_KEY, record: legacy });
  const sheet = await openNotes(page);
  await expect(sheet.getByRole("textbox", { name: "发现了什么", exact: true })).toHaveValue("旧发现");
  await sheet.getByRole("button", { name: "先不记", exact: true }).click();
  expect(await pointRecords(page)).toEqual([legacy]);
  const reopened = await openNotes(page);
  await reopened.getByRole("textbox", { name: "发现了什么", exact: true }).fill("旧发现补充");
  await reopened.getByRole("button", { name: "保存发现", exact: true }).click();
  expect(await pointRecords(page)).toMatchObject([{ ...legacy, note: "旧发现补充", updatedAt: expect.any(String) }]);
});

test("board management opens the original note and refreshes a saved update without a board write", async ({ page }) => {
  await openPoint(page);
  const record = { version: 1, id: "library-note", boardId: point.id, frameId: "opening", note: "保存前的发现", nextTry: "再看深度", uncertain: false, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" };
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] })), { key: DISCOVERY_KEY, record });
  const before = await storedBoards(page);
  await current(page).getByRole("button", { name: /打开.*的画板菜单/ }).click();
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: "草稿与模板", exact: true }).click();
  await settled(page);
  const finder = current(page).getByRole("region", { name: "找回发现笔记", exact: true });
  await finder.getByRole("button", { name: `查看${point.title}的一分的发现`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "一分的发现", exact: true });
  await expect(sheet.getByRole("textbox", { name: "发现了什么", exact: true })).toHaveValue(record.note);
  await sheet.getByRole("textbox", { name: "发现了什么", exact: true }).fill("从画板管理回来，已更新的发现");
  await sheet.getByRole("button", { name: "保存发现", exact: true }).click();
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click();
  await settled(page);
  await current(page).getByRole("button", { name: "查看旧记录", exact: false }).click();
  const legacy = current(page).getByRole("region", { name: "以前留下的记录", exact: true });
  await expect(legacy).toContainText("从画板管理回来，已更新的发现");
  await expect(legacy).not.toContainText("保存前的发现");
  expect(await storedBoards(page)).toEqual(before);
  expect(await pointRecords(page)).toMatchObject([{ id: record.id, boardId: point.id, note: "从画板管理回来，已更新的发现" }]);
});

test("Escape closes an optional point or practice note and keeps the same immersive board", async ({ page }) => {
  await openPoint(page);
  const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, DISCOVERY_KEY, FOLLOW_UP_KEY, LEARNING_KEY]);
  for (const kind of ["point", "practice"] as const) {
    const sheet = await openNotes(page, kind);
    await sheet.getByRole("textbox", { name: kind === "point" ? "发现了什么" : "练后发现了什么", exact: true }).fill("先不保存的发现草稿");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(canvas(page)).toBeVisible();
    await expect(current(page).getByRole("button", { name: `打开${point.title}的画板菜单`, exact: true })).toBeVisible();
    expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, DISCOVERY_KEY, FOLLOW_UP_KEY, LEARNING_KEY])).toEqual(before);
  }
});

test("the note finder keeps an unfinished imported board isolated", async ({ page }) => {
  await openPoint(page);
  const pending = { ...point, id: "unfinished-note-import", title: "尚未完整导入的画板" };
  const note = { version: 1, id: "original-note", boardId: point.id, frameId: "opening", note: "原板发现", nextTry: "", uncertain: false, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" };
  await page.evaluate(({ boardKey, noteKey, original, pending, note }) => {
    localStorage.setItem(boardKey, JSON.stringify({ version: 1, boards: [original, pending] }));
    localStorage.setItem(noteKey, JSON.stringify({ version: 1, records: [note, { ...note, id: "pending-note", boardId: pending.id, note: "未完整导入的发现" }] }));
    localStorage.setItem("rallypath:board-import-pending:v1", JSON.stringify({ version: 1, signature: "a-b-c", targetId: pending.id, targetTitle: pending.title }));
  }, { boardKey: BOARD_KEY, noteKey: DISCOVERY_KEY, original: point, pending, note });
  const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, DISCOVERY_KEY, "rallypath:board-import-pending:v1"]);
  await current(page).getByRole("button", { name: /打开.*的画板菜单/ }).click();
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: "草稿与模板", exact: true }).click();
  await settled(page);
  const finder = current(page).getByRole("region", { name: "找回发现笔记", exact: true });
  await expect(finder.getByRole("button", { name: `查看${point.title}的一分的发现`, exact: true })).toBeVisible();
  await expect(finder.getByRole("button", { name: `查看${pending.title}的一分的发现`, exact: true })).toHaveCount(0);
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, DISCOVERY_KEY, "rallypath:board-import-pending:v1"])).toEqual(before);
});
