#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");
const execFileAsync = promisify(execFile);

export const VERSION_METADATA_ID = "rallypath-version";

export async function prepareVersion({
  sourceDirectory = path.join(projectRoot, "dist", "client"),
} = {}) {
  const packageMetadata = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const commit = process.env.GITHUB_SHA || (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot })).stdout.trim();
  if (!/^[a-f0-9]{40,64}$/i.test(commit)) throw new Error("Build version requires a full source commit SHA.");

  const metadata = {
    product: "RallyPath",
    version: packageMetadata.version,
    commit,
    builtAt: new Date().toISOString(),
  };
  const indexPath = path.join(sourceDirectory, "index.html");
  const index = await readFile(indexPath, "utf8");
  const withoutPreviousMetadata = index.replace(/\s*<script id="rallypath-version" type="application\/json">[\s\S]*?<\/script>/g, "");
  // Escaping HTML-sensitive characters keeps JSON inert inside the script element.
  const embeddedMetadata = JSON.stringify(metadata).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (!withoutPreviousMetadata.includes("</head>")) throw new Error("Build entry point is missing its closing head tag.");
  await writeFile(indexPath, withoutPreviousMetadata.replace("</head>", `  <script id="${VERSION_METADATA_ID}" type="application/json">${embeddedMetadata}</script>\n</head>`));
  await writeFile(path.join(sourceDirectory, "version.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  const metadata = await prepareVersion();
  console.log(`Prepared RallyPath v${metadata.version} (${metadata.commit.slice(0, 7)}).`);
}
