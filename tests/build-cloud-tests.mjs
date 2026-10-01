#!/usr/bin/env node
import { build } from "esbuild";

await build({
  entryPoints: ["server/index.js", "server/library.js", "src/board/model.ts", "src/cloud/snapshot.ts"],
  outdir: "output/cloudtests",
  outbase: ".",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
});
