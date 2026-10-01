import { expect, test, type Page } from "@playwright/test";
import { createStarterBoard } from "../src/board/model";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const NOTE_KEYS = ["rallypath:board-discovery:v1", "rallypath:board-follow-up:v1"];
const base = createStarterBoard();
const ballId = base.actors.find(actor => actor.kind === "ball")!.id;
const starter = { ...base, id: "v034-edge-input", title: "双指输入检查", smartRally: undefined, updatedAt: "2026-10-01T23:00:00.000Z", frames: [{ ...base.frames[0], paths: [{ id: "edge-shot", kind: "shot" as const, actorId: ballId, from: [.64, .96], to: [.28, .18] }] }] };
const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');
const pageErrors = new WeakMap<Page, string[]>();

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.stack ?? `${error.name}: ${error.message}`));
  await page.goto("/");
  await page.evaluate(({ key, value }) => {
    localStorage.clear();
    localStorage.setItem(key, value);
  }, { key: BOARD_KEY, value: JSON.stringify({ version: 1, boards: [starter] }) });
  await page.reload();
  await page.getByRole("button", { name: `接着画${starter.title}`, exact: true }).tap();
  await expect(current(page).getByTestId("board-canvas")).toBeVisible();
  await expect.poll(() => current(page).evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(.01);
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page), "Native edge and text gestures must not throw browser errors").toEqual([]);
});

async function snapshot(page: Page) {
  return page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [BOARD_KEY, ...NOTE_KEYS]);
}

async function expectBoardUnchanged(page: Page, before: Array<string | null>) {
  await expect(current(page).getByTestId("board-canvas")).toBeVisible();
  await expect(current(page).locator(".board-editor")).toHaveCount(1);
  await expect.poll(() => current(page).locator(".board-editor").evaluate(element => Number.parseFloat(getComputedStyle(element).translate) || 0)).toBe(0);
  expect(await snapshot(page)).toEqual(before);
}

test("a two-finger gesture beginning on the note surface near the left edge stays native", async ({ page }) => {
  await current(page).getByRole("button", { name: "添加对象", exact: true }).tap();
  await page.getByTestId("bottom-sheet").getByRole("button", { name: "文字备注", exact: true }).tap();
  const canvas = current(page).getByTestId("board-canvas");
  const bounds = await canvas.boundingBox();
  await canvas.tap({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
  const editor = page.getByTestId("board-inline-note-editor");
  const field = editor.getByRole("textbox", { name: "画板备注", exact: true });
  // Wait for the outgoing palette portal and its modal scroll lock to leave;
  // this case exercises the stable inline note surface, not its transition.
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
  await field.fill("双指缩放不丢草稿");
  await expect(field).toBeFocused();
  const before = await snapshot(page);
  // Headless WebKit cannot open an iPhone keyboard. Cancellable touch events
  // exercise the app's actual capture listener without imitating OS zoom.
  const prevented = await page.getByTestId("board-note-overlay").evaluate(target => {
    const emit = (type: string, touches: Array<{ clientX: number; clientY: number }>, changedTouches = touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const left = target.closest(".flow-stack")!.getBoundingClientRect().left;
    const start = [{ clientX: left + 5, clientY: 350 }, { clientX: left + 70, clientY: 350 }];
    const finish = [{ clientX: left + 140, clientY: 350 }, { clientX: left + 210, clientY: 350 }];
    return [emit("touchstart", start), emit("touchmove", finish), emit("touchend", [], finish)];
  });
  expect(prevented).toEqual([false, false, false]);
  await expect(field).toHaveValue("双指缩放不丢草稿");
  await expect(field).toBeFocused();
  await expectBoardUnchanged(page, before);
  await editor.getByRole("button", { name: "取消备注", exact: true }).tap();
  expect(await snapshot(page)).toEqual(before);
});

test("adding a second finger cancels the active app edge gesture without blocking native touch", async ({ page }) => {
  const before = await snapshot(page);
  const prevented = await current(page).getByTestId("board-canvas").evaluate(target => {
    const emit = (type: string, touches: Array<{ clientX: number; clientY: number }>, changedTouches = touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const left = target.closest(".flow-stack")!.getBoundingClientRect().left;
    const first = { clientX: left + 5, clientY: 350 };
    const second = { clientX: left + 70, clientY: 350 };
    const finish = [{ clientX: left + 140, clientY: 350 }, { clientX: left + 210, clientY: 350 }];
    return [emit("touchstart", [first]), emit("touchstart", [first, second]), emit("touchmove", finish), emit("touchend", [], finish)];
  });
  expect(prevented).toEqual([true, false, false, false]);
  await expectBoardUnchanged(page, before);
});
