import { test } from "@playwright/test";

test("all library tactics convert to validated continuous board documents", async () => {
  await import("./board-adapters.test");
});
