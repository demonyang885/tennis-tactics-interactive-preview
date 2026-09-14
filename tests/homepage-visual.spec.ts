import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createStarterBoard, type BoardDocument } from "../src/board/model";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "homepage should not emit browser errors").toEqual([]);
});

function visualDraft(): BoardDocument {
  const starter = createStarterBoard("我的战术板");
  const ball = starter.actors.find((actor) => actor.kind === "ball");
  if (!ball) throw new Error("starter board is missing its ball");
  const { smartRally: _smartRally, ...board } = starter;
  return {
    ...board,
    id: "homepage-design-evidence",
    updatedAt: "2026-09-14T10:00:00.000Z",
    frames: [{
      ...board.frames[0],
      duration: 1.6,
      paths: [{
        id: "homepage-design-serve",
        kind: "shot",
        actorId: ball.id,
        from: [...board.frames[0].poses[ball.id]],
        to: [0.3, 0.18],
        control: [0.7, 0.49],
      }],
    }],
  };
}

async function seedVisualDraft(page: Page) {
  const draft = visualDraft();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: JSON.stringify({ version: 1, boards: [draft] }) });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
  const scroll = page.getByTestId("flow-current").getByTestId("mobile-scroll");
  expect(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

async function expectPortraitBoardAndIntentGrid(page: Page) {
  const stage = page.locator(".home-board-playback-stage");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.height).toBeGreaterThan(stageBox!.width);
  const canvasSize = await page.getByTestId("home-board-playback").evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  expect(canvasSize.height).toBeGreaterThan(canvasSize.width);

  const buttons = await page.locator(".home-intent-actions button").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    const text = element.querySelector("span");
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      textFits: !text || text.scrollWidth <= text.clientWidth + 1,
    };
  }));
  expect(buttons).toHaveLength(2);
  expect(Math.abs(buttons[0].y - buttons[1].y)).toBeLessThanOrEqual(1);
  expect(Math.abs(buttons[0].width - buttons[1].width)).toBeLessThanOrEqual(2);
  expect(buttons.every((button) => button.height >= 44 && button.textFits)).toBe(true);
}

async function expectPureBoardPreview(page: Page) {
  const preview = page.locator(".home-preview-card");
  await expect(preview).toBeVisible();
  await expect(preview.locator(".home-preview-heading,.home-board-playback-replay")).toHaveCount(0);
  await expect(preview).not.toContainText(/最后编辑|发球站位|我方|对手|网球|球路|跑位/);
  await expect(page.getByTestId("home-board-playback")).toHaveAttribute("aria-hidden", "true");
}

async function expectPreviewDominatesViewport(page: Page) {
  const viewport = page.viewportSize();
  const stageBox = await page.locator(".home-board-playback-stage").boundingBox();
  expect(viewport).not.toBeNull();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.width / viewport!.width).toBeGreaterThan(0.88);
  expect(stageBox!.height / viewport!.height).toBeGreaterThan(0.55);
}

async function saveEvidence(page: Page, filename: string) {
  if (process.env.UPDATE_DESIGN_EVIDENCE !== "1") return;
  const evidenceDirectory = path.join(process.cwd(), "docs", "design-qa");
  await mkdir(evidenceDirectory, { recursive: true });
  await page.getByTestId("device-screen").screenshot({ path: path.join(evidenceDirectory, filename) });
}

test("keeps a calm board-first hierarchy in the frameless desktop preview", async ({ page }) => {
  await seedVisualDraft(page);
  await page.goto("/");

  await expect(page.locator(".phone-bezel")).toBeHidden();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
  await expect(page.getByTestId("home-board-playback")).toHaveAttribute("data-board-id", "homepage-design-evidence");
  await expectPureBoardPreview(page);
  await expect(page.getByRole("button", { name: "接着画我的战术板", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "找个打法", exact: true })).toHaveCount(1);
  await expect(page.locator(".home-resume-card,.home-accordion")).toHaveCount(0);
  await expectPortraitBoardAndIntentGrid(page);
  await expectNoHorizontalOverflow(page);
});

test("matches the portrait top screen at 390 by 844 and keeps knowledge below the fold", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedVisualDraft(page);
  await page.goto("/");

  await expect(page.locator(".phone-bezel")).toBeHidden();
  const screen = page.getByTestId("device-screen");
  const screenBox = await screen.boundingBox();
  expect(screenBox?.width).toBeCloseTo(390, 0);
  expect(screenBox?.height).toBeCloseTo(844, 0);
  await expectPortraitBoardAndIntentGrid(page);
  await expectPureBoardPreview(page);
  await expectPreviewDominatesViewport(page);
  await expectNoHorizontalOverflow(page);

  const scroll = page.getByTestId("flow-current").getByTestId("mobile-scroll");
  const knowledge = page.getByRole("button", { name: "找个打法", exact: true });
  const [scrollBox, knowledgeBox] = await Promise.all([scroll.boundingBox(), knowledge.boundingBox()]);
  expect(scrollBox).not.toBeNull();
  expect(knowledgeBox).not.toBeNull();
  expect(knowledgeBox!.y).toBeGreaterThanOrEqual(scrollBox!.y + scrollBox!.height);
  await saveEvidence(page, "homepage-portrait-top-390x844.png");

  await knowledge.scrollIntoViewIfNeeded();
  await expect(knowledge).toBeInViewport();
  await saveEvidence(page, "homepage-portrait-knowledge-390x844.png");
});

test("keeps the same compact hierarchy at 320 by 700", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await seedVisualDraft(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "接着画我的战术板", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "想下一分", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "记下刚才一分", exact: true })).toBeVisible();
  await expectPortraitBoardAndIntentGrid(page);
  await expectPureBoardPreview(page);
  await expectPreviewDominatesViewport(page);
  await expectNoHorizontalOverflow(page);
  await saveEvidence(page, "homepage-portrait-top-320x700.png");
});
