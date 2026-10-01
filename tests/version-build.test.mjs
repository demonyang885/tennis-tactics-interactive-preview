import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { prepareGitHubPages } from "../scripts/prepare-github-pages.mjs";

const execFileAsync = promisify(execFile);
const sourceDirectory = path.resolve("dist/client");

function embeddedVersion(index) {
  const matches = [...index.matchAll(/<script id="rallypath-version" type="application\/json">([^<]*)<\/script>/g)];
  assert.equal(matches.length, 1, "entry point contains one inert metadata record");
  return JSON.parse(matches[0][1]);
}

test("static build exposes one package version and source commit to the UI and metadata endpoint", async () => {
  const metadata = JSON.parse(await readFile(path.join(sourceDirectory, "version.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.resolve("package-lock.json"), "utf8"));
  const expectedCommit = process.env.GITHUB_SHA || (await execFileAsync("git", ["rev-parse", "HEAD"])).stdout.trim();
  assert.equal(metadata.product, "RallyPath");
  assert.equal(metadata.version, manifest.version);
  assert.equal(metadata.version, lock.version);
  assert.equal(metadata.version, lock.packages[""].version);
  assert.equal(metadata.commit, expectedCommit);
  assert.equal(new Date(metadata.builtAt).toISOString(), metadata.builtAt);
  assert.deepEqual(embeddedVersion(await readFile(path.join(sourceDirectory, "index.html"), "utf8")), metadata);
});

test("Pages packaging preserves the original build record in its UI and version endpoint", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rallypath-version-"));
  try {
    const source = JSON.parse(await readFile(path.join(sourceDirectory, "version.json"), "utf8"));
    const outputDirectory = path.join(directory, "pages");
    await prepareGitHubPages({ sourceDirectory, outputDirectory, basePath: "/rallypath-test/" });
    const deployed = JSON.parse(await readFile(path.join(outputDirectory, "version.json"), "utf8"));
    assert.deepEqual(deployed, { ...source, basePath: "/rallypath-test/" });
    assert.deepEqual(embeddedVersion(await readFile(path.join(outputDirectory, "index.html"), "utf8")), source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
