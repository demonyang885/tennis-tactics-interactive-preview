import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterBoard } from "../src/board/model";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const NOTE_KEYS = ["rallypath:board-discovery:v1", "rallypath:board-follow-up:v1"];
// Fractional visual-viewport coordinates can produce 43.999969 for a 44px
// control. Keep its integer layout height strict and allow only roundoff.
const CSS_PIXEL_EPSILON = .001;
const starter = createStarterBoard();
const ballId = starter.actors.find(actor => actor.kind === "ball")!.id;
const board = { ...starter, id: "v033-native-input", title: "原生输入检查", smartRally: undefined, updatedAt: "2026-10-01T12:00:00.000Z", frames: [{ ...starter.frames[0], paths: [{ id: "serve", kind: "shot" as const, actorId: ballId, from: [.64, .96], to: [.28, .18] }] }] };
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.stack ?? `${error.name}: ${error.message}`));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page), "Native discovery entry must not throw browser errors").toEqual([]);
});

const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');

async function openNote(page: Page, title: string) {
  await current(page).getByRole("button", { name: `打开${board.title}的画板菜单`, exact: true }).tap();
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: title, exact: true }).tap();
  const layer = page.getByRole("dialog", { name: title, exact: true });
  await expect(layer).toHaveAttribute("data-testid", "discovery-edit-layer");
  await expect(layer).toBeVisible();
  await expect(layer.getByTestId("board-text-editor-header")).toBeVisible();
  return layer;
}

async function assertNativeField(page: Page, field: Locator) {
  const metrics = await field.evaluate(element => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    layoutHeight: (element as HTMLElement).offsetHeight,
  }));
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.width).toBeGreaterThan(0);
  expect(metrics.layoutHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.height).toBeGreaterThanOrEqual(44 - CSS_PIXEL_EPSILON);
  await field.focus();
  await expect(field).toBeFocused();
  expect(await field.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
}

/** The independent editor fills the visible screen; actions stay above its scrolling body. */
async function expectVisibleEditor(layer: Locator) {
  await expect.poll(() => layer.evaluate((element, epsilon) => {
    const viewport = window.visualViewport!;
    const screen = element.closest(".device-screen")!.getBoundingClientRect();
    const expected = {
      top: Math.max(screen.top, viewport.offsetTop),
      bottom: Math.min(screen.bottom, viewport.offsetTop + viewport.height),
      left: Math.max(screen.left, viewport.offsetLeft),
      right: Math.min(screen.right, viewport.offsetLeft + viewport.width),
    };
    const bounds = element.getBoundingClientRect();
    const fullIntersection = Object.entries(expected).every(([edge, value]) => Math.abs(bounds[edge as keyof typeof expected] - value) <= 1);
    const header = element.querySelector<HTMLElement>('[data-testid="board-text-editor-header"]');
    const content = element.querySelector<HTMLElement>('[data-testid="board-text-editor-content"]');
    const active = document.activeElement;
    if (!header || !content || !(active instanceof HTMLElement) || !content.contains(active)) return false;
    const visible = (rect: DOMRect) => rect.left >= expected.left - 1 && rect.right <= expected.right + 1 && rect.top >= expected.top - 1 && rect.bottom <= expected.bottom + 1;
    const headerBounds = header.getBoundingClientRect(), contentBounds = content.getBoundingClientRect(), field = active.getBoundingClientRect();
    const buttons = [...header.querySelectorAll("button")];
    const actionsVisible = buttons.length === 2 && buttons.every(button => visible(button.getBoundingClientRect()) && button.offsetHeight >= 44 && button.getBoundingClientRect().height >= 44 - epsilon);
    const style = getComputedStyle(active);
    const fieldHasReadableText = Number.parseFloat(style.fontSize) >= 16 && active.offsetHeight >= 44 && field.height >= 44 - epsilon &&
      active.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom) >= (Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2) - 1;
    return fullIntersection && visible(headerBounds) && visible(contentBounds) && visible(field) && actionsVisible && fieldHasReadableText &&
      headerBounds.bottom <= contentBounds.top + 1 && headerBounds.bottom <= field.top + 1 &&
      field.top >= contentBounds.top - 1 && field.bottom <= contentBounds.bottom + 1 &&
      field.left >= contentBounds.left - 1 && field.right <= contentBounds.right + 1 &&
      content.scrollWidth <= content.clientWidth && header.scrollWidth <= header.clientWidth;
  }, CSS_PIXEL_EPSILON)).toBe(true);
}

async function keyboardViewport(page: Page, height: number, top: number, scale = 1, width = page.viewportSize()!.width, left = 0) {
  // Headless browsers do not open an iOS software keyboard. Only the visible
  // viewport geometry/events are injected; the rendered app owns its layout.
  await page.evaluate(({ height, top, scale, width, left }) => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => height },
      offsetTop: { configurable: true, get: () => top },
      scale: { configurable: true, get: () => scale },
      width: { configurable: true, get: () => width },
      offsetLeft: { configurable: true, get: () => left },
    });
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  }, { height, top, scale, width, left });
}

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }]) {
  test.describe(`native discovery input at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    for (const kind of ["point", "practice"] as const) {
      test(`${kind} fields keep readable native sizes and save/cancel safely`, async ({ page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/");
        await page.evaluate(({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); }, { key: BOARD_KEY, value: JSON.stringify({ version: 1, boards: [board] }) });
        await page.reload();
        await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).tap();
        await expect(current(page).getByTestId("board-canvas")).toBeVisible();
        const title = kind === "point" ? "一分的发现" : "练后发现";
        const label = kind === "point" ? "发现了什么" : "练后发现了什么";
        const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, ...NOTE_KEYS]);
        const layer = await openNote(page, title);
        const fields = layer.locator("textarea, select");
        expect(await fields.count()).toBe(3);
        for (const field of await fields.all()) await assertNativeField(page, field);
        expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toBe("width=device-width, initial-scale=1.0");
        await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
        await expect(page.locator(".keyboard-asset")).toHaveCount(0);
        await expectVisibleEditor(layer);
        await layer.getByRole("textbox", { name: label, exact: true }).fill("聚焦后取消的发现");
        await layer.getByRole("button", { name: "先不记", exact: true }).tap();
        await expect(layer).toBeHidden();
        expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, ...NOTE_KEYS])).toEqual(before);
        expect(await page.evaluate(() => document.activeElement?.matches("textarea, input") ?? false)).toBe(false);

        const reopened = await openNote(page, title);
        const note = reopened.getByRole("textbox", { name: label, exact: true });
        await note.fill("接发深一点，下次有时间回位");
        if (kind === "point") await reopened.getByRole("textbox", { name: "下次想试", exact: true }).fill("保持深度");
        else await reopened.getByRole("combobox", { name: "这次练的技能", exact: true }).selectOption("return-depth");
        await reopened.getByRole("button", { name: "保存发现", exact: true }).tap();
        await expect(reopened).toBeHidden();
        expect(await page.evaluate(key => localStorage.getItem(key), BOARD_KEY)).toBe(before[0]);
        const record = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).records[0], NOTE_KEYS[kind === "point" ? 0 : 1]);
        expect(record).toMatchObject({ boardId: board.id, note: "接发深一点，下次有时间回位" });
        expect(await page.evaluate(() => document.activeElement?.matches("textarea, input") ?? false)).toBe(false);
        await page.reload();
        await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).tap();
        const saved = await openNote(page, title);
        await expect(saved.getByRole("textbox", { name: label, exact: true })).toHaveValue(record.note);
        await testInfo.attach(`${kind}-input-${viewport.width}.png`, { body: await page.screenshot(), contentType: "image/png" });
      });

      test(`${kind} keeps focused text and actions inside a shortened keyboard viewport`, async ({ page }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("/");
        await page.evaluate(({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); }, { key: BOARD_KEY, value: JSON.stringify({ version: 1, boards: [board] }) });
        await page.reload();
        await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).tap();
        const title = kind === "point" ? "一分的发现" : "练后发现";
        const label = kind === "point" ? "下次想试" : "练后发现了什么";
        const layer = await openNote(page, title);
        const initial = await layer.boundingBox();
        expect(initial!.y).toBeCloseTo(0, 0);
        const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, ...NOTE_KEYS]);
        const field = layer.getByRole("textbox", { name: label, exact: true });
        await field.fill("键盘出现时仍能看见正在输入的文字");
        for (const height of [360, 260, 240, 220]) {
          await keyboardViewport(page, height, 70);
          await expectVisibleEditor(layer);
          await expect(field).toBeFocused();
          await expect(field).toHaveValue("键盘出现时仍能看见正在输入的文字");
        }
        const keyboardBounds = await layer.boundingBox();
        expect(keyboardBounds!.y).toBeCloseTo(70, 0);
        expect(keyboardBounds!.height).toBeCloseTo(220, 0);
        await testInfo.attach(`${kind}-shortened-viewport-${viewport.width}.png`, { body: await page.screenshot(), contentType: "image/png" });
        await keyboardViewport(page, 240, 110, 1.75, viewport.width / 1.75, 30);
        await expectVisibleEditor(layer);
        expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1.75);
        await expect(field).toBeFocused();
        await expect(field).toHaveValue("键盘出现时仍能看见正在输入的文字");
        await keyboardViewport(page, viewport.height, 0);
        await expectVisibleEditor(layer);
        await expect.poll(async () => (await layer.boundingBox())?.y).toBeCloseTo(initial!.y, 0);
        await layer.getByRole("button", { name: "先不记", exact: true }).tap();
        await expect(layer).toBeHidden();
        expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, ...NOTE_KEYS])).toEqual(before);
        await keyboardViewport(page, 360, 70);
        const reopened = await openNote(page, title);
        // The independent editor starts from the current viewport without a
        // cancelled draft and expands back to the full screen after dismissal.
        await expect(reopened.getByRole("textbox", { name: label, exact: true })).toHaveValue("");
        await reopened.getByRole("textbox", { name: label, exact: true }).focus();
        await expectVisibleEditor(reopened);
        await keyboardViewport(page, viewport.height, 0);
        await expectVisibleEditor(reopened);
        await expect.poll(async () => (await reopened.boundingBox())?.y).toBeCloseTo(initial!.y, 0);
      });
    }
  });
}
