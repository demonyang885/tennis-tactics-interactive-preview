import { expect, test } from "@playwright/test";

test("a library tactic uses the shared board court without creating a draft", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const draftBefore=await page.evaluate(()=>localStorage.getItem("tennis-tactics:board-drafts:v1"));

  await page.getByRole("button", { name: "找个打法" }).click();
  await page.getByRole("button", { name: /^发球\+1：先开场，8秒/ }).click();
  await expect(page.getByRole("heading", { name: "发球+1：先开场" })).toBeVisible();
  await expect(page.getByTestId("court-stage")).toHaveAttribute("data-renderer", "core-board");
  await expect(page.getByRole("button", { name: "改成我的打法" })).toBeVisible();
  await expect(page.locator(".phone-stage")).toHaveAttribute("data-board-immersive", "true");

  await page.getByRole("button", { name: "查看战术讲解" }).click();
  await expect(page.getByRole("heading", { name: "什么时候用？" })).toBeVisible();
  await page.getByRole("button", { name: "关闭战术讲解" }).click();
  await page.getByRole("button", { name: "返回上一页" }).click();
  await expect(page.getByRole("heading", { name: "找个打法" })).toBeVisible();
  await expect(page.locator(".phone-stage")).not.toHaveAttribute("data-board-immersive", "true");
  expect(await page.evaluate(()=>localStorage.getItem("tennis-tactics:board-drafts:v1"))).toBe(draftBefore);
});

test("an interactive combination also uses the shared board court", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "找个打法" }).click();
  await page.getByRole("button", { name: /^打开接发稳住再上网互动对打/ }).click();
  await expect(page.getByTestId("court-stage")).toHaveAttribute("data-renderer", "core-board");
  await expect(page.getByRole("button", { name: "重开" })).toBeVisible();
});
