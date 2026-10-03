import { expect, type Locator, type Page } from "@playwright/test";

async function activate(locator: Locator, page: Page) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap();
  else await locator.click();
}

/** Current product starts in the latest board; no landing-screen click. */
export async function waitForWorkspace(page: Page) {
  await expect(page.getByTestId("flow-current")).toHaveCount(1);
  await expect(page.getByTestId("flow-current").getByTestId("board-canvas")).toBeVisible();
}

export async function expandBoardTools(page: Page) {
  const trigger = page.getByTestId("flow-current").locator("[data-dock-expand]");
  await expect(trigger).toBeVisible();
  if (await trigger.getAttribute("aria-expanded") !== "true") await activate(trigger, page);
}

export async function openBoardSettings(page: Page) {
  await expandBoardTools(page);
  await activate(page.getByTestId("flow-current").getByRole("button", { name: /^打开.*的画板菜单$/ }), page);
  await expect(page.getByRole("dialog", { name: "画板菜单", exact: true })).toBeVisible();
}

export async function openWorkspaceLibrary(page: Page) {
  const current = page.getByTestId("flow-current");
  const recover = current.getByRole("button", { name: "打开画板库", exact: true });
  if (await recover.isVisible()) await activate(recover, page);
  else await activate(current.getByRole("button", { name: "我的画板", exact: true }), page);
  await expect(page.getByTestId("flow-current").locator(".board-library")).toBeVisible();
}

export async function reopenWorkspaceBoard(page: Page, title: string) {
  await openWorkspaceLibrary(page);
  await activate(page.getByTestId("flow-current").locator(".board-draft-open").filter({ hasText: title }), page);
  await waitForWorkspace(page);
}

export async function openTacticCatalogue(page: Page) {
  await waitForWorkspace(page);
  await activate(page.getByRole("navigation", { name: "主要页面", exact: true }).getByRole("button", { name: "找打法", exact: true }), page);
  await activate(page.getByRole("dialog", { name: "找打法", exact: true }).getByRole("button", { name: "浏览战术库", exact: true }), page);
  await expect(page.getByRole("main", { name: "打法总览", exact: true })).toBeVisible();
}
