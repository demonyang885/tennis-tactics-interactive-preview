import { expect, test, type Locator, type Page } from "@playwright/test";
import type { BoardDocument, Point } from "../src/board/model";
import { getBoardGeometry, pointOnBoardPath } from "../src/board/render";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const ballStart: Point = [.64, .96], receiverStart: Point = [.30, .07];
const firstLanding: Point = [.70, .25], returnLanding: Point = [.32, .75];
const current = (page: Page) => page.getByTestId("flow-current");
const canvas = (page: Page) => current(page).getByTestId("board-canvas");
const dock = (page: Page) => current(page).getByRole("navigation", { name: "画板编辑工具" });

test.use({ viewport: { width: 1280, height: 900 } });

async function settled(page: Page) {
  await expect(current(page)).toHaveCount(1);
  await expect.poll(() => current(page).evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(1);
}

async function start(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".home-plan-primary").click();
  await expect(canvas(page)).toBeVisible();
  await settled(page);
}

async function pixel(holder: Locator, point: Point) {
  const metrics = await holder.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, rect: element.getBoundingClientRect().toJSON() }));
  const local = getBoardGeometry(metrics.width, metrics.height).toCanvas(point);
  return { x: metrics.rect.x + local[0] * metrics.rect.width / metrics.width, y: metrics.rect.y + local[1] * metrics.rect.height / metrics.height };
}

async function tap(page: Page, point: Point) {
  const at = await pixel(canvas(page), point);
  await page.mouse.click(at.x, at.y);
}

async function drag(page: Page, from: Point, to: Point) {
  const a = await pixel(canvas(page), from), b = await pixel(canvas(page), to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
}

async function saved(page: Page): Promise<BoardDocument> {
  await expect(current(page).getByTestId("board-save-live")).toHaveText("画板已保存");
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).boards[0], BOARD_KEY);
}

async function previousShotStartHandle(page: Page): Promise<Point> {
  // The previous shot's handle owns 24 px. Starting 20 px above its old
  // origin misses the current server (farther below) and the actual ball,
  // which is now at the first landing. No internal UI state is seeded.
  const { width, height } = await canvas(page).evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  return [ballStart[0], ballStart[1] - 20 / getBoardGeometry(width, height).court.height];
}

for (const resume of ["immediately", "after refresh"] as const) {
  test(`rejects a return drag from the previous ball origin ${resume} without rewriting a shot or adding undo history`, async ({ page }) => {
    await start(page);
    await drag(page, ballStart, firstLanding);
    const first = await saved(page);
    if (resume === "after refresh") {
      await page.reload();
      await page.getByRole("button", { name: `接着画${first.title}`, exact: true }).click();
      await settled(page);
    }
    const before = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
    const undo = current(page).getByRole("button", { name: "撤销", exact: true });
    const redo = current(page).getByRole("button", { name: "重做", exact: true });
    const undoWasEnabled = await undo.isEnabled(), redoWasEnabled = await redo.isEnabled();
    const wrongOrigin = await previousShotStartHandle(page);
    await drag(page, wrongOrigin, returnLanding);
    expect(await saved(page)).toEqual(first);
    expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before);
    await expect(current(page).getByRole("alert")).toContainText("接球");
    expect(await undo.isEnabled()).toBe(undoWasEnabled);
    expect(await redo.isEnabled()).toBe(redoWasEnabled);
    // Repeat the mistaken gesture: rejection must not disarm the guard.
    await drag(page, wrongOrigin, [.42, .65]);
    expect(await saved(page)).toEqual(first);
    expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before);
    if (resume === "immediately") {
      await undo.click();
      const empty = await saved(page);
      expect(empty.frames).toHaveLength(1);
      expect(empty.frames[0].paths).toEqual([]);
      await redo.click();
      const restored = await saved(page);
      expect(restored.frames).toEqual(first.frames);
      expect(restored.smartRally).toEqual(first.smartRally);
    }
    // Recovery uses the real receiver and ball, without restarting the board.
    await drag(page, receiverStart, firstLanding);
    const moved = await saved(page);
    await drag(page, firstLanding, returnLanding);
    const board = await saved(page);
    expect(board.frames).toHaveLength(3);
    expect(board.frames[0].paths).toEqual(moved.frames[0].paths);
    expect(board.frames[0].paths.find(path => path.kind === "shot")).toEqual(first.frames[0].paths[0]);
    expect(board.frames[1].paths.map(path => path.kind)).toEqual(["shot"]);
    expect(board.frames[2].paths).toEqual([]);
    await expect(dock(page).getByRole("button", { name: /^播放战术，2 拍/ })).toBeEnabled();
  });
}

for (const selection of ["automatically selected route", "cleared selection", "explicit ball tap"] as const) {
  test(`preserves intentional receiver skipping from the actual ball with ${selection}`, async ({ page }) => {
    await start(page);
    await drag(page, ballStart, firstLanding);
    const first = await saved(page);
    if (selection === "cleared selection") await tap(page, [.95, .5]);
    if (selection === "explicit ball tap") await tap(page, firstLanding);
    await drag(page, firstLanding, returnLanding);
    const board = await saved(page);
    expect(board.frames[0].paths).toEqual(first.frames[0].paths);
    expect(board.frames[1].paths.map(path => path.kind)).toEqual(["shot"]);
    expect(board.frames).toHaveLength(3);
    expect(board.frames[2].paths).toEqual([]);
  });
}

test("keeps explicitly selected previous shot endpoint editing and its undo/redo available", async ({ page }) => {
  await start(page);
  await drag(page, ballStart, firstLanding);
  const first = await saved(page), shot = first.frames[0].paths[0];
  await tap(page, pointOnBoardPath(shot, .5));
  const revised: Point = [.58, .18];
  await drag(page, firstLanding, revised);
  const edited = await saved(page);
  expect(edited.frames).toHaveLength(2);
  expect(edited.frames[1].paths).toEqual([]);
  expect(edited.frames[0].paths[0]).toMatchObject({ id: shot.id, kind: "shot", from: shot.from });
  expect(edited.frames[0].paths[0].to[0]).toBeCloseTo(revised[0], 2);
  expect(edited.frames[0].paths[0].to[1]).toBeCloseTo(revised[1], 2);
  await current(page).getByRole("button", { name: "撤销", exact: true }).click();
  expect((await saved(page)).frames).toEqual(first.frames);
  await current(page).getByRole("button", { name: "重做", exact: true }).click();
  expect((await saved(page)).frames).toEqual(edited.frames);
  await drag(page, receiverStart, revised);
  const ready = await saved(page);
  await drag(page, revised, returnLanding);
  const board = await saved(page);
  expect(board.frames[0].paths).toEqual(ready.frames[0].paths);
  expect(board.frames[1].paths.map(path => path.kind)).toEqual(["shot"]);
  expect(board.frames).toHaveLength(3);
});
