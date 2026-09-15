import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { normalizeBasePath, rewriteRootAssetPaths } from "../scripts/prepare-github-pages.mjs";

test("normalizes project and root Pages paths", () => {
  assert.equal(normalizeBasePath(), "/tennis-tactics-interactive-preview/");
  assert.equal(normalizeBasePath("tennis-tactics"), "/tennis-tactics/");
  assert.equal(normalizeBasePath("/tennis-tactics/"), "/tennis-tactics/");
  assert.equal(normalizeBasePath("/"), "/");
});

test("rewrites only root asset references", () => {
  const source = 'src="/assets/app.js";const a="/assets/phone.svg";const b="/tennis-tactics/assets/ready.svg"';
  const rewritten = rewriteRootAssetPaths(source, "/tennis-tactics/");
  assert.match(rewritten, /src="\/tennis-tactics\/assets\/app\.js"/);
  assert.match(rewritten, /"\/tennis-tactics\/assets\/phone\.svg"/);
  assert.equal((rewritten.match(/\/tennis-tactics\/assets\//g) || []).length, 3);
});

test("prepared artifact contains the deployed entry points", async () => {
  const output = path.resolve("dist/github-pages");
  const index = await readFile(path.join(output, "index.html"), "utf8");
  const fallback = await readFile(path.join(output, "404.html"), "utf8");
  const version = JSON.parse(await readFile(path.join(output, "version.json"), "utf8"));
  const escapedBasePath = version.basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await stat(path.join(output, ".nojekyll"));
  assert.equal(version.product, "RallyPath");
  assert.equal(version.version, "0.1.0");
  assert.equal(version.basePath, normalizeBasePath(version.basePath));
  assert.match(index, new RegExp(`${escapedBasePath}assets/`));
  assert.equal(fallback, index);
});
