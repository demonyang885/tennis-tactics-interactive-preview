import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { createStarterBoard } from "../src/board/model";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const RECORD_KEYS = [BOARD_KEY, "rallypath:board-discovery:v1", "rallypath:board-follow-up:v1"];
const starter = createStarterBoard();
const ballId = starter.actors.find(actor => actor.kind === "ball")!.id;
const board = {
  ...starter, id: "v034-native-pinch", title: "文字输入手势检查", smartRally: undefined,
  updatedAt: "2026-10-01T20:00:00.000Z",
  frames: [{ ...starter.frames[0], paths: [{ id: "serve", kind: "shot" as const, actorId: ballId, from: [.64, .96], to: [.28, .18] }] }],
};
const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.stack ?? `${error.name}: ${error.message}`));
});

test.afterEach(({ page }) => {
  // Geometry and storage can appear correct after an uncaught pointer error.
  // Every native input case must also finish without browser-side exceptions.
  expect(pageErrors.get(page), "Native text input and zoom must not throw browser errors").toEqual([]);
});

async function openBoard(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: BOARD_KEY, board });
  await page.reload();
  await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).tap();
  await expect(current(page).getByTestId("board-canvas")).toBeVisible();
  await expect.poll(() => current(page).evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(1);
}

async function menu(page: Page) {
  await current(page).getByRole("button", { name: `打开${board.title}的画板菜单`, exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function openSurface(page: Page, surface: string): Promise<{ field: Locator; cancel: Locator; layer: Locator }> {
  if (surface === "point" || surface === "practice") {
    const title = surface === "point" ? "一分的发现" : "练后发现";
    await (await menu(page)).getByRole("button", { name: title, exact: true }).tap();
    const layer = page.getByRole("dialog", { name: title, exact: true });
    await expect(page.getByRole("dialog", { name: "画板菜单", exact: true })).toBeHidden();
    await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
    return { layer, field: layer.getByRole("textbox", { name: surface === "point" ? "发现了什么" : "练后发现了什么", exact: true }), cancel: layer.getByRole("button", { name: "先不记", exact: true }) };
  }
  if (surface === "rename") {
    await (await menu(page)).getByRole("button", { name: /^修改名称/ }).tap();
    const layer = page.getByTestId("board-rename-layer");
    // The previous modal's scroll lock remains active during its exit spring.
    // Start the input gesture after that outgoing modal has been removed.
    await expect(page.getByRole("dialog", { name: "画板菜单", exact: true })).toBeHidden();
    return { layer, field: layer.getByRole("textbox", { name: "画板名称", exact: true }), cancel: layer.getByRole("button", { name: "取消", exact: true }) };
  }
  if (surface === "frame") {
    await current(page).getByRole("button", { name: "打开拍次，当前第 1 拍", exact: true }).tap();
    await page.getByRole("dialog", { name: "拍次", exact: true }).getByRole("button", { name: /^编辑第 1 拍/ }).tap();
    const layer = page.getByRole("dialog", { name: "第 1 拍", exact: true });
    return { layer, field: layer.locator(".board-field").filter({ hasText: "拍次口令" }).locator("input"), cancel: layer.getByRole("button", { name: "取消编辑拍次", exact: true }) };
  }
  await current(page).getByRole("button", { name: "添加对象", exact: true }).tap();
  const add = page.getByRole("dialog", { name: "添加对象", exact: true });
  await add.getByRole("button", { name: "文字备注", exact: true }).tap();
  await expect(add).toBeHidden();
  const canvas = current(page).getByTestId("board-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Expected the visible board canvas");
  await page.touchscreen.tap(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
  const layer = page.getByTestId("board-inline-note-editor");
  return { layer, field: layer.getByRole("textbox", { name: "画板备注", exact: true }), cancel: layer.getByRole("button", { name: "取消备注", exact: true }) };
}

async function assertNativePinchRemainsAvailable(field: Locator) {
  // Pointer Events applies pinch permission across the target's ancestor
  // chain. A permissive viewport meta cannot undo an ancestor's pan-y/none.
  // This checks the browser's resolved gesture contract; headless browsers
  // do not establish physical iPhone Safari pinch or native-keyboard results.
  const metrics = await field.evaluate(element => {
    const blocked: { element: string; touchAction: string }[] = [];
    for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
      const action = getComputedStyle(node).touchAction;
      if (action !== "auto" && action !== "manipulation" && !action.split(/\s+/).includes("pinch-zoom")) {
        blocked.push({ element: `${node.tagName}.${node.className}`, touchAction: action });
      }
    }
    return { fontSize: Number.parseFloat(getComputedStyle(element).fontSize), blocked };
  });
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.blocked, "Native text entry must allow the user to pinch back after browser zoom").toEqual([]);
}

async function pinch(page: Page, session: CDPSession, field: Locator, expanding: boolean) {
  for (let attempt = 0; attempt < (expanding ? 1 : 3); attempt++) {
    if (!expanding && await page.evaluate(() => window.visualViewport!.scale <= 1.08)) break;
    const geometry = await field.evaluate(element => {
      const box = element.getBoundingClientRect(), viewport = window.visualViewport!;
      // CDP takes visual-viewport CSS coordinates. It adds viewport offsets
      // when generating client coordinates; multiplying by page scale hits
      // the underlying canvas after this full editor shrinks with the zoom.
      return { x: box.left + box.width / 2 - viewport.offsetLeft, y: box.top + box.height / 2 - viewport.offsetTop, distance: Math.min(84, box.width / 2 - 3) };
    });
    const from = expanding ? 20 : geometry.distance, to = expanding ? 84 : 1;
    const points = (distance: number) => [
      { id: 1, x: geometry.x - distance, y: geometry.y, radiusX: 3, radiusY: 3, force: 1 },
      { id: 2, x: geometry.x + distance, y: geometry.y, radiusX: 3, radiusY: 3, force: 1 },
    ];
    await field.evaluate(element => {
      const targets: boolean[] = [];
      const listener = (event: TouchEvent) => targets.push(...Array.from(event.touches, touch => touch.target === element));
      document.addEventListener("touchstart", listener, { capture: true, passive: true });
      (window as Window & { nativePinchProbe?: { targets: boolean[]; remove: () => void } }).nativePinchProbe = { targets, remove: () => document.removeEventListener("touchstart", listener, true) };
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
    const targets = await page.evaluate(() => {
      const probeWindow = window as Window & { nativePinchProbe?: { targets: boolean[]; remove: () => void } };
      const probe = probeWindow.nativePinchProbe!;
      probe.remove(); delete probeWindow.nativePinchProbe;
      return probe.targets;
    });
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every(Boolean), "Every pinch must actually start on the native text field").toBe(true);
    for (let index = 1; index <= 16; index++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + (to - from) * index / 16) });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
}

for (const height of [844, 420]) {
  test.describe(`native text pinch permission at 390×${height}`, () => {
    test.use({ viewport: { width: 390, height }, hasTouch: true, isMobile: true });
    for (const surface of ["point", "practice", "rename", "frame", "court-note"]) {
      test(`${surface} keeps browser pinch available while entering text and cancels safely`, async ({ page }) => {
        await openBoard(page);
        const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), RECORD_KEYS);
        const { field, cancel, layer } = await openSurface(page, surface);
        await expect(layer).toBeVisible();
        await field.fill("test：文字输入后仍可缩放");
        await expect(field).toBeFocused();
        await assertNativePinchRemainsAvailable(field);
        const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(viewportMeta).not.toMatch(/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\D|$)/i);
        await cancel.tap();
        await expect(layer).toBeHidden();
        expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), RECORD_KEYS)).toEqual(before);
        expect(await page.evaluate(() => document.activeElement?.matches("input, textarea") ?? false)).toBe(false);
      });
    }
  });
}

test.describe("native Chromium two-finger discovery zoom", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  for (const surface of ["point", "practice"]) {
    test(`${surface} can zoom in and back out without clipping the note or changing the board`, async ({ page, context, browserName }) => {
      test.skip(browserName !== "chromium", "CDP touch injection is Chromium-specific; physical iPhone Safari still needs device acceptance");
      await openBoard(page);
      const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), RECORD_KEYS);
      const { layer, field } = await openSurface(page, surface);
      await expect(layer).toBeVisible();
      await expect.poll(() => layer.evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))).toBeLessThan(.01);
      if (surface === "practice") await layer.getByRole("combobox", { name: "这次练的技能", exact: true }).selectOption("return-depth");
      await field.fill("test：放大后可以缩回，文字还在");
      const session = await context.newCDPSession(page);
      await pinch(page, session, field, true);
      expect(pageErrors.get(page), "Two-finger zoom must not throw browser errors").toEqual([]);
      await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeGreaterThan(1.2);
      await expect.poll(() => layer.evaluate(element => {
        const viewport = window.visualViewport!;
        return [document.activeElement, ...element.querySelectorAll(".discovery-actions button")].every(control => {
          if (!(control instanceof HTMLElement)) return false;
          const bounds = control.getBoundingClientRect();
          return bounds.left >= viewport.offsetLeft - 1 && bounds.right <= viewport.offsetLeft + viewport.width + 1;
        });
      })).toBe(true);
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("test：放大后可以缩回，文字还在");
      await pinch(page, session, field, false);
      expect(pageErrors.get(page), "Pinching back must not throw browser errors").toEqual([]);
      await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeLessThanOrEqual(1.08);
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("test：放大后可以缩回，文字还在");
      // The court still owns its drawing gesture; granting text pinch must
      // never release drawing to browser scroll or zoom.
      await expect(current(page).getByTestId("board-canvas")).toHaveCSS("touch-action", "none");
      const save = layer.getByRole("button", { name: "保存发现", exact: true });
      await expect(save).toBeEnabled();
      await save.tap();
      await expect(layer).toBeHidden();
      const key = RECORD_KEYS[surface === "point" ? 1 : 2];
      expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before[0]);
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).records[0].note, key)).toBe("test：放大后可以缩回，文字还在");
      expect(await page.evaluate(() => document.activeElement?.matches("input, textarea") ?? false)).toBe(false);
      await page.reload();
      await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).tap();
      const reopened = await openSurface(page, surface);
      await expect(reopened.field).toHaveValue("test：放大后可以缩回，文字还在");
      await reopened.cancel.tap();
      await expect(reopened.layer).toBeHidden();
    });
  }
});
