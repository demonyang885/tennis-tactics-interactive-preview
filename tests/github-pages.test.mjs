import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { normalizeBasePath, rewriteRootAssetPaths } from "../scripts/prepare-github-pages.mjs";
import { CLOUD_API_META_TAG, setCloudBackendCapability } from "../src/cloud/capability-tag.js";

test("cloud and static HTML packaging give each target the correct API capability", () => {
  const plain = '<html><head><title>RallyPath</title></head><body>画板</body></html>';
  const cloud = setCloudBackendCapability(plain, true);
  assert.equal(cloud.split(CLOUD_API_META_TAG).length - 1, 1);
  assert.equal(setCloudBackendCapability(cloud, true), cloud);
  assert.equal(setCloudBackendCapability(cloud, false), plain);
});

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
  const manifest = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
  assert.equal(version.version, manifest.version);
  assert.equal(version.basePath, normalizeBasePath(version.basePath));
  assert.match(index, new RegExp(`${escapedBasePath}assets/`));
  assert.equal(fallback, index);
  assert.equal(index.includes(CLOUD_API_META_TAG), false);
  assert.equal(fallback.includes(CLOUD_API_META_TAG), false);
  const cloudIndex = await readFile(path.resolve("dist/client/index.html"), "utf8");
  assert.equal(cloudIndex.split(CLOUD_API_META_TAG).length - 1, 1);
});
