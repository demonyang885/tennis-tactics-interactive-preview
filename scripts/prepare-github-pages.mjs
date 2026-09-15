import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..");

export function normalizeBasePath(value = "/tennis-tactics-interactive-preview/") {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

export function rewriteRootAssetPaths(source, basePath) {
  if (basePath === "/") return source;
  return source.replace(/(^|[("'`=:\s])\/assets\//gm, `$1${basePath}assets/`);
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory)) {
    const fullPath = path.join(directory, entry);
    if ((await stat(fullPath)).isDirectory()) result.push(...await filesUnder(fullPath));
    else result.push(fullPath);
  }
  return result;
}

export async function prepareGitHubPages({
  basePath = normalizeBasePath(process.env.PAGES_BASE_PATH),
  sourceDirectory = path.join(projectRoot, "dist", "client"),
  outputDirectory = path.join(projectRoot, "dist", "github-pages"),
} = {}) {
  const packageMetadata = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const indexPath = path.join(sourceDirectory, "index.html");
  await stat(indexPath);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(path.dirname(outputDirectory), { recursive: true });
  await cp(sourceDirectory, outputDirectory, { recursive: true });

  const textExtensions = new Set([".html", ".js", ".css", ".json", ".svg", ".xml", ".txt"]);
  const files = await filesUnder(outputDirectory);
  let replacements = 0;
  for (const file of files) {
    if (!textExtensions.has(path.extname(file))) continue;
    const before = await readFile(file, "utf8");
    const after = rewriteRootAssetPaths(before, basePath);
    if (after !== before) {
      replacements += 1;
      await writeFile(file, after);
    }
  }

  const deployedIndex = await readFile(path.join(outputDirectory, "index.html"), "utf8");
  await writeFile(path.join(outputDirectory, "404.html"), deployedIndex);
  await writeFile(path.join(outputDirectory, ".nojekyll"), "");
  await writeFile(path.join(outputDirectory, "version.json"), `${JSON.stringify({
    product: "RallyPath",
    version: packageMetadata.version,
    commit: process.env.GITHUB_SHA || "local",
    builtAt: new Date().toISOString(),
    basePath,
  }, null, 2)}\n`);

  const finalFiles = await filesUnder(outputDirectory);
  const rootAssetPattern = /(^|[("'`=:\s])\/assets\//m;
  for (const file of finalFiles) {
    if (!textExtensions.has(path.extname(file))) continue;
    const content = await readFile(file, "utf8");
    if (basePath !== "/" && rootAssetPattern.test(content)) {
      throw new Error(`Unrewritten root asset path in ${path.relative(outputDirectory, file)}`);
    }
  }

  const assetPrefix = `${basePath}assets/`;
  const escapedPrefix = assetPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assetPattern = new RegExp(`${escapedPrefix}[A-Za-z0-9@._%/-]+`, "g");
  for (const file of finalFiles) {
    if (!textExtensions.has(path.extname(file))) continue;
    const content = await readFile(file, "utf8");
    for (const reference of content.match(assetPattern) || []) {
      const relativeAsset = reference.slice(basePath.length).split(/[?#]/)[0];
      await stat(path.join(outputDirectory, relativeAsset));
    }
  }

  return { basePath, outputDirectory, replacements, fileCount: finalFiles.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  const result = await prepareGitHubPages();
  console.log(`Prepared GitHub Pages at ${result.basePath} (${result.fileCount} files, ${result.replacements} rewritten files).`);
}
