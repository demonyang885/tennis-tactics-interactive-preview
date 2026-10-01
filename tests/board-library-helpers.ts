import { expect, type Page } from "@playwright/test";

export async function confirmBoardDeletion(page: Page) {
  const confirmation = page.getByRole("dialog", { name: "删除画板？", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(confirmation).toBeHidden();
}
