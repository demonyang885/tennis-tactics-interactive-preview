import { defineConfig } from "@playwright/test";

// Pure board-model tests do not need the mobile runtime's development server.
export default defineConfig({
  testDir: ".",
  testMatch: "board-model.spec.ts",
  workers: 1,
});
