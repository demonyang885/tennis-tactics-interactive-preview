import { expect, test, type Page } from "@playwright/test";
import { createStarterBoard, type BoardDocument } from "../src/board/model";

const STORAGE_KEY = "tennis-tactics:board-drafts:v1";

function playableBoard(
  id: string,
  title: string,
  updatedAt: string,
  duration = 1.4,
): BoardDocument {
  const board = createStarterBoard(title);
  const ball = board.actors.find((actor) => actor.kind === "ball");
  if (!ball) throw new Error("starter board is missing its ball");

  const { smartRally: _smartRally, ...manualBoard } = board;
  return {
    ...manualBoard,
    id,
    updatedAt,
    frames: [{
      ...manualBoard.frames[0],
      duration,
      paths: [{
        id: `${id}-serve`,
        kind: "shot",
        actorId: ball.id,
        from: [...manualBoard.frames[0].poses[ball.id]],
        to: [0.28, 0.2],
        control: [0.73, 0.5],
      }],
    }],
  };
}

function emptyBoard(id: string, title: string, updatedAt: string): BoardDocument {
  return {
    ...createStarterBoard(title),
    id,
    updatedAt,
  };
}

async function openHomepage(
  page: Page,
  boards: BoardDocument[] = [],
  reducedMotion: "reduce" | "no-preference" = "no-preference",
) {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(({ key, value }) => {
    window.localStorage.clear();
    if (value) window.localStorage.setItem(key, value);
  }, {
    key: STORAGE_KEY,
    value: boards.length ? JSON.stringify({ version: 1, boards }) : "",
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
}

async function canvasImage(page: Page) {
  return page.getByTestId("home-board-playback").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("home playback target is not a canvas");
    return canvas.toDataURL();
  });
}

async function installControllableIntersectionObserver(page: Page) {
  await page.addInitScript(() => {
    type ControlledObserver = {
      callback: IntersectionObserverCallback;
      targets: Set<Element>;
    };
    const observers: ControlledObserver[] = [];

    class ControllableIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0, 0.2];
      readonly callback: IntersectionObserverCallback;
      readonly targets = new Set<Element>();

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }

      observe(target: Element) {
        this.targets.add(target);
        this.notify(true);
      }

      unobserve(target: Element) {
        this.targets.delete(target);
      }

      disconnect() {
        this.targets.clear();
      }

      takeRecords() {
        return [];
      }

      notify(isIntersecting: boolean) {
        const intersectionRatio = isIntersecting ? 1 : 0;
        const entries = [...this.targets].map((target) => ({
          target,
          isIntersecting,
          intersectionRatio,
          time: performance.now(),
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: isIntersecting ? target.getBoundingClientRect() : new DOMRectReadOnly(),
          rootBounds: null,
        })) as IntersectionObserverEntry[];
        if (entries.length) this.callback(entries, this as unknown as IntersectionObserver);
      }
    }

    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: ControllableIntersectionObserver,
    });
    Object.defineProperty(window, "__setHomeIntersection", {
      configurable: true,
      value: (isIntersecting: boolean) => {
        observers.forEach((observer) => {
          if (observer instanceof ControllableIntersectionObserver) {
            observer.notify(isIntersecting);
          }
        });
      },
    });
  });
}

async function setHomeIntersection(page: Page, isIntersecting: boolean) {
  await page.evaluate((nextIsIntersecting) => {
    const controlledWindow = window as Window & {
      __setHomeIntersection?: (next: boolean) => void;
    };
    if (!controlledWindow.__setHomeIntersection) {
      throw new Error("controllable IntersectionObserver was not installed");
    }
    controlledWindow.__setHomeIntersection(nextIsIntersecting);
  }, isIntersecting);
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

async function expectPureBoardPreview(page: Page) {
  const preview = page.locator(".home-preview-card");
  await expect(preview.locator(".home-preview-heading,.home-board-playback-replay")).toHaveCount(0);
  await expect(preview).not.toContainText(/最后编辑|发球站位|我方|对手|网球|球路|跑位/);
  await expect(page.getByTestId("home-board-playback")).toHaveAttribute("aria-hidden", "true");
}

async function expectBoardEditorTitle(page: Page, title: string) {
  const toolbar = page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByLabel("RallyPath", { exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: `打开${title}的画板菜单`, exact: true })).toBeVisible();
}

test("skips the newest empty draft and animates the newest board with a real path", async ({ page }) => {
  const olderPlayable = playableBoard(
    "older-playable",
    "旧球路",
    "2026-09-13T08:00:00.000Z",
  );
  const newestPlayable = playableBoard(
    "newest-playable",
    "周日发球思路",
    "2026-09-13T09:00:00.000Z",
  );
  const newestEmpty = emptyBoard(
    "newest-empty",
    "刚打开但没画",
    "2026-09-13T10:00:00.000Z",
  );
  await openHomepage(page, [olderPlayable, newestEmpty, newestPlayable]);

  const playback = page.getByTestId("home-board-playback");
  await expect(playback).toBeVisible();
  await expect(playback).toHaveAttribute("data-board-id", newestPlayable.id);
  await expect(page.getByRole("button", { name: `接着画${newestPlayable.title}`, exact: true })).toBeVisible();
  await expectPureBoardPreview(page);
  await expect(page.getByRole("button", { name: `接着画${newestEmpty.title}`, exact: true })).toHaveCount(0);

  await expect.poll(async () => playback.getAttribute("data-playback-state"), {
    message: "the latest usable board should start playing after the hero settles",
  }).toBe("playing");
  const openingFrame = await canvasImage(page);
  await page.waitForTimeout(220);
  const movingFrame = await canvasImage(page);
  expect(movingFrame).not.toBe(openingFrame);

  await expect.poll(async () => playback.getAttribute("data-playback-state"), {
    timeout: 4_000,
    message: "the home preview should play once and hold its ending",
  }).toBe("finished");
  const endingFrame = await canvasImage(page);
  await page.waitForTimeout(220);
  expect(await canvasImage(page)).toBe(endingFrame);
});

test("uses the serve-position first-shot fallback when no saved board has a path", async ({ page }) => {
  const empty = emptyBoard(
    "only-empty",
    "没画完的空画板",
    "2026-09-13T10:00:00.000Z",
  );
  await openHomepage(page, [empty]);

  const playback = page.getByTestId("home-board-playback");
  await expect(playback).toBeVisible();
  await expect(playback).toHaveAttribute("data-playback-state", "idle");
  await expect(page.getByText("画第一拍", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新播放", exact: true })).toHaveCount(0);

  await page.getByTestId("home-board-open").click();
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expectBoardEditorTitle(page, "我的战术板");
  await expect.poll(async () => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBe(
    JSON.stringify({ version: 1, boards: [empty] }),
  );
});

test("opens the exact board shown in the moving preview", async ({ page }) => {
  const board = playableBoard(
    "preview-target",
    "反手位发球线路",
    "2026-09-13T10:00:00.000Z",
  );
  await openHomepage(page, [board]);

  await expect(page.getByTestId("home-board-playback")).toHaveAttribute("data-board-id", board.id);
  await page.getByTestId("home-board-open").click();
  await expect(page.getByTestId("board-canvas")).toBeVisible();
  await expectBoardEditorTitle(page, board.title);
});

test("pauses while softly invisible and resumes from the same point", async ({ page }) => {
  await installControllableIntersectionObserver(page);
  const board = playableBoard(
    "soft-visibility-board",
    "离屏暂停测试",
    "2026-09-13T10:00:00.000Z",
    2.4,
  );
  await openHomepage(page, [board]);

  const playback = page.getByTestId("home-board-playback");
  const openingFrame = await canvasImage(page);
  await expect.poll(async () => playback.getAttribute("data-playback-state")).toBe("playing");
  await page.waitForTimeout(320);
  expect(await canvasImage(page)).not.toBe(openingFrame);

  await setHomeIntersection(page, false);
  await expect.poll(async () => playback.getAttribute("data-playback-state")).toBe("paused");
  const pausedFrame = await canvasImage(page);
  await page.waitForTimeout(320);
  expect(await canvasImage(page)).toBe(pausedFrame);

  const resumeStartedAt = Date.now();
  await setHomeIntersection(page, true);
  await expect.poll(async () => playback.getAttribute("data-playback-state"), {
    timeout: 300,
    intervals: [10, 20, 50],
    message: "returning on screen should resume immediately instead of scheduling a fresh autoplay",
  }).toBe("playing");
  expect(Date.now() - resumeStartedAt).toBeLessThan(350);
  expect(await canvasImage(page)).not.toBe(openingFrame);
  await page.waitForTimeout(180);
  expect(await canvasImage(page)).not.toBe(pausedFrame);
});

test("leaving the flow hard-resets the preview before it replays on return", async ({ page }) => {
  await installControllableIntersectionObserver(page);
  const board = playableBoard(
    "flow-reset-board",
    "流程重置测试",
    "2026-09-13T10:00:00.000Z",
    2.4,
  );
  await openHomepage(page, [board]);

  const playback = page.getByTestId("home-board-playback");
  const openingFrame = await canvasImage(page);
  await expect.poll(async () => playback.getAttribute("data-playback-state")).toBe("playing");
  await page.waitForTimeout(320);
  expect(await canvasImage(page)).not.toBe(openingFrame);

  await page.getByTestId("home-board-open").click();
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
  await expect.poll(async () => playback.getAttribute("data-playback-state")).toBe("idle");

  await page.getByTestId("flow-current").getByRole("toolbar", { name: "战术板操作", exact: true }).getByRole("button", { name: "返回上一页", exact: true }).click();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？", exact: true })).toBeVisible();
  expect(await canvasImage(page)).toBe(openingFrame);
  await expect.poll(async () => playback.getAttribute("data-playback-state"), {
    message: "returning to the home flow should start a fresh one-shot preview",
  }).toBe("playing");
});

test("compresses an overlong board into at most ten seconds of home playback", async ({ page }) => {
  const board = playableBoard(
    "overlong-board",
    "超长球路测试",
    "2026-09-13T10:00:00.000Z",
    45,
  );
  await openHomepage(page, [board]);

  const playback = page.getByTestId("home-board-playback");
  await expect.poll(async () => playback.getAttribute("data-playback-state")).toBe("playing");
  const startedAt = Date.now();
  await expect.poll(async () => playback.getAttribute("data-playback-state"), {
    timeout: 10_800,
    intervals: [100, 250],
    message: "a 45-second board should finish its condensed home preview within ten seconds",
  }).toBe("finished");
  expect(Date.now() - startedAt).toBeLessThanOrEqual(10_500);
});

test("suppresses reduced-motion autoplay without adding another homepage button", async ({ page }) => {
  const board = playableBoard(
    "reduced-motion-board",
    "减少动态测试",
    "2026-09-13T10:00:00.000Z",
  );
  await openHomepage(page, [board], "reduce");

  const playback = page.getByTestId("home-board-playback");
  await expect(playback).toHaveAttribute("data-playback-state", "finished");
  const firstFrame = await canvasImage(page);
  await page.waitForTimeout(450);
  expect(await canvasImage(page)).toBe(firstFrame);
  await expect(page.getByRole("button", { name: "重新播放", exact: true })).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  test(`keeps the upright board and compact actions at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const board = playableBoard(
      `responsive-${viewport.width}`,
      "窄屏线路",
      "2026-09-13T10:00:00.000Z",
    );
    await openHomepage(page, [board], "reduce");
    await expectNoHorizontalOverflow(page);

    const stageBox = await page.locator(".home-board-playback-stage").boundingBox();
    expect(stageBox).not.toBeNull();
    expect(stageBox!.height).toBeGreaterThan(stageBox!.width);
    expect(stageBox!.width / viewport.width).toBeGreaterThan(0.88);
    expect(stageBox!.height / viewport.height).toBeGreaterThan(0.55);
    await expectPureBoardPreview(page);
    await expect(page.getByRole("button", { name: "想下一分", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "记下刚才一分", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "找个打法", exact: true })).toHaveCount(1);
  });
}
