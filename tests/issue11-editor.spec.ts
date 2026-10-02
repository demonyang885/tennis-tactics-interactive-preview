import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterBoard, getBoardDuration, type BoardDocument, type Point } from "../src/board/model";
import { getBoardGeometry, pointOnBoardPath } from "../src/board/render";
import { BOARD_DISPLAY_STORAGE_KEY } from "../src/board/display";
import { BOARD_EDITOR_VIEW_STORAGE_KEY } from "../src/board/editorView";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const starter = createStarterBoard();
const board: BoardDocument = {
  ...starter, id: "issue11-editor-board", title: "桌面回归画板", updatedAt: "2026-09-30T10:00:00.000Z",
  smartRally: undefined,
  frames: [{ ...starter.frames[0], id: "opening", label: "第一拍", paths: [{
    id: "first-shot", kind: "shot", actorId: starter.actors.find(actor => actor.kind === "ball")!.id,
    from: [.64, .96], to: [.28, .18], control: [.72, .48],
  }] }, {
    ...starter.frames[0], id: "reply", label: "第二拍",
    poses: { ...starter.frames[0].poses, [starter.actors.find(actor => actor.kind === "ball")!.id]: [.28, .18] },
    paths: [{ id: "second-shot", kind: "shot", actorId: starter.actors.find(actor => actor.kind === "ball")!.id,
      from: [.28, .18], to: [.75, .85], control: [.56, .45] }],
  }],
};

test.use({ viewport: { width: 1280, height: 900 } });

const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');
const canvas = (page: Page) => current(page).getByTestId("board-canvas");
const dock = (page: Page) => current(page).getByRole("navigation", { name: "画板编辑工具" });

async function settled(page: Page) {
  await expect(current(page)).toHaveCount(1);
  await expect.poll(() => current(page).evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(1);
}

async function open(page: Page, seed = board) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, seed }) => {
    localStorage.clear(); localStorage.setItem(key, JSON.stringify({ version: 1, boards: [seed] }));
  }, { key: BOARD_KEY, seed });
  await page.reload();
  if(seed.frames.some(frame=>frame.paths.length))await page.getByRole("button", { name: `接着画${seed.title}`, exact: true }).click();
  else await page.getByTestId("home-history-board").filter({hasText:seed.title}).click();
  await expect(canvas(page)).toBeVisible(); await settled(page);
}

async function menu(page: Page) {
  await current(page).getByRole("button", { name: /打开.*的画板菜单/ }).click();
  const sheet = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await expect(sheet).toBeVisible(); return sheet;
}

async function closeMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "画板菜单", exact: true })).toBeHidden();
}

async function at(holder: Locator, point: Point) {
  const metrics = await holder.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, rect: element.getBoundingClientRect().toJSON() }));
  const local = getBoardGeometry(metrics.width, metrics.height).toCanvas(point);
  return { x: metrics.rect.x + local[0] * metrics.rect.width / metrics.width, y: metrics.rect.y + local[1] * metrics.rect.height / metrics.height };
}

async function tapPoint(page: Page, point: Point) {
  const pixel = await at(canvas(page), point); await page.mouse.click(pixel.x, pixel.y);
}

async function drag(page: Page, from: Point, to: Point) {
  const start = await at(canvas(page), from), end = await at(canvas(page), to);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
}

async function stored(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).boards[0] as BoardDocument, BOARD_KEY);
}

async function background(holder: Locator) {
  return holder.locator("canvas").evaluate((element: HTMLCanvasElement) => Array.from(element.getContext("2d")!.getImageData(1, 1, 1, 1).data));
}

async function zoneInteriorPixel(holder: Locator) {
  const size = await holder.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
  // Inside the top Rally band, clear of court lines, zone labels, the players
  // and this fixture's shot route. Sample the rendered backing canvas using
  // its actual pixel scale instead of assuming a device pixel ratio.
  const point = getBoardGeometry(size.width, size.height).toCanvas([.60, .10]);
  return holder.locator("canvas").evaluate((element: HTMLCanvasElement, { point, size }) => {
    const x = Math.floor(point[0] * element.width / size.width);
    const y = Math.floor(point[1] * element.height / size.height);
    return Array.from(element.getContext("2d")!.getImageData(x, y, 1, 1).data);
  }, { point, size });
}

async function expectColorState(control: Locator, text: "分区已开" | "分区已关", pressed: "true" | "false") {
  await expect(control).toHaveAttribute("aria-pressed", pressed);
  await expect(control.locator("span")).toBeVisible();
  await expect(control.locator("span")).toHaveText(text);
  await expect(control).toHaveAccessibleName(`站位分区颜色，${text}`);
}

test("zone colors and names have stable setting labels and independent visible states", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.stack ?? error.message));
  await page.addInitScript(() => {
    const labels = new WeakMap<HTMLCanvasElement, string[]>();
    const clear = CanvasRenderingContext2D.prototype.clearRect, fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { labels.set(this.canvas, []); return clear.apply(this, args); };
    CanvasRenderingContext2D.prototype.fillText = function (...args) { labels.get(this.canvas)?.push(args[0]); return fill.apply(this, args); };
    (window as unknown as { drawnLabels: (canvas: HTMLCanvasElement) => string[] }).drawnLabels = canvas => labels.get(canvas) ?? [];
  });
  await open(page);
  const unchanged = await stored(page), rawBoard = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
  const coloredPixel = await zoneInteriorPixel(canvas(page)), sheet = await menu(page);
  const colors = sheet.getByRole("button", { name: /^站位分区颜色/ });
  const names = sheet.getByRole("button", { name: "区域名称", exact: true });
  await expectColorState(colors, "分区已开", "true");
  await expect(names).toHaveAttribute("aria-pressed", "false");
  await names.click(); await colors.click();
  await expectColorState(colors, "分区已关", "false");
  await expect.poll(() => zoneInteriorPixel(canvas(page))).not.toEqual(coloredPixel);
  const uncoloredPixel = await zoneInteriorPixel(canvas(page));
  await expect(names).toBeEnabled(); await expect(names).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => canvas(page).locator("canvas").evaluate(element =>
    (window as unknown as { drawnLabels: (canvas: HTMLCanvasElement) => string[] }).drawnLabels(element as HTMLCanvasElement).includes("DEFENSE"))).toBe(true);
  await names.click();
  await expect.poll(() => canvas(page).locator("canvas").evaluate(element =>
    (window as unknown as { drawnLabels: (canvas: HTMLCanvasElement) => string[] }).drawnLabels(element as HTMLCanvasElement).includes("DEFENSE"))).toBe(false);
  await expect(names).toHaveAttribute("aria-pressed", "false");
  expect(await zoneInteriorPixel(canvas(page))).toEqual(uncoloredPixel);
  await expectColorState(colors, "分区已关", "false");
  await colors.click();
  await expectColorState(colors, "分区已开", "true");
  await expect.poll(() => zoneInteriorPixel(canvas(page))).toEqual(coloredPixel);
  await expect(names).toHaveAttribute("aria-pressed", "false");
  await colors.click();
  await expectColorState(colors, "分区已关", "false");
  await expect.poll(() => zoneInteriorPixel(canvas(page))).toEqual(uncoloredPixel);

  // These are device display preferences, so navigation and reload retain
  // the off state without a write to the board document.
  await closeMenu(page);
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).click(); await settled(page);
  await expectColorState((await menu(page)).getByRole("button", { name: /^站位分区颜色/ }), "分区已关", "false");
  expect(await zoneInteriorPixel(canvas(page))).toEqual(uncoloredPixel);
  await page.reload();
  await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).click(); await settled(page);
  const reopened = await menu(page);
  await expectColorState(reopened.getByRole("button", { name: /^站位分区颜色/ }), "分区已关", "false");
  await expect(reopened.getByRole("button", { name: "区域名称", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await zoneInteriorPixel(canvas(page))).toEqual(uncoloredPixel);
  expect(await stored(page)).toEqual(unchanged);
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(rawBoard);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BOARD_DISPLAY_STORAGE_KEY)).toMatchObject({ showZones: false, showZoneLabels: false });
  expect(browserErrors).toEqual([]);
});

for (const surface of ["hard", "clay", "grass"] as const) {
  test(`${surface} stays selected through skill demo and 练这个 without changing the personal board`, async ({ page }) => {
    await open(page);
    const unchanged = await stored(page), sheet = await menu(page);
    await sheet.getByRole("button", { name: surface === "hard" ? "硬地" : surface === "clay" ? "红土" : "草地", exact: true }).click();
    await closeMenu(page); const before = await background(canvas(page));
    await current(page).getByTestId("board-learning-entry").click();
    await page.getByRole("dialog", { name: "这分卡在哪？" }).getByRole("button", { name: "练一项", exact: true }).click();
    await page.getByRole("dialog", { name: "这次先练好一件事" }).getByRole("button", { name: /^击球后回位/ }).click();
    await settled(page);
    await expect(page.getByTestId("skill-practice-board")).toBeVisible();
    expect(await background(page.getByTestId("skill-practice-board"))).toEqual(before);
    await page.getByRole("button", { name: /打开击球后回位训练说明/ }).click();
    await page.getByRole("dialog", { name: "击球后回位", exact: true }).getByRole("button", { name: "练这个", exact: true }).click();
    await settled(page); await expect(canvas(page)).toBeVisible();
    expect(await background(canvas(page))).toEqual(before);
    await expect((await menu(page)).getByRole("button", { name: surface === "hard" ? "硬地" : surface === "clay" ? "红土" : "草地", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await stored(page)).toEqual(unchanged); expect(getBoardDuration(await stored(page))).toBe(getBoardDuration(unchanged));
  });
}

test("a retained editor follows a device preference changed in another tab", async ({ page, context }) => {
  await open(page); await menu(page);
  const rawBoard = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
  const colors = page.getByRole("button", { name: /^站位分区颜色/ });
  await expectColorState(colors, "分区已开", "true");
  const other = await context.newPage(); await other.goto("/");
  await other.evaluate(key => localStorage.setItem(key, JSON.stringify({ surface: "grass", showZones: false, showZoneLabels: true })), BOARD_DISPLAY_STORAGE_KEY);
  await expect(page.getByRole("dialog", { name: "画板菜单" }).getByRole("button", { name: "草地", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expectColorState(colors, "分区已关", "false");
  await expect(page.getByRole("button", { name: "区域名称", exact: true })).toHaveAttribute("aria-pressed", "true");
  await other.evaluate(key => localStorage.setItem(key, JSON.stringify({ surface: "grass", showZones: true, showZoneLabels: true })), BOARD_DISPLAY_STORAGE_KEY);
  await expectColorState(colors, "分区已开", "true");
  await expect(page.getByRole("button", { name: "区域名称", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(rawBoard);
  await other.close();
});

test("reopening keeps the viewed frame and selected ball route without editing or starting playback", async ({ page }) => {
  await open(page);
  await tapPoint(page, [.90, .5]);
  await dock(page).getByRole("button", { name: /打开拍次/ }).click();
  await page.getByRole("dialog", { name: "拍次", exact: true }).getByRole("button", { name: /编辑第 2 拍/ }).click();
  await page.getByRole("dialog", { name: "第 2 拍", exact: true }).getByRole("button", { name: "取消编辑拍次", exact: true }).click();
  await tapPoint(page, pointOnBoardPath(board.frames[1].paths[0], .5));
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  const unchanged = await stored(page);
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).click(); await settled(page);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  await expect(canvas(page).getByRole("button", { name: "一键改直线", exact: true })).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).click(); await settled(page);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  await expect(page.getByTestId("board-playback-dock")).toHaveCount(0);
  await dock(page).getByRole("button", { name: /^播放战术/ }).click();
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).click(); await settled(page);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  await expect(page.getByTestId("board-playback-dock")).toHaveCount(0);
  expect(await stored(page)).toEqual(unchanged);
  const view = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), BOARD_EDITOR_VIEW_STORAGE_KEY);
  expect(view.records[0]).toMatchObject({ frameId: "reply", selection: { id: "second-shot", frameId: "reply" } });
});

test("new smart routes stay selected for deletion while the receiver and overlapping ball remain drawable", async ({ page }) => {
  await open(page, { ...starter, id: "issue11-smart", title: "桌面智慧回合" });
  await drag(page, [.64, .96], [.70, .25]);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  await drag(page, [.30, .07], [.70, .25]);
  await expect(dock(page).getByRole("button", { name: "删除跑位路线", exact: true })).toBeVisible();
  await drag(page, [.70, .25], [.32, .75]);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  await page.getByRole("button", { name: "接着画桌面智慧回合", exact: true }).click(); await settled(page);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  const before = await stored(page), deletedId = before.frames[1].paths.find(path => path.kind === "shot")!.id;
  await dock(page).getByRole("button", { name: "删除击球路线", exact: true }).click();
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  const after = await stored(page);
  expect(after.actors).toEqual(before.actors); expect(after.frames.flatMap(frame => frame.paths).some(path => path.id === deletedId)).toBe(false);
  expect(after.frames[0].paths).toEqual(before.frames[0].paths);
});


test("an explicitly selected previous route keeps its overlapping endpoint handle after reopening", async ({ page }) => {
  await open(page, { ...starter, id: "issue11-explicit-route", title: "保留球路控制柄" });
  await drag(page, [.64, .96], [.70, .25]);
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  const authored = await stored(page), shot = authored.frames[0].paths.find(path => path.kind === "shot")!;
  await page.getByRole("button", { name: "接着画保留球路控制柄", exact: true }).click(); await settled(page);
  await tapPoint(page, pointOnBoardPath(shot, .5));
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  await page.getByRole("button", { name: "接着画保留球路控制柄", exact: true }).click(); await settled(page);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  await drag(page, shot.to, [.62, .30]);
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  const adjusted = await stored(page);
  expect(adjusted.frames).toHaveLength(authored.frames.length);
  expect(adjusted.frames[0].paths).toHaveLength(1);
  expect(adjusted.frames[0].paths[0].id).toBe(shot.id);
  expect(adjusted.frames[0].paths[0].to[0]).toBeCloseTo(.62, 2);
  expect(adjusted.frames[0].paths[0].to[1]).toBeCloseTo(.30, 2);
  expect(adjusted.actors).toEqual(authored.actors);
});


test("cancelling receiver movement restores automatic route selection and the next receiver gesture", async ({ page }) => {
  const opponent = starter.actors.find(actor => actor.label === "对手")!;
  const overlap: BoardDocument = { ...starter, id: "issue11-cancel-overlap", title: "取消后继续跑位",
    // This receiver still needs to move. A receiver already at the landing
    // point can now hit the next ball directly (covered by v032-rally-authoring).
    frames: starter.frames.map(frame => ({ ...frame, poses: { ...frame.poses, [opponent.id]: [.62, .32] } })),
  };
  await open(page, overlap);
  await drag(page, [.64, .96], [.70, .25]);
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  const start = await at(canvas(page), [.62, .32]), cancelled = await at(canvas(page), [.63, .36]);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(cancelled.x, cancelled.y, { steps: 8 });
  await canvas(page).dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse" }); await page.mouse.up();
  await expect(dock(page).getByRole("button", { name: "删除击球路线", exact: true })).toBeVisible();
  await drag(page, [.62, .32], [.67, .33]);
  await expect(dock(page).getByRole("button", { name: "删除跑位路线", exact: true })).toBeVisible();
  await current(page).getByRole("button", { name: "返回上一页", exact: true }).click(); await settled(page);
  const completed = await stored(page), shot = completed.frames[0].paths.find(path => path.kind === "shot")!;
  const movement = completed.frames[0].paths.find(path => path.kind === "move")!;
  expect(completed.frames).toHaveLength(2); expect(completed.frames[0].paths).toHaveLength(2);
  expect(shot.to[0]).toBeCloseTo(.70, 2); expect(shot.to[1]).toBeCloseTo(.25, 2);
  expect(movement.actorId).toBe(opponent.id); expect(movement.to[0]).toBeCloseTo(.67, 2); expect(movement.to[1]).toBeCloseTo(.33, 2);
});
