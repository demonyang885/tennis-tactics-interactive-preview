import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { createStarterBoard } from "../src/board/model";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const starter = createStarterBoard();
const ballId = starter.actors.find(actor => actor.kind === "ball")!.id;
const board = {
  ...starter, id: "v035-menu-scroll", title: "菜单上滑检查", smartRally: undefined,
  updatedAt: "2026-10-02T00:00:00.000Z",
  frames: [{ ...starter.frames[0], paths: [{ id: "serve", kind: "shot" as const, actorId: ballId, from: [.64, .96], to: [.28, .18] }] }],
};
const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
});

test.afterEach(({ page }) => {
  expect(browserErrors.get(page), "Opening and scrolling the board menu must not throw").toEqual([]);
});

async function openMenu(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(({ key, board }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ version: 1, boards: [board] }));
  }, { key: BOARD_KEY, board });
  await page.reload();
  await expect(current(page).getByTestId("board-canvas")).toBeVisible();
  await current(page).getByRole("button", {name:"展开常用操作"}).tap();
  await current(page).getByRole("button", { name: `打开${board.title}的画板菜单`, exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: "画板菜单", exact: true });
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))).toBeLessThan(.01);
  return sheet;
}

async function swipe(page: Page, cdp: CDPSession, x: number, from: number, to: number) {
  const point = (y: number) => [{ id: 1, x, y, radiusX: 3, radiusY: 3, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from) });
  for (let index = 1; index <= 16; index++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(from + (to - from) * index / 16) });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function visibleInside(control: Locator, content: Locator) {
  const [button, bounds] = await Promise.all([control.boundingBox(), content.boundingBox()]);
  return !!button && !!bounds && button.y >= bounds.y - 1 && button.y + button.height <= bounds.y + bounds.height + 1;
}

for (const height of [844, 420]) {
  test.describe(`board menu scroll at 390×${height}`, () => {
    test.use({ viewport: { width: 390, height }, hasTouch: true, isMobile: true });

    test("menu has a bounded scroll surface and its bottom display controls can be reached", async ({ page }) => {
      const sheet = await openMenu(page), content = sheet.locator(".sheet-content");
      const before = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
      const maximumScroll = await content.evaluate(element => element.scrollHeight - element.clientHeight);
      if (height === 420) expect(maximumScroll).toBeGreaterThan(50);
      else expect(maximumScroll).toBeGreaterThanOrEqual(0);
      await expect(content).toHaveCSS("overflow-y", "auto");
      // Linux WebKit does not expose CDP native touch injection. This checks
      // scroll/layout reachability only, separately from the real touch cases.
      await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const zones = sheet.getByRole("button", { name: /^站位分区颜色/ });
      await expect.poll(() => visibleInside(zones, content)).toBe(true);
      await expect(zones).toHaveAttribute("aria-pressed", "true");
      await expect(sheet.getByTestId("sheet-handle")).toHaveCSS("touch-action", "none");
      await expect(current(page).getByTestId("board-canvas")).toHaveCSS("touch-action", "none");
      expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });

    for (const edge of [false, true]) {
      test(`native upward swipes from the ${edge ? "left edge" : "content"} reach bottom without dismissing or changing the board`, async ({ page, context, browserName }) => {
        test.skip(browserName !== "chromium", "Native CDP touch gestures are Chromium-specific; iPhone Safari needs physical acceptance");
        const sheet = await openMenu(page), content = sheet.locator(".sheet-content");
        const before = await page.evaluate(key => localStorage.getItem(key), BOARD_KEY);
        const maximumScroll = await content.evaluate(element => element.scrollHeight - element.clientHeight);
        if (height === 420) expect(maximumScroll).toBeGreaterThan(50);
        const cdp = await context.newCDPSession(page);
        const bounds = await content.boundingBox();
        if (!bounds) throw new Error("Expected the visible menu scroll surface");
        const x = bounds.x + (edge ? 10 : bounds.width / 2), from = bounds.y + bounds.height - 25, to = bounds.y + 20;
        // Start the center gesture on a retained actionable row. A drag must
        // never open rename, including when all menu rows already fit.
        // Opening presets can place this row below the short viewport. Start
        // the real gesture on a visible row, never outside the sheet.
        if (!edge) await sheet.getByRole("button", { name: /^修改名称/ }).scrollIntoViewIfNeeded();
        const scrollBeforeGesture = await content.evaluate(element => element.scrollTop);
        const row = await sheet.getByRole("button", { name: /^修改名称/ }).boundingBox();
        if (!row) throw new Error("Expected a visible menu row");
        await swipe(page, cdp, x, edge ? from : row.y + row.height - 6, edge ? to : bounds.y + 10);
        if (maximumScroll > 0) {
          await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeGreaterThan(scrollBeforeGesture + Math.min(30, maximumScroll - scrollBeforeGesture) - 1);
        } else {
          expect(await content.evaluate(element => element.scrollTop)).toBe(0);
        }
        await expect(sheet).toBeVisible();
        await expect(page.getByTestId("board-rename-layer")).toHaveCount(0);
        for (let index = 0; index < 4; index++) {
          if (await content.evaluate(element => element.scrollTop >= element.scrollHeight - element.clientHeight - 2)) break;
          await swipe(page, cdp, x, from, to);
        }
        await expect.poll(() => content.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(2);
        await expect(sheet).toBeVisible();
        const zones = sheet.getByRole("button", { name: /^站位分区颜色/ });
        await expect.poll(() => visibleInside(zones, content)).toBe(true);
        await expect(zones).toHaveAttribute("aria-pressed", "true");
        expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before);
        await expect(current(page).getByTestId("board-canvas")).toBeVisible();
        expect(browserErrors.get(page), "A scroll must not initialize an incompatible flow swipe").toEqual([]);
        // Outside taps need to reach Radix's document pointerdown listener.
        // Dismissing after a scroll must neither edit nor leave this board.
        const overlay = page.getByTestId("sheet-overlay");
        const [overlayBounds, sheetBounds] = await Promise.all([overlay.boundingBox(), sheet.boundingBox()]);
        if (!overlayBounds || !sheetBounds) throw new Error("Expected the menu and its outside overlay");
        await overlay.tap({ position: { x: overlayBounds.width / 2, y: Math.max(5, (sheetBounds.y - overlayBounds.y) / 2) } });
        await expect(sheet).toBeHidden();
        await expect(current(page).getByTestId("board-canvas")).toBeVisible();
        expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before);
        await current(page).getByRole("button", {name:"展开常用操作"}).tap();
        await current(page).getByRole("button", { name: `打开${board.title}的画板菜单`, exact: true }).tap();
        await expect(sheet).toBeVisible();
        await expect.poll(() => sheet.evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))).toBeLessThan(.01);
        // The handle continues to own sheet dismissal after reopening.
        const handle = await sheet.getByTestId("sheet-handle").boundingBox();
        if (!handle) throw new Error("Expected the sheet drag handle");
        await swipe(page, cdp, handle.x + handle.width / 2, handle.y + handle.height / 2, Math.min(height - 5, handle.y + handle.height / 2 + 140));
        await expect(sheet).toBeHidden();
        expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before);
      });
    }
  });
}
