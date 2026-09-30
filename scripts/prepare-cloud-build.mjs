#!/usr/bin/env node
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const relative of ["dist/client/index.html", "dist/.openai/hosting.json", "server/index.js", "drizzle"]) {
  if (!existsSync(path.join(root, relative))) throw new Error("Missing cloud build input: " + relative);
}
await build({
  absWorkingDir: root,
  entryPoints: ["server/index.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  logLevel: "warning",
});
cpSync(path.join(root, "drizzle"), path.join(root, "dist", "drizzle"), { recursive: true });
console.log("Prepared account and cloud-library Worker: dist/server/index.js");
