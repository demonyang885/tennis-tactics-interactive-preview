import { defineConfig } from "@playwright/test";

// The synchronization model runs against injected storage and an in-memory API.
export default defineConfig({
  testDir: ".",
  testMatch: "cloud-sync-core.spec.ts",
  workers: 1,
});
