import { expect, test } from "@playwright/test";
import { categories, combinations, tactics } from "../src/content/library";
import { getTacticThumbnailPlan } from "../src/content/thumbnail";

test("the tactical library offers clear categories without cluttering its route previews", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const before = await page.evaluate(() => localStorage.getItem("tennis-tactics:board-drafts:v1"));
  await expect(page.getByRole("button", { name: "找个打法", exact: true }).locator("svg")).toHaveCount(0);

  await page.getByRole("button", { name: "找个打法", exact: true }).click();
  await expect(page.getByRole("heading", { name: "找个打法", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "跳转到打法分类" })).toHaveCount(0);
  await page.getByRole("button", { name: "跳到打法段落" }).click();
  const shortcuts = page.getByRole("navigation", { name: "跳转到打法分类" });
  await expect(shortcuts).toBeVisible();
  for (const category of categories.filter(item => item !== "全部")) await expect(shortcuts.getByRole("button", { name: category, exact: true })).toBeVisible();
  await expect(shortcuts.getByRole("button", { name: "顶部", exact: true })).toBeVisible();
  await expect(page.getByRole("main", { name: "打法总览" }).getByRole("button")).toHaveCount(tactics.length + combinations.length);
  await expect(page.locator(".tactic-card h3").first()).toHaveText("接发深回中路");
  await expect(page.locator(".tactic-card h3").nth(1)).toHaveText("防守高深回中");
  await expect(page.getByRole("region", { name: "拉开空档" }).getByRole("heading", { name: "打回头球" })).toBeVisible();
  await expect(page.getByRole("region", { name: "改变节奏" }).getByRole("heading", { name: "小球+挑高" })).toBeVisible();
  await expect(page.getByTestId("tactic-thumbnail").first()).toBeVisible();
  await expect(page.locator(".tactic-card .card-meta, .tactic-card .card-series")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("tennis-tactics:board-drafts:v1"))).toBe(before);
  await shortcuts.getByRole("button", { name: "拉开空档", exact: true }).click();
  await expect(shortcuts).toHaveCount(0);
  const matching=tactics.filter(tactic=>(tactic.category??"先稳住")==="拉开空档").length+combinations.filter(item=>item.category==="拉开空档").length;
  await expect(page.getByRole("region", { name: "拉开空档" }).getByRole("button")).toHaveCount(matching);
  await expect(page.getByRole("region", { name: "拉开空档" })).toBeInViewport({ ratio: .1 });
  await expect(page.getByRole("main", { name: "打法总览" }).getByRole("button")).toHaveCount(tactics.length + combinations.length);
  expect(await page.evaluate(() => localStorage.getItem("tennis-tactics:board-drafts:v1"))).toBe(before);
});

test("tactic thumbnails choose the actual decisive shots, not a generic tennis image", () => {
  const byId = (id: string) => {
    const tactic = tactics.find(item => item.id === id);
    expect(tactic).toBeDefined();
    return getTacticThumbnailPlan(tactic!);
  };
  const returnMiddle = byId("return-middle");
  expect(returnMiddle.shots).toHaveLength(1);
  expect(returnMiddle.shots[0].to[0]).toBeCloseTo(.5);
  expect(returnMiddle.shots[0].to[1]).toBeLessThan(.15);

  const wrongFoot = byId("wrong-foot");
  expect(wrongFoot.shots).toHaveLength(1);
  expect(wrongFoot.shots[0].to[0]).toBeLessThan(.25);
  expect(wrongFoot.opponentMove?.to[0]).toBeGreaterThan(wrongFoot.opponentMove!.from[0]);

  const dropLob = byId("drop-lob");
  expect(dropLob.shots).toHaveLength(2);
  expect(dropLob.shots[0].to[1]).toBeGreaterThan(.35);
  expect(dropLob.shots[1].to[1]).toBeLessThan(.15);
});

test("category shortcuts jump within one compact vertical catalogue without filtering or row chevrons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "找个打法", exact: true }).click();
  const catalogue = page.getByRole("main", { name: "打法总览" });
  await page.getByRole("button", { name: "跳到打法段落" }).click();
  const shortcuts = page.getByRole("navigation", { name: "跳转到打法分类" });
  await expect(catalogue.getByRole("button")).toHaveCount(tactics.length + combinations.length);
  await expect(page.locator(".tactic-card .card-arrow")).toHaveCount(0);
  await shortcuts.getByRole("button", { name: "拉开空档", exact: true }).click();
  await expect(catalogue.getByRole("button")).toHaveCount(tactics.length + combinations.length);
  const section = page.getByRole("region", { name: "拉开空档" });
  await expect(section).toBeInViewport({ ratio: .1 });
  await expect(shortcuts).toHaveCount(0);
  await section.getByRole("button").first().click();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await expect(section).toBeInViewport({ ratio: .1 });
  await expect(catalogue.getByRole("button")).toHaveCount(tactics.length + combinations.length);
});

test("tapping outside the section index only dismisses it, without opening the tactic underneath", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "找个打法", exact: true }).click();
  await page.getByRole("button", { name: "跳到打法段落" }).click();
  await expect(page.getByRole("navigation", { name: "跳转到打法分类" })).toBeVisible();
  const first = await page.locator(".tactic-card").first().boundingBox();
  expect(first).not.toBeNull();
  await page.mouse.click(first!.x + first!.width / 2, first!.y + first!.height / 2);
  await expect(page.getByRole("navigation", { name: "跳转到打法分类" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "找个打法", exact: true })).toBeVisible();
});

test("all tactic sections remain reachable and opening a tactic returns to the same scroll position", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "找个打法", exact: true }).click();
  const indexButton=page.getByRole("button", { name: "跳到打法段落" });
  for(const category of categories.filter(item=>item!=="全部")){
    await indexButton.click();
    await page.getByRole("navigation", { name: "跳转到打法分类" }).getByRole("button", { name: category, exact: true }).click();
    const matching=tactics.filter(tactic=>(tactic.category??"先稳住")===category).length+combinations.filter(item=>item.category===category).length;
    await expect(page.getByRole("region", { name: category }).getByRole("button")).toHaveCount(matching);
    await expect(page.getByRole("region", { name: category })).toBeInViewport({ ratio: .1 });
  }
  await indexButton.click();
  await page.getByRole("navigation", { name: "跳转到打法分类" }).getByRole("button", { name: "先稳住", exact: true }).click();
  await page.getByRole("region", { name: "先稳住" }).getByRole("button").first().click();
  await expect(page.getByRole("button", { name: "返回上一页", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回上一页", exact: true }).click();
  await expect(page.getByRole("region", { name: "先稳住" })).toBeInViewport({ ratio: .1 });
  await page.getByRole("button", { name: "关闭打法列表", exact: true }).click();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？" })).toBeVisible();
});

test("the categorized list stays tappable without horizontal overflow on a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "找个打法", exact: true }).click();
  await expect.poll(() => page.getByTestId("flow-current").evaluate(element => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))).toBeLessThan(1);
  const first = page.locator(".tactic-card").first();
  await expect(first).toBeVisible();
  const box = await first.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "跳到打法段落" }).click();
  await page.getByRole("navigation", { name: "跳转到打法分类" }).getByRole("button", { name: "先稳住", exact: true }).click();
  await expect(page.getByRole("region", { name: "先稳住" })).toBeInViewport({ ratio: .1 });
  await page.getByRole("button", { name: "关闭打法列表" }).click();
  await expect(page.getByRole("heading", { name: "下一分，怎么打？" })).toBeVisible();
});

test("iPad touch keeps the list and close action reachable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const entry = page.getByRole("button", { name: "找个打法", exact: true });
    await entry.scrollIntoViewIfNeeded();
    await expect(entry).toBeInViewport();
    await entry.tap();
    await expect(page.getByRole("heading", { name: "找个打法", exact: true })).toBeVisible();
    await expect(page.locator(".tactic-card").first()).toBeVisible();
    await page.getByRole("button", { name: "跳到打法段落" }).tap();
    await page.getByRole("navigation", { name: "跳转到打法分类" }).getByRole("button", { name: "改变节奏", exact: true }).tap();
    const matching=tactics.filter(tactic=>(tactic.category??"先稳住")==="改变节奏").length+combinations.filter(item=>item.category==="改变节奏").length;
    await expect(page.getByRole("region", { name: "改变节奏" }).getByRole("button")).toHaveCount(matching);
    await expect(page.getByRole("region", { name: "改变节奏" })).toBeInViewport({ ratio: .1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
    await page.getByRole("button", { name: "关闭打法列表" }).tap();
    await expect(page.getByRole("heading", { name: "下一分，怎么打？" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("iPad landscape keeps one readable vertical tactic column without stretching rows edge to edge", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const entry = page.getByRole("button", { name: "找个打法", exact: true });
    await entry.scrollIntoViewIfNeeded();
    await entry.tap();
    await expect(page.getByRole("main", { name: "打法总览" }).getByRole("button")).toHaveCount(tactics.length + combinations.length);
    await expect.poll(() => page.locator(".tactics-grid").evaluate(element => {
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.x - (window.innerWidth - rect.width) / 2);
    })).toBeLessThan(2);
    const measure = () => page.evaluate(() => {
      const app = document.querySelector(".device-screen")!.getBoundingClientRect();
      const header = document.querySelector(".knowledge-header")!.getBoundingClientRect();
      const list = document.querySelector(".tactics-grid")!.getBoundingClientRect();
      const first = document.querySelector(".tactic-card")!.getBoundingClientRect();
      return { app: { x: app.x, width: app.width }, header: { x: header.x, width: header.width }, list: { x: list.x, width: list.width }, first: { x: first.x, width: first.width }, overflow: document.documentElement.scrollWidth };
    });
    const landscape = await measure();
    expect(landscape.app.width).toBeGreaterThan(1000);
    expect(landscape.list.width).toBeGreaterThan(600);
    expect(landscape.list.width).toBeLessThanOrEqual(640);
    expect(Math.abs(landscape.list.x - (1024 - landscape.list.width) / 2)).toBeLessThan(2);
    expect(Math.abs(landscape.header.x - landscape.list.x)).toBeLessThan(2);
    expect(landscape.first.x).toBeGreaterThanOrEqual(landscape.list.x);
    expect(landscape.first.x + landscape.first.width).toBeLessThanOrEqual(landscape.list.x + landscape.list.width);
    expect(landscape.overflow).toBeLessThanOrEqual(1024);

    await page.getByRole("button", { name: "跳到打法段落" }).tap();
    await page.getByRole("navigation", { name: "跳转到打法分类" }).getByRole("button", { name: "拉开空档", exact: true }).tap();
    await expect(page.getByRole("region", { name: "拉开空档" })).toBeInViewport({ ratio: .1 });
    await page.setViewportSize({ width: 768, height: 1024 });
    const portrait = await measure();
    expect(portrait.app.width).toBeGreaterThan(760);
    expect(portrait.list.width).toBeLessThanOrEqual(640);
    expect(Math.abs(portrait.list.x - (768 - portrait.list.width) / 2)).toBeLessThan(2);
    await page.getByRole("button", { name: "关闭打法列表" }).tap();
    await expect(page.getByRole("heading", { name: "下一分，怎么打？" })).toBeVisible();
  } finally {
    await context.close();
  }
});
