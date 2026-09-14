import { expect, test, type Page } from "@playwright/test";

async function openCleanHomepage(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const selectors = [
      "html",
      "body",
      '[data-testid="device-screen"]',
      '[data-testid="mobile-scroll"]',
      ".board-home-portrait",
    ];
    return selectors.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing overflow target: ${selector}`);
      return { selector, overflow: element.scrollWidth - element.clientWidth };
    });
  });

  for (const result of overflow) {
    expect(result.overflow, `${result.selector} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
}

test.beforeEach(async ({ page }) => {
  await openCleanHomepage(page);
});

test("converges the homepage to one board, two intentions, and one knowledge entry", async ({ page }) => {
  await expect(page.getByRole("button", { name: "画第一拍", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "想下一分", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "记下刚才一分", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "找个打法", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^想一拍|^去训练|^刚打完|看组合打法/ })).toHaveCount(0);
  await expect(page.locator(".home-accordion")).toHaveCount(0);
});

test("uses the same editor for planning and recalling with the right first hint", async ({ page }) => {
  await page.getByRole("button", { name: "想下一分", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  await expect(page.getByTestId("flow-current").locator(".board-interaction-guide")).toContainText(/从网球拖出去.*发球路线/);

  await page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true }).getByRole("button", { name: "返回上一页", exact: true }).click();
  await page.getByRole("button", { name: "记下刚才一分", exact: true }).click();
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  await expect(page.getByTestId("flow-current").locator(".board-interaction-guide")).toContainText(/从网球拖出去.*还原这一分/);
});

test("keeps the knowledge library below the first viewport and opens it after scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const scroll = page.getByTestId("flow-current").getByTestId("mobile-scroll");
  const knowledge = page.getByRole("button", { name: "找个打法", exact: true });
  const actions = page.locator(".home-intent-actions");
  const [scrollBox, knowledgeBox, actionsBox] = await Promise.all([
    scroll.boundingBox(),
    knowledge.boundingBox(),
    actions.boundingBox(),
  ]);
  expect(scrollBox).not.toBeNull();
  expect(knowledgeBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(scrollBox!.y + scrollBox!.height + 1);
  expect(knowledgeBox!.y).toBeGreaterThanOrEqual(scrollBox!.y + scrollBox!.height);

  await knowledge.scrollIntoViewIfNeeded();
  await expect(knowledge).toBeInViewport();
  await knowledge.click();
  await expect(page.getByRole("heading", { name: "战术知识库", exact: true })).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  test(`keeps the portrait preview and equal intent buttons at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.reload();
    await expectNoHorizontalOverflow(page);

    const stage = page.locator(".home-board-playback-stage");
    const canvas = page.getByTestId("home-board-playback");
    const [stageBox, canvasSize, actionBoxes] = await Promise.all([
      stage.boundingBox(),
      canvas.evaluate((element) => ({
        width: (element as HTMLCanvasElement).width,
        height: (element as HTMLCanvasElement).height,
      })),
      page.locator(".home-intent-actions button").evaluateAll((buttons) => buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth };
      })),
    ]);
    expect(stageBox).not.toBeNull();
    expect(stageBox!.height).toBeGreaterThan(stageBox!.width);
    expect(canvasSize.height).toBeGreaterThan(canvasSize.width);
    expect(actionBoxes).toHaveLength(2);
    expect(Math.abs(actionBoxes[0].y - actionBoxes[1].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(actionBoxes[0].width - actionBoxes[1].width)).toBeLessThanOrEqual(2);
    expect(actionBoxes[0].height).toBeGreaterThanOrEqual(44);
    expect(actionBoxes[1].height).toBeGreaterThanOrEqual(44);
    for (const button of actionBoxes) expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth);
  });
}
