import { expect, test, type Locator, type Page } from "@playwright/test";
import { getBoardDuration, type BoardDocument, type Point } from "../src/board/model";
import { getBoardGeometry } from "../src/board/render";

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

async function cancelDrag(page: Page, from: Point, to: Point) {
  const a = await pixel(canvas(page), from), b = await pixel(canvas(page), to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await canvas(page).dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse" });
  await page.mouse.up();
}

async function saved(page: Page): Promise<BoardDocument> {
  await expect(current(page).getByTestId("board-save-live")).toHaveText("画板已保存");
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).boards[0], BOARD_KEY);
}

async function selectBeat(page: Page, index: number) {
  await tap(page, [.95, .50]);
  await dock(page).getByRole("button", { name: /打开拍次/ }).click();
  await page.getByRole("dialog", { name: "拍次", exact: true }).getByRole("button", { name: new RegExp(`^编辑第 ${index} 拍`) }).click();
  await page.getByRole("dialog", { name: `第 ${index} 拍`, exact: true }).getByRole("button", { name: "取消编辑拍次", exact: true }).click();
}

async function expectTwoAuthoredShots(page: Page, first: BoardDocument) {
  const board = await saved(page), ball = board.actors.find(actor => actor.kind === "ball")!;
  expect(board.frames).toHaveLength(3);
  expect(board.frames[0].paths).toEqual(first.frames[0].paths);
  expect(board.frames[1].paths).toHaveLength(1);
  expect(board.frames[1].paths[0]).toMatchObject({ kind: "shot", actorId: ball.id });
  expect(board.frames[1].paths[0].from[0]).toBeCloseTo(firstLanding[0], 2);
  expect(board.frames[1].paths[0].to[0]).toBeCloseTo(returnLanding[0], 2);
  expect(board.frames[2].paths).toEqual([]);
  await expect(dock(page).getByRole("button", { name: /^播放战术，2 拍/ })).toBeEnabled();
  return board;
}

for (const resume of ["empty court", "current beat", "previous then current beat", "reload", "home"] as const) {
  test(`draws a return from the overlapping ball after ${resume}`, async ({ page }) => {
    await start(page);
    await drag(page, ballStart, firstLanding);
    await drag(page, receiverStart, firstLanding);
    const first = await saved(page);
    expect(first.frames[0].paths.map(path => path.kind).sort()).toEqual(["move", "shot"]);
    expect(first.frames[1].paths).toEqual([]);
    if (resume === "empty court") await tap(page, [.95, .50]);
    if (resume === "current beat") await selectBeat(page, 2);
    if (resume === "previous then current beat") { await selectBeat(page, 1); await selectBeat(page, 2); }
    if (resume === "reload") {
      await tap(page, [.95, .50]); await page.reload();
      await page.getByRole("button", { name: `接着画${first.title}`, exact: true }).click(); await settled(page);
    }
    if (resume === "home") {
      await tap(page, [.95, .50]);
      await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
      await page.getByRole("button", { name: `接着画${first.title}`, exact: true }).click(); await settled(page);
    }
    await drag(page, firstLanding, returnLanding);
    await expectTwoAuthoredShots(page, first);
  });
}

test("continues directly when the receiver is already at the first landing", async ({ page }) => {
  await start(page);
  await drag(page, ballStart, receiverStart);
  const first = await saved(page);
  expect(first.frames[0].paths.map(path => path.kind)).toEqual(["shot"]);
  expect(first.smartRally).toMatchObject({ phase: "shot", frameId: first.frames[1].id,
    actorId: first.actors.find(actor => actor.kind === "ball")!.id });
  await drag(page, receiverStart, returnLanding);
  const board = await saved(page);
  expect(board.frames).toHaveLength(3);
  expect(board.frames[0].paths).toEqual(first.frames[0].paths);
  expect(board.frames[1].paths.map(path => path.kind)).toEqual(["shot"]);
  await expect(dock(page).getByRole("button", { name: /^播放战术，2 拍/ })).toBeEnabled();
});

test("undo and redo preserve direct continuation when no receiver movement is needed", async ({ page }) => {
  await start(page);
  await drag(page, ballStart, receiverStart);
  const first = await saved(page);
  await current(page).getByRole("button", { name: "撤销", exact: true }).click();
  const initial = await saved(page);
  expect(initial.frames).toHaveLength(1); expect(initial.frames[0].paths).toEqual([]);
  await current(page).getByRole("button", { name: "重做", exact: true }).click();
  const restored = await saved(page);
  expect(restored.frames).toEqual(first.frames); expect(restored.smartRally).toEqual(first.smartRally);
  await drag(page, receiverStart, returnLanding);
  const board = await saved(page);
  expect(board.frames).toHaveLength(3);
  expect(board.frames[0].paths).toEqual(first.frames[0].paths);
  expect(board.frames[1].paths.map(path => path.kind)).toEqual(["shot"]);
  await expect(dock(page).getByRole("button", { name: /^播放战术，2 拍/ })).toBeEnabled();
});

for (const phase of ["receiver movement", "return ball"] as const) {
  test(`cancelling ${phase} preserves the committed beat and can resume the next real gesture`, async ({ page }) => {
    await start(page);
    await drag(page, ballStart, firstLanding);
    if (phase === "receiver movement") {
      const before = await saved(page);
      await cancelDrag(page, receiverStart, firstLanding);
      expect(await saved(page)).toEqual(before);
      await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
    }
    await drag(page, receiverStart, firstLanding);
    const first = await saved(page);
    if (phase === "return ball") {
      await tap(page, [.95, .50]);
      await cancelDrag(page, firstLanding, returnLanding);
      expect(await saved(page)).toEqual(first);
    }
    await drag(page, firstLanding, returnLanding);
    await expectTwoAuthoredShots(page, first);
  });
}

test("distinguishes the waiting next beat from actual playback beats", async ({ page }) => {
  await start(page);
  await drag(page, ballStart, firstLanding);
  await drag(page, receiverStart, firstLanding);
  await tap(page, [.95, .50]);
  await expect(dock(page).getByRole("button", { name: /^播放战术，1 拍/ })).toBeEnabled();
  await dock(page).getByRole("button", { name: /打开拍次/ }).click();
  const history = page.getByRole("dialog", { name: "拍次", exact: true });
  await expect(history.getByRole("button", { name: /^编辑第/ })).toHaveCount(2);
  await expect(history.getByRole("button", { name: /^编辑第 2 拍/ })).toContainText("等待下一拍球路");
  await history.getByRole("button", { name: "关闭拍次", exact: true }).click();
  const first = await saved(page);
  await drag(page, firstLanding, returnLanding);
  await expectTwoAuthoredShots(page, first);
});

test("two real gestures retain their two playback beats after refresh and returning home", async ({ page }) => {
  await start(page);
  await drag(page, ballStart, firstLanding);
  await drag(page, receiverStart, firstLanding);
  const first = await saved(page);
  await drag(page, firstLanding, returnLanding);
  const authored = await expectTwoAuthoredShots(page, first);
  await page.reload();
  await page.getByRole("button", { name: `接着画${authored.title}`, exact: true }).click(); await settled(page);
  expect(await saved(page)).toEqual(authored);
  await dock(page).getByRole("button", { name: /^播放战术，2 拍/ }).click();
  const playback = page.getByTestId("board-playback-dock");
  await playback.getByRole("button", { name: "暂停", exact: true }).click();
  await playback.getByRole("slider", { name: "画板播放进度" }).fill("0");
  const next = playback.getByRole("button", { name: "下一拍", exact: true });
  await expect(next).toBeEnabled(); await next.click(); await expect(next).toBeDisabled();
  await expect(playback.getByRole("slider", { name: "画板播放进度" })).toHaveAttribute("max", String(getBoardDuration({ ...authored, frames: authored.frames.slice(0, 2) })));
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  await page.getByRole("button", { name: `接着画${authored.title}`, exact: true }).click(); await settled(page);
  await expect(dock(page).getByRole("button", { name: /^播放战术，2 拍/ })).toBeEnabled();
  expect(await saved(page)).toEqual(authored);
});
