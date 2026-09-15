import { expect, test, type Locator, type Page } from "@playwright/test";

async function drag(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number,
  steps = 8,
  startOffset?: { x: number; y: number },
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Drag target has no bounding box");
  const startX = box.x + (startOffset?.x ?? box.width / 2);
  const startY = box.y + (startOffset?.y ?? box.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      startX + (deltaX * step) / steps,
      startY + (deltaY * step) / steps,
    );
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html");
});

test("horizontal intent stays in Carousel and cannot create parent momentum", async ({ page }) => {
  const carousel = page.locator(".fixture-carousel");
  const card = page.locator(".carousel-card").nth(1);
  const parent = page.getByTestId("mobile-scroll");

  await expect(carousel).not.toHaveAttribute("data-scroll-drag", "ignore");
  await drag(page, card, -130, 14, 5);

  const afterRelease = await carousel.evaluate((element) => element.scrollLeft);
  expect(afterRelease).toBeGreaterThan(40);
  expect(await parent.evaluate((element) => element.scrollTop)).toBe(0);

  await page.waitForTimeout(250);
  expect(await parent.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.getByTestId("tap-count").textContent()).toBe("0");
});

test("vertical intent over a carousel is handed to MobileScroll in both directions", async ({ page }) => {
  const card = page.locator(".carousel-card").nth(1);
  const carousel = page.locator(".fixture-carousel");
  const parent = page.getByTestId("mobile-scroll");

  await drag(page, card, 4, -150);
  expect(await parent.evaluate((element) => element.scrollTop)).toBeGreaterThan(60);
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBe(0);

  await parent.evaluate((element) => {
    element.scrollTop = 80;
  });
  await drag(page, card, -3, 110);
  expect(await parent.evaluate((element) => element.scrollTop)).toBeLessThan(80);
});

test("tap activates a card but a completed drag does not", async ({ page }) => {
  const firstCard = page.locator(".carousel-card").first();
  await firstCard.click();
  await expect(page.getByTestId("tap-count")).toHaveText("1");

  await drag(page, firstCard, -100, 6);
  await expect(page.getByTestId("tap-count")).toHaveText("1");
});

test("Carousel preserves momentum and edge rubber-banding", async ({ page }) => {
  const carousel = page.locator(".fixture-carousel");
  const card = page.locator(".carousel-card").nth(1);

  await drag(page, card, -100, 5, 3);
  const releasedOffset = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(120);
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(releasedOffset);

  await carousel.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const box = await card.boundingBox();
  if (!box) throw new Error("Card has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 4 });
  expect(Number(await carousel.getAttribute("data-overscroll"))).toBeGreaterThan(0);
  await page.mouse.up();
  await page.waitForTimeout(900);
  expect(Math.abs(Number(await carousel.getAttribute("data-overscroll")))).toBeLessThan(1);
});

test("BottomSheet remains mounted while its default exit animation plays", async ({ page }) => {
  await page.locator(".sheet-trigger").click();
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();

  // Stay inside the rounded device screen while still clicking above the sheet.
  await page.getByTestId("sheet-overlay").click({ position: { x: 80, y: 80 } });
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
});

test("native input focus never mounts a simulated keyboard or changes the footer inset", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=keyboard");
  const input = page.getByLabel("Message");
  const footer = page.getByTestId("flow-fixed-footer");
  const initialFooterBottom = await footer.evaluate((element) => getComputedStyle(element).bottom);

  await input.click();
  await expect(input).toBeFocused();
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
  await expect(page.locator(".keyboard-asset")).toHaveCount(0);
  await expect(page.getByTestId("mobile-app-viewport")).toHaveAttribute("data-keyboard-visible", "false");
  await expect(page.getByTestId("mobile-scroll")).toHaveCSS("--keyboard-height", "0px");
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some((entry) => /\/assets\/(iphone|android)\/Keyboard\.png$/.test(entry.name)))).toBe(false);
  expect(await footer.evaluate((element) => getComputedStyle(element).bottom)).toBe(initialFooterBottom);

  await input.evaluate((element: HTMLInputElement) => element.blur());
  await expect(input).not.toBeFocused();
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
});

test("keeps native input layout stable in direct iPhone mode and the legacy Pixel preview", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=keyboard");
  const input = page.getByLabel("Message");
  await input.evaluate((element: HTMLInputElement) => {
    element.value = "Draft message";
  });

  const devicePicker = page.getByTestId("device-picker");
  if (await devicePicker.count() === 0) {
    const frame = page.getByTestId("phone-frame");
    const screen = page.getByTestId("device-screen");
    const footer = page.getByTestId("flow-fixed-footer");
    await expect(frame).toHaveClass(/phone-stage-frameless/);
    await expect(screen).toHaveAttribute("data-device", "iphone");
    await expect(page.locator(".phone-bezel")).toHaveCount(0);
    await expect(input).toHaveValue("Draft message");
    expect((await screen.boundingBox())?.width).toBeCloseTo(393, 0);

    const directLayoutBefore = await page.evaluate(() => {
      const screenElement = document.querySelector<HTMLElement>('[data-testid="device-screen"]')!;
      const viewportElement = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;
      const scrollElement = document.querySelector<HTMLElement>('[data-testid="mobile-scroll"]')!;
      const footerElement = document.querySelector<HTMLElement>('[data-testid="flow-fixed-footer"]')!;
      return {
        screenBottom: screenElement.getBoundingClientRect().bottom,
        viewportBottom: viewportElement.getBoundingClientRect().bottom,
        scrollBottom: scrollElement.getBoundingClientRect().bottom,
        footerBottom: footerElement.getBoundingClientRect().bottom,
      };
    });

    await input.click();
    await expect(input).toBeFocused();
    await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
    await expect(page.getByTestId("mobile-app-viewport")).toHaveAttribute("data-keyboard-visible", "false");
    const directLayoutAfter = await page.evaluate(() => {
      const screenElement = document.querySelector<HTMLElement>('[data-testid="device-screen"]')!;
      const viewportElement = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;
      const scrollElement = document.querySelector<HTMLElement>('[data-testid="mobile-scroll"]')!;
      const footerElement = document.querySelector<HTMLElement>('[data-testid="flow-fixed-footer"]')!;
      return {
        screenBottom: screenElement.getBoundingClientRect().bottom,
        viewportBottom: viewportElement.getBoundingClientRect().bottom,
        scrollBottom: scrollElement.getBoundingClientRect().bottom,
        footerBottom: footerElement.getBoundingClientRect().bottom,
      };
    });
    expect(directLayoutBefore.viewportBottom).toBeCloseTo(directLayoutBefore.screenBottom, 0);
    expect(directLayoutAfter).toEqual(directLayoutBefore);
    expect(await footer.evaluate((element) => getComputedStyle(element).bottom)).not.toBe("0px");
    return;
  }

  await devicePicker.click();
  await page.getByTestId("device-option-pixel-10").click();

  const frame = page.getByTestId("phone-frame");
  const screen = page.getByTestId("device-screen");
  const statusIndicators = page.getByTestId("status-indicators");
  const navigation = page.getByTestId("android-navigation-bar");
  const footer = page.getByTestId("flow-fixed-footer");

  await expect(frame).toHaveAttribute("data-device", "pixel-10");
  await expect(screen).toHaveAttribute("data-device", "pixel-10");
  await expect(page.locator(".phone-bezel")).toHaveAttribute(
    "src",
    "/assets/android/Pixel10.png",
  );
  await expect(statusIndicators).toHaveAttribute("data-platform", "android");
  await expect(statusIndicators).toHaveAttribute(
    "src",
    "/assets/status/status-icons.svg",
  );
  await expect(navigation).toBeVisible();
  await expect(page.getByTestId("home-indicator")).toHaveCount(0);
  await expect(input).toHaveValue("Draft message");
  await page.waitForTimeout(300);

  const layout = await page.evaluate(() => {
    const footerElement = document.querySelector<HTMLElement>(
      '[data-testid="flow-fixed-footer"]',
    )!;
    const navigationElement = document.querySelector<HTMLElement>(
      '[data-testid="android-navigation-bar"]',
    )!;
    const appViewportElement = document.querySelector<HTMLElement>(
      '[data-testid="mobile-app-viewport"]',
    )!;
    return {
      footerBottom: footerElement.getBoundingClientRect().bottom,
      appViewportBottom: appViewportElement.getBoundingClientRect().bottom,
      navigationTop: navigationElement.getBoundingClientRect().top,
      navigationHeight: Number.parseFloat(getComputedStyle(navigationElement).height),
      safeAreaBottom: Number.parseFloat(
        getComputedStyle(document.querySelector<HTMLElement>('[data-testid="device-screen"]')!).getPropertyValue(
          "--device-safe-area-bottom",
        ),
      ),
    };
  });

  expect(layout.safeAreaBottom).toBe(layout.navigationHeight);
  expect(Math.abs(layout.appViewportBottom - layout.navigationTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.footerBottom - layout.navigationTop)).toBeLessThanOrEqual(1);

  await input.click();
  await expect(input).toBeFocused();
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
  await expect(page.getByTestId("mobile-app-viewport")).toHaveAttribute("data-keyboard-visible", "false");
  await expect(navigation).toBeVisible();

  const focusedLayout = await page.evaluate(() => {
    const footerElement = document.querySelector<HTMLElement>('[data-testid="flow-fixed-footer"]')!;
    const navigationElement = document.querySelector<HTMLElement>('[data-testid="android-navigation-bar"]')!;
    const appViewportElement = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;

    return {
      footerBottom: footerElement.getBoundingClientRect().bottom,
      appViewportBottom: appViewportElement.getBoundingClientRect().bottom,
      navigationTop: navigationElement.getBoundingClientRect().top,
    };
  });

  expect(focusedLayout).toEqual({
    footerBottom: layout.footerBottom,
    appViewportBottom: layout.appViewportBottom,
    navigationTop: layout.navigationTop,
  });
});

test("FlowStack pushes and pops screens while dismissing the keyboard", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=flow");
  const input = page.getByLabel("Flow message");
  await input.click();
  await expect(input).toBeFocused();
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);

  await page.getByRole("button", { name: "Push level 2" }).click();
  await expect(page.getByRole("heading", { name: "Screen stacking works" })).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.matches('input, textarea, [contenteditable="true"]') ?? false)).toBe(false);
  const safeHeaderPlacement = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]')!;
    const toolbar = document.querySelector<HTMLElement>(".flow-fixture-header")!;
    return toolbar.getBoundingClientRect().top - screen.getBoundingClientRect().top;
  });
  expect(safeHeaderPlacement).toBeGreaterThanOrEqual(54);

  await page.getByRole("button", { name: "Push level 3" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 3" })).toBeVisible();
  await page.getByRole("button", { name: "Push level 4" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 4" })).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 3" })).toBeVisible();
  await page.getByRole("button", { name: "‹ Back" }).click();
  await expect(page.getByRole("heading", { name: "Screen stacking works" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Flow root" })).toBeVisible();
});
