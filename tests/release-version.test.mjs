import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { checkReleaseVersion } from "../scripts/check-release-version.mjs";

const execFileAsync = promisify(execFile);

async function writeRelease(rootDirectory, version, { lockVersion = version, changelogVersion = version } = {}) {
  await writeFile(path.join(rootDirectory, "package.json"), JSON.stringify({ name: "rallypath", version }));
  await writeFile(path.join(rootDirectory, "package-lock.json"), JSON.stringify({ version: lockVersion, packages: { "": { version: lockVersion } } }));
  await writeFile(path.join(rootDirectory, "CHANGELOG.md"), `# Changelog\n\n## [${changelogVersion}] - 2026-10-01\n\n- Release changes.\n`);
}

async function releaseFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rallypath-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeRelease(directory, "0.3.1");
  return directory;
}

test("preflight requires a stable version increase from the explicitly supplied source commit", async (t) => {
  const rootDirectory = await releaseFixture(t);
  await writeRelease(rootDirectory, "0.3.0");
  await execFileAsync("git", ["init", "--quiet"], { cwd: rootDirectory });
  await execFileAsync("git", ["add", "package.json"], { cwd: rootDirectory });
  await execFileAsync("git", ["-c", "user.name=Release fixture", "-c", "user.email=release@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Baseline"], { cwd: rootDirectory });
  const baseRef = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: rootDirectory })).stdout.trim();

  await writeRelease(rootDirectory, "0.3.1");
  assert.equal((await checkReleaseVersion({ rootDirectory, baseRef })).version, "0.3.1");
  for (const version of ["0.3.0", "0.2.9"]) {
    await writeRelease(rootDirectory, version);
    await assert.rejects(checkReleaseVersion({ rootDirectory, baseRef }), /must be greater than source baseline version 0\.3\.0/);
  }
  await writeRelease(rootDirectory, "0.3.1-rc.1");
  await assert.rejects(checkReleaseVersion({ rootDirectory, baseRef }), /stable major\.minor\.patch version/);
});

test("local build preflight requires package, lockfile, and current changelog versions to agree", async (t) => {
  const rootDirectory = await releaseFixture(t);
  assert.equal((await checkReleaseVersion({ rootDirectory })).version, "0.3.1");
  await writeRelease(rootDirectory, "0.3.1", { lockVersion: "0.3.0" });
  await assert.rejects(checkReleaseVersion({ rootDirectory }), /package-lock\.json root versions must match/);
  await writeRelease(rootDirectory, "0.3.1", { changelogVersion: "0.3.0" });
  await assert.rejects(checkReleaseVersion({ rootDirectory }), /CHANGELOG\.md must contain a release heading for \[0\.3\.1\]/);
});

test("public deployment preflight rejects an unchanged or older version and fails when it cannot verify the endpoint", async (t) => {
  const rootDirectory = await releaseFixture(t);
  let status = 200;
  let deployed = { product: "RallyPath", version: "0.3.0" };
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(deployed));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const deployedUrl = `http://127.0.0.1:${server.address().port}/version.json`;

  assert.equal((await checkReleaseVersion({ rootDirectory, deployedUrl })).version, "0.3.1");
  for (const version of ["0.3.1", "0.3.2"]) {
    deployed = { product: "RallyPath", version };
    await assert.rejects(checkReleaseVersion({ rootDirectory, deployedUrl }), /must be greater than deployed version\.json version/);
  }
  status = 503;
  await assert.rejects(checkReleaseVersion({ rootDirectory, deployedUrl }), /Could not verify the deployed version.*HTTP 503/);
  status = 200;
  deployed = { product: "RallyPath", version: "unknown" };
  await assert.rejects(checkReleaseVersion({ rootDirectory, deployedUrl }), /Could not verify the deployed version.*stable major\.minor\.patch/);
});
