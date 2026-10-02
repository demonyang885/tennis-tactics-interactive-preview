import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { createStarterBoard, type BoardDocument } from "../src/board/model";
import { fixedSkillById } from "../src/learning/model";
import type { BoardDiscovery } from "../src/learning/discovery";
import type { BoardFollowUp } from "../src/learning/followUp";

const BOARD_KEY = "tennis-tactics:board-drafts:v1";
const POINT_KEY = "rallypath:board-discovery:v1";
const PRACTICE_KEY = "rallypath:board-follow-up:v1";
const CHOICE_KEY = "rallypath:board-learning:v1";
const KEYS = [BOARD_KEY, POINT_KEY, PRACTICE_KEY, CHOICE_KEY];
const base = createStarterBoard();
const ballId = base.actors.find(actor => actor.kind === "ball")!.id;
const board: BoardDocument = {
  ...base, id: "v035-editing-original", title: "原来的两拍画板", purpose: "review", smartRally: undefined,
  updatedAt: "2026-10-01T09:00:00.000Z",
  frames: [
    { ...base.frames[0], id: "opening", label: "发球", paths: [{ id: "serve", kind: "shot", actorId: ballId, from: [.64, .96], to: [.28, .18] }] },
    { ...base.frames[0], id: "reply", label: "回球", poses: { ...base.frames[0].poses, [ballId]: [.28, .18] }, paths: [{ id: "return", kind: "shot", actorId: ballId, from: [.28, .18], to: [.75, .85] }] },
  ],
};
const point: BoardDiscovery = {
  version: 1, id: "original-point", boardId: board.id, frameId: "opening", progress: .42,
  note: "原来的发现", nextTry: "原来下次想试的内容", uncertain: false,
  createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z",
};
const skill = fixedSkillById("return-depth")!;
const practice: BoardFollowUp = {
  version: 1, id: "original-practice", boardId: board.id, frameId: "opening", progress: .63,
  skillId: skill.id, skillLabel: skill.label, question: skill.question, note: "原来的练后发现", uncertain: false,
  createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z",
};
const current = (page: Page) => page.locator('.flow-screen[data-flow-current="true"]:not(.flow-pop-exiting)');
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.stack ?? `${error.name}: ${error.message}`));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page), "Native discovery editing must not throw browser errors").toEqual([]);
});

async function snapshot(page: Page) {
  return page.evaluate(keys => keys.map(key => localStorage.getItem(key)), KEYS);
}

async function fresh(page: Page, existing = true) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.evaluate(({ board, point, practice, existing, keys }) => {
    localStorage.clear();
    localStorage.setItem(keys[0], JSON.stringify({ version: 1, boards: [board] }));
    if (existing) {
      localStorage.setItem(keys[1], JSON.stringify({ version: 1, records: [point] }));
      localStorage.setItem(keys[2], JSON.stringify({ version: 1, records: [practice] }));
    }
    localStorage.setItem(keys[3], JSON.stringify({ version: 1, records: [{ version: 1, boardId: board.id, route: "tactic", tacticId: "serve-plus-one", updatedAt: board.updatedAt }] }));
  }, { board, point, practice, existing, keys: KEYS });
  await page.reload();
  await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).tap();
  await expect(current(page).getByTestId("board-canvas")).toBeVisible();
}

async function openEditor(page: Page, kind: "point" | "practice") {
  await current(page).getByRole("button", { name: `打开${board.title}的画板菜单`, exact: true }).tap();
  const title = kind === "point" ? "一分的发现" : "练后发现";
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: title, exact: true }).tap();
  const layer = page.getByRole("dialog", { name: title, exact: true });
  await expect(layer).toHaveAttribute("data-testid", "discovery-edit-layer");
  // The old menu's modal scroll lock survives its exit animation. Native
  // gestures begin after that outgoing portal has actually been removed.
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
  const header = layer.getByTestId("board-text-editor-header");
  const cancel = header.getByRole("button", { name: "先不记", exact: true });
  const done = header.getByRole("button", { name: "保存发现", exact: true });
  await expect(cancel).toHaveText("取消");
  await expect(done).toHaveText("完成");
  await expect(layer.locator(".sheet-handle-zone")).toHaveCount(0);
  const field = layer.getByRole("textbox", { name: kind === "point" ? "发现了什么" : "练后发现了什么", exact: true });
  return { layer, header, cancel, done, field };
}

async function keyboardViewport(page: Page, height: number, width: number, top = 70, left = 16, scale = 1) {
  // Headless browsers do not open an iPhone software keyboard. This supplies
  // its viewport geometry; the app must render and scroll the actual editor.
  await page.evaluate(({ height, width, top, left, scale }) => {
    const viewport = window.visualViewport!;
    Object.defineProperties(viewport, {
      height: { configurable: true, get: () => height },
      width: { configurable: true, get: () => width },
      offsetTop: { configurable: true, get: () => top },
      offsetLeft: { configurable: true, get: () => left },
      scale: { configurable: true, get: () => scale },
    });
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  }, { height, width, top, left, scale });
}

async function assertFocusedEditorVisible(layer: Locator) {
  await expect.poll(() => layer.evaluate(element => {
    const viewport = window.visualViewport!, active = document.activeElement;
    const header = element.querySelector<HTMLElement>('[data-testid="board-text-editor-header"]');
    const content = element.querySelector<HTMLElement>('[data-testid="board-text-editor-content"]');
    if (!(active instanceof HTMLTextAreaElement) || !element.contains(active) || !header || !content) return false;
    const top = viewport.offsetTop, left = viewport.offsetLeft, bottom = top + viewport.height, right = left + viewport.width;
    const within = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      return box.top >= top - 1 && box.bottom <= bottom + 1 && box.left >= left - 1 && box.right <= right + 1;
    };
    const box = element.getBoundingClientRect(), field = active.getBoundingClientRect(), headerBox = header.getBoundingClientRect(), contentBox = content.getBoundingClientRect();
    const controls = [...header.querySelectorAll<HTMLElement>("button")];
    return controls.length === 2 && controls.every(control => within(control) && control.offsetHeight >= 44 && control.offsetWidth >= 44)
      && within(active) && active.offsetHeight >= 44 && Number.parseFloat(getComputedStyle(active).fontSize) >= 16
      && headerBox.bottom <= field.top + 1 && field.top >= contentBox.top - 1 && field.bottom <= contentBox.bottom + 1
      && box.top >= top - 1 && box.bottom <= bottom + 1 && box.left >= left - 1 && box.right <= right + 1
      && Math.abs(box.height - viewport.height) <= 2 && Math.abs(box.width - viewport.width) <= 2;
  }), { message: "Focused text and fixed top actions must fit both axes above the native keyboard" }).toBe(true);
}

async function pinch(page: Page, session: CDPSession, field: Locator, expanding: boolean) {
  const geometry = await field.evaluate(element => {
    const box = element.getBoundingClientRect(), viewport = window.visualViewport!;
    // CDP takes visual-viewport CSS coordinates. Multiplying by native zoom
    // sends the second gesture onto the court beneath this editor instead.
    return { x: box.left + box.width / 2 - viewport.offsetLeft, y: box.top + box.height / 2 - viewport.offsetTop, halfWidth: box.width / 2 };
  });
  const distance = Math.min(84, geometry.halfWidth - 3);
  const start = expanding ? 20 : distance, end = expanding ? 84 : 1;
  const points = (distance: number) => [
    { id: 1, x: geometry.x - distance, y: geometry.y, radiusX: 3, radiusY: 3, force: 1 },
    { id: 2, x: geometry.x + distance, y: geometry.y, radiusX: 3, radiusY: 3, force: 1 },
  ];
  await field.evaluate(element => {
    element.removeAttribute("data-v035-pinch-target");
    const receipt = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const onField = event.target === element && [...event.touches].every(touch => touch.target === element);
      element.setAttribute("data-v035-pinch-target", onField ? "textarea" : "other");
      document.removeEventListener("touchstart", receipt, true);
    };
    document.addEventListener("touchstart", receipt, true);
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(start) });
  await expect(field).toHaveAttribute("data-v035-pinch-target", "textarea");
  for (let index = 1; index <= 16; index++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(start + (end - start) * index / 16) });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  expect(pageErrors.get(page), "Native two-finger editing must not throw browser errors").toEqual([]);
}

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }]) {
  test.describe(`full discovery editor at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    for (const kind of ["point", "practice"] as const) {
      test(`${kind} keeps the focused note and top actions visible in 360/260/220 keyboard viewports`, async ({ page }) => {
        await fresh(page);
        const before = await snapshot(page);
        const { layer, field, cancel } = await openEditor(page, kind);
        await field.fill("键盘弹出后仍能看见\n正在输入的这一句\n后面的内容也保留");
        for (const height of [360, 260, 220]) {
          await keyboardViewport(page, height, viewport.width - 32);
          await assertFocusedEditorVisible(layer);
          await expect(field).toBeFocused();
          await expect(field).toHaveValue("键盘弹出后仍能看见\n正在输入的这一句\n后面的内容也保留");
        }
        if (kind === "point") {
          const nextTry = layer.getByRole("textbox", { name: "下次想试", exact: true });
          await nextTry.fill("下一次的计划也不能被键盘挡住");
          await assertFocusedEditorVisible(layer);
          await expect(nextTry).toBeFocused();
          await expect(nextTry).toHaveValue("下一次的计划也不能被键盘挡住");
        }
        await keyboardViewport(page, 240, viewport.width / 1.75, 110, 30, 1.75);
        await assertFocusedEditorVisible(layer);
        expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1.75);
        await cancel.tap();
        await expect(layer).toBeHidden();
        expect(await snapshot(page)).toEqual(before);
        expect(await page.evaluate(() => document.activeElement?.matches("textarea, input") ?? false)).toBe(false);
        await keyboardViewport(page, viewport.height, viewport.width, 0, 0);
        const reopened = await openEditor(page, kind);
        await expect(reopened.field).toHaveValue(kind === "point" ? point.note : practice.note);
        await reopened.cancel.tap();
      });
    }
  });
}

test.describe("discovery editing preserves the original learning records", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  for (const kind of ["point", "practice"] as const) {
    test(`${kind} completion and refresh preserve IDs, frame progress, optional fields and the original board`, async ({ page }) => {
      await fresh(page);
      const before = await snapshot(page);
      const { layer, field, done } = await openEditor(page, kind);
      await field.fill("简洁编辑后保存的新发现");
      if (kind === "point") {
        await expect(layer.getByRole("textbox", { name: "下次想试", exact: true })).toHaveValue(point.nextTry);
      } else {
        await expect(layer.getByRole("combobox", { name: "这次练的技能", exact: true })).toHaveValue(skill.id);
      }
      await keyboardViewport(page, 260, 358);
      // Return focus to the note after inspecting metadata; completing must
      // work while the native field and its keyboard are still active.
      await field.focus();
      await assertFocusedEditorVisible(layer);
      await done.tap();
      await expect(layer).toBeHidden();
      const after = await snapshot(page);
      expect(after[0]).toBe(before[0]);
      expect(after[3]).toBe(before[3]);
      expect(after[kind === "point" ? 2 : 1]).toBe(before[kind === "point" ? 2 : 1]);
      const record = JSON.parse(after[kind === "point" ? 1 : 2]!).records[0];
      expect(record).toMatchObject({ ...(kind === "point" ? point : practice), note: "简洁编辑后保存的新发现", updatedAt: expect.any(String) });
      expect(record.updatedAt).not.toBe((kind === "point" ? point : practice).updatedAt);
      await page.reload();
      await page.getByRole("button", { name: `接着画${board.title}`, exact: true }).tap();
      const reopened = await openEditor(page, kind);
      await expect(reopened.field).toHaveValue(record.note);
      await reopened.cancel.tap();
    });
  }

  test("a point discovery remains optional and can contain only the next thing to try", async ({ page }) => {
    await fresh(page, false);
    const before = await snapshot(page);
    const { layer, field, done } = await openEditor(page, "point");
    await expect(field).toHaveValue("");
    await expect(done).toBeDisabled();
    await layer.getByRole("textbox", { name: "下次想试", exact: true }).fill("下次先回深中路");
    await expect(done).toBeEnabled();
    await done.tap();
    await expect(layer).toBeHidden();
    const after = await snapshot(page);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
    expect(JSON.parse(after[1]!).records).toMatchObject([{ boardId: board.id, frameId: "opening", note: "", nextTry: "下次先回深中路", uncertain: false }]);
  });

  test("an uncertain practice discovery can leave text empty while still requiring its skill", async ({ page }) => {
    await fresh(page, false);
    const before = await snapshot(page);
    const { layer, field, done } = await openEditor(page, "practice");
    await expect(field).toHaveValue("");
    await layer.getByRole("checkbox", { name: "还不确定，下次再看", exact: true }).check();
    await expect(done).toBeDisabled();
    await layer.getByRole("combobox", { name: "这次练的技能", exact: true }).selectOption(skill.id);
    await expect(done).toBeEnabled();
    await done.tap();
    await expect(layer).toBeHidden();
    const after = await snapshot(page);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[3]).toBe(before[3]);
    expect(JSON.parse(after[2]!).records).toMatchObject([{ boardId: board.id, frameId: "opening", skillId: skill.id, note: "", uncertain: true }]);
  });

  test("changing the associated frame preserves the note identity and clears only its old progress", async ({ page }) => {
    await fresh(page);
    const before = await snapshot(page);
    const { layer, done } = await openEditor(page, "point");
    await layer.getByRole("combobox", { name: "记录在哪一拍", exact: true }).selectOption("reply");
    await done.tap();
    await expect(layer).toBeHidden();
    const after = await snapshot(page), record = JSON.parse(after[1]!).records[0];
    expect(record).toMatchObject({ id: point.id, boardId: board.id, frameId: "reply", note: point.note, nextTry: point.nextTry, createdAt: point.createdAt });
    expect(record).not.toHaveProperty("progress");
    expect([after[0], after[2], after[3]]).toEqual([before[0], before[2], before[3]]);
  });
});

test.describe("native two-finger discovery editing", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  for (const kind of ["point", "practice"] as const) {
    test(`${kind} still allows real browser pinch, preserves focus and saves without errors`, async ({ page, context, browserName }) => {
      test.skip(browserName !== "chromium", "CDP touch injection cannot establish a physical iPhone Safari result");
      await fresh(page);
      const before = await snapshot(page);
      const { layer, field, done } = await openEditor(page, kind);
      await field.fill("原生缩放后继续编辑");
      const session = await context.newCDPSession(page);
      await pinch(page, session, field, true);
      await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeGreaterThan(1.2);
      await assertFocusedEditorVisible(layer);
      await expect(field).toBeFocused();
      await page.keyboard.insertText("，文字没有丢失");
      await expect(field).toHaveValue("原生缩放后继续编辑，文字没有丢失");
      for (let gesture = 0; gesture < 3 && await page.evaluate(() => window.visualViewport!.scale) > 1.08; gesture++) {
        const previousScale = await page.evaluate(() => window.visualViewport!.scale);
        await pinch(page, session, field, false);
        await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeLessThan(previousScale);
      }
      await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeLessThanOrEqual(1.08);
      await assertFocusedEditorVisible(layer);
      await done.tap();
      await expect(layer).toBeHidden();
      const after = await snapshot(page);
      expect(after[0]).toBe(before[0]);
      expect(after[3]).toBe(before[3]);
      expect(JSON.parse(after[kind === "point" ? 1 : 2]!).records[0].note).toBe("原生缩放后继续编辑，文字没有丢失");
      await expect(current(page).getByTestId("board-canvas")).toHaveCSS("touch-action", "none");
    });
  }
});
