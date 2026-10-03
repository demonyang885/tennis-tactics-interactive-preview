import { waitForWorkspace, openBoardSettings } from "./workspace-navigation";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const packageMetadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("The fixed board header and its explanation visibly identify the release without metadata requests in development", async ({ page }) => {
  const requestedMetadata: string[] = [];
  page.on("request", request => {
    if (request.url().includes("version.json")) requestedMetadata.push(request.url());
  });
  await page.goto("/");
  await waitForWorkspace(page);
  await expect(page.getByTestId("flow-current").locator(".home-version-badge")).toBeVisible();
  await expect(page.getByTestId("flow-current").locator(".home-version-badge")).toHaveText(`v${packageMetadata.version}`);
  await waitForWorkspace(page);
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: "版本与说明", exact: true }).click();
  await expect(page.getByTestId("bottom-sheet").locator(".about-version")).toBeVisible();
  await expect(page.getByTestId("bottom-sheet").locator(".about-version")).toHaveText(`v${packageMetadata.version}`);
  expect(requestedMetadata).toEqual([]);
});

test("a deployed build record supplies the visible version and identifiable source commit", async ({ page }) => {
  const metadata = {
    product: "RallyPath",
    version: packageMetadata.version,
    commit: "1234567890abcdef1234567890abcdef12345678",
    builtAt: "2026-10-01T07:00:00.000Z",
  };
  await page.route("**/", async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace("</head>", `<script id="rallypath-version" type="application/json">${JSON.stringify(metadata)}</script></head>`);
    await route.fulfill({ response, body: html });
  });
  await page.goto("/");
  await waitForWorkspace(page);
  await expect(page.getByTestId("flow-current").locator(".home-version-badge")).toBeVisible();
  await expect(page.getByTestId("flow-current").locator(".home-version-badge")).toHaveText(`v${metadata.version}`);
  await waitForWorkspace(page);
  await openBoardSettings(page);
  await page.getByRole("dialog", { name: "画板菜单", exact: true }).getByRole("button", { name: "版本与说明", exact: true }).click();
  const explanation = page.getByTestId("bottom-sheet").locator(".about-version");
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText(`v${metadata.version}`);
  await expect(explanation.getByLabel(`构建提交 ${metadata.commit}`, { exact: true })).toHaveText(metadata.commit.slice(0, 7));
});
