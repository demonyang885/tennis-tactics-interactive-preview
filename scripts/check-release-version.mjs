#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const execFileAsync = promisify(execFile);

function stableVersion(value, source) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${source} must contain a stable major.minor.patch version.`);
  }
  return value.split(".").map(BigInt);
}

function requireIncrease(current, previous, source) {
  const next = stableVersion(current, "package.json");
  const before = stableVersion(previous, source);
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] > before[index]) return;
    if (next[index] < before[index]) break;
  }
  throw new Error(`Release version ${current} must be greater than ${source} version ${previous}. Bump package.json and package-lock.json and add its CHANGELOG.md entry before deploying.`);
}

export async function checkReleaseVersion({
  rootDirectory = projectRoot,
  baseRef,
  deployedUrl,
} = {}) {
  const manifest = JSON.parse(await readFile(path.join(rootDirectory, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(rootDirectory, "package-lock.json"), "utf8"));
  stableVersion(manifest.version, "package.json");
  if (lock.version !== manifest.version || lock.packages?.[""]?.version !== manifest.version) {
    throw new Error("package-lock.json root versions must match package.json before release.");
  }
  const changelog = await readFile(path.join(rootDirectory, "CHANGELOG.md"), "utf8");
  const escapedVersion = manifest.version.replace(/\./g, "\\.");
  if (!new RegExp(`^## \\[${escapedVersion}\\](?:[ \\t]+-[ \\t]+\\d{4}-\\d{2}-\\d{2})?[ \\t]*$`, "m").test(changelog)) {
    throw new Error(`CHANGELOG.md must contain a release heading for [${manifest.version}].`);
  }

  const baselines = [];
  if (baseRef) {
    let previous;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`], { cwd: rootDirectory });
      const baseline = await execFileAsync("git", ["show", `${stdout.trim()}:package.json`], { cwd: rootDirectory });
      previous = JSON.parse(baseline.stdout).version;
    } catch (error) {
      throw new Error(`Could not read release baseline ${baseRef}. Fetch that commit before running the release preflight. ${error.message}`);
    }
    requireIncrease(manifest.version, previous, "source baseline");
    baselines.push(`source ${previous}`);
  }

  if (deployedUrl) {
    let deployed;
    try {
      const response = await fetch(deployedUrl, {
        headers: { accept: "application/json", "cache-control": "no-cache" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      deployed = await response.json();
      if (deployed?.product !== "RallyPath") throw new Error("endpoint is not a RallyPath version record");
      stableVersion(deployed.version, "deployed version.json");
    } catch (error) {
      throw new Error(`Could not verify the deployed version at ${deployedUrl}: ${error.message}. Restore access to the official version.json endpoint before deploying.`);
    }
    requireIncrease(manifest.version, deployed.version, "deployed version.json");
    baselines.push(`deployed ${deployed.version}`);
  }
  return { version: manifest.version, baselines };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  try {
    const options = {};
    const argumentsToParse = process.argv.slice(2);
    for (let index = 0; index < argumentsToParse.length; index += 1) {
      const flag = argumentsToParse[index];
      if (flag !== "--base-ref" && flag !== "--deployed-url") throw new Error(`Unknown release preflight argument: ${flag}`);
      const value = argumentsToParse[++index];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
      options[flag === "--base-ref" ? "baseRef" : "deployedUrl"] = value;
    }
    const result = await checkReleaseVersion(options);
    console.log(`Release preflight passed: RallyPath v${result.version}${result.baselines.length ? ` (${result.baselines.join(", ")})` : ""}.`);
  } catch (error) {
    console.error(`Release preflight failed: ${error.message}`);
    process.exitCode = 1;
  }
}
