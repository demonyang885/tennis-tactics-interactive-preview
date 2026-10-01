import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterBoard } from "../src/board/model";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const NOTE_KEYS = ["rallypath:board-discovery:v1", "rallypath:board-follow-up:v1"];
const starter = createStarterBoard();
const ballId = starter.actors.find(actor => actor.kind === "ball")!.id;
const board = { ...starter, id: "v033-native-input", title: "原生输入检查", smartRally: undefined, updatedAt: "2026-10-01T12:00:00.000Z", frames: [{ ...starter.frames[0], paths: [{ id: "serve", kind: "shot" as const, actorId: ballId, from: [.64, .96], to: [.28, .18] }] }] };
const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');

async function openNote(page: Page, title: string) {
  await current(page).getByRole("button", { name: `打开${board.title}的画板菜单`, exact: true }).tap();
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: title, exact: true }).tap();
  const sheet = page.getByRole("dialog", { name: title, exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function assertNativeField(page: Page, field: Locator) {
  const metrics = await field.evaluate(element => ({
    fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }));
  expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
  expect(metrics.width).toBeGreaterThan(0);
  expect(metrics.height).toBeGreaterThanOrEqual(44);
  await field.focus();
  await expect(field).toBeFocused();
  expect(await field.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
}

async function keyboardViewport(page: Page, height: number, top: number, scale = 1) {
  // Headless browsers do not open an iOS software keyboard. Only the visible
  // viewport geometry/events are injected; the rendered app owns its layout.
  await page.evaluate(({ height, top, scale }) => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => height },
      offsetTop: { configurable: true, get: () => top },
      scale: { configurable: true, get: () => scale },
    });
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  }, { height, top, scale });
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
        const sheet = await openNote(page, title);
        const fields = sheet.locator("textarea, select");
        expect(await fields.count()).toBe(3);
        for (const field of await fields.all()) await assertNativeField(page, field);
        expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toBe("width=device-width, initial-scale=1.0");
        await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
        await expect(page.locator(".keyboard-asset")).toHaveCount(0);
        await expect.poll(() => sheet.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await sheet.getByRole("textbox", { name: label, exact: true }).fill("聚焦后取消的发现");
        await sheet.getByRole("button", { name: "先不记", exact: true }).tap();
        await expect(sheet).toBeHidden();
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
        const sheet = await openNote(page, title);
        await expect.poll(() => sheet.evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))).toBeLessThan(.01);
        const initial = await sheet.boundingBox();
        const before = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, ...NOTE_KEYS]);
        const field = sheet.getByRole("textbox", { name: label, exact: true });
        await field.fill("键盘出现时仍能看见正在输入的文字");
        for (const height of [360, 260, 240, 220]) {
          await keyboardViewport(page, height, 70);
          await expect.poll(() => sheet.evaluate(element => {
          const viewport = window.visualViewport!;
          const top = viewport.offsetTop, bottom = top + viewport.height;
          const fields = [document.activeElement, ...element.querySelectorAll(".discovery-actions button")];
          const visible = fields.every(field => {
            if (!(field instanceof HTMLElement)) return false;
            const rect = field.getBoundingClientRect();
            return rect.top >= top - 1 && rect.bottom <= bottom + 1 && rect.height >= 44;
          });
          const field = document.activeElement!.getBoundingClientRect();
          const content = element.querySelector(".sheet-content")!.getBoundingClientRect();
          const actions = element.querySelector(".discovery-actions")!.getBoundingClientRect();
          return visible && field.top >= content.top - 1 && field.bottom <= actions.top - 4;
          })).toBe(true);
        }
        await expect(field).toBeFocused();
        await expect(field).toHaveValue("键盘出现时仍能看见正在输入的文字");
        const keyboardBounds = await sheet.boundingBox();
        expect(keyboardBounds!.height).toBeLessThanOrEqual(viewport.height * .625 + 1);
        await testInfo.attach(`${kind}-shortened-viewport-${viewport.width}.png`, { body: await page.screenshot(), contentType: "image/png" });
        await keyboardViewport(page, 240, 110, 1.75);
        const pinchedBounds = await sheet.boundingBox();
        expect(pinchedBounds!.y).toBeCloseTo(keyboardBounds!.y, 0);
        expect(pinchedBounds!.height).toBeCloseTo(keyboardBounds!.height, 0);
        expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1.75);
        await keyboardViewport(page, viewport.height, 0);
        await expect.poll(async () => (await sheet.boundingBox())?.y).toBeCloseTo(initial!.y, 0);
        await sheet.getByRole("button", { name: "先不记", exact: true }).tap();
        await expect(sheet).toBeHidden();
        expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, ...NOTE_KEYS])).toEqual(before);
        await keyboardViewport(page, 360, 70);
        const reopened = await openNote(page, title);
        // Closing unregisters the old sheet's listeners; a new sheet starts
        // from its current viewport and has no cancelled draft.
        await expect(reopened.getByRole("textbox", { name: label, exact: true })).toHaveValue("");
        await keyboardViewport(page, viewport.height, 0);
        await expect.poll(async () => (await reopened.boundingBox())?.y).toBeCloseTo(initial!.y, 0);
      });
    }
  });
}
