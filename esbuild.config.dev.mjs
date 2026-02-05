import { build } from "esbuild";
import { mkdir, copyFile, rm } from "fs/promises";
import { resolve, dirname } from "path";

const targets = new Set(["chrome", "firefox"]);
const arg = process.argv[2] ?? "all";
const buildTargets = arg === "all" ? Array.from(targets) : [arg];

const entryPoints = {
  background: "src/background.ts",
  "content-script": "src/content-script.ts",
  "page-script": "src/page-script.ts",
  popup: "src/popup/popup.ts"
};

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function copyStatic(targetDir, manifestFile) {
  await copyFile(manifestFile, resolve(targetDir, "manifest.json"));
  await copyFile("src/popup/popup.html", resolve(targetDir, "popup.html"));
  await copyFile("src/popup/popup.css", resolve(targetDir, "popup.css"));
  await copyFile("src/views/installed.html", resolve(targetDir, "installed.html"));
  await copyFile("src/views/updated.html", resolve(targetDir, "updated.html"));
  await copyFile("src/views/installed-script.js", resolve(targetDir, "installed-script.js"));
  await copyFile("src/views/updated-script.js", resolve(targetDir, "updated-script.js"));
}

async function buildTarget(target) {
  if (!targets.has(target)) {
    throw new Error(`Unknown build target: ${target}`);
  }

  const outdir = resolve("dist", target);
  await rm(outdir, { recursive: true, force: true });
  await ensureDir(outdir);

  await build({
    entryPoints,
    outdir,
    bundle: true,
    minify: false,
    sourcemap: false,
    platform: "browser",
    target: "es2020",
    format: "iife",
    define: {
      "process.env.NODE_ENV": '"development"',
      "__DEV__": "true" // Development için debug log'ları açık
    }
  });

  await copyStatic(outdir, `manifest.${target}.json`);
}

async function run() {
  for (const target of buildTargets) {
    await buildTarget(target);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
