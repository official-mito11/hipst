#!/usr/bin/env bun

import { resolve as pathResolve } from "path";
import { watch } from "fs";
import { mkdir } from "fs/promises";

function usage() {
  console.log(`
Hipst CLI

Usage:
  hipst serve <ServerFilePath> [options]
    --hmr, -w             Enable HMR (live reload)
    --port, -p <number>   Force port (overrides app.listen)

  hipst build <AppFilePath> [options]
    --out <dir>           Output dir (default: dist/app)
    --sourcemap <mode>    external|inline|none (default: external)
`);
}

type ArgMap = {
  _: string[]; // positionals
  hmr?: boolean;
  w?: boolean;
  port?: string | number;
  p?: string | number;
  out?: string;
  sourcemap?: "external" | "inline" | "none";
};

function parseArgs(argv: string[], startIndex = 3): ArgMap {
  const out: ArgMap = { _: [] };
  for (let i = startIndex; i < argv.length; i++) {
    const a: string = argv[i] ?? "";
    if (!a) break;
    if (a === "--hmr" || a === "-w") { out.hmr = true; continue; }
    if (a === "--port" || a === "-p") { const v = argv[++i] ?? ""; if (a === "--port") out.port = v; else out.p = v; continue; }
    if (a === "--out") { out.out = argv[++i] ?? out.out; continue; }
    if (a === "--sourcemap") { out.sourcemap = (argv[++i] as any) ?? out.sourcemap; continue; }
    if (a === "--") break;
    if (a.startsWith("-")) continue; // unknown flag – skip
    out._.push(a);
  }
  return out;
}

async function runServe(argv: string[]): Promise<void> {
  const args = parseArgs(argv, 3);
  const file = args._[0];
  if (!file) { usage(); console.error("Missing <ServerFilePath>"); process.exit(1); }
  const abs = pathResolve(process.cwd(), file);

  const hmr = !!(args.hmr || args.w);
  const portStr = String(args.port ?? args.p ?? "").trim();
  const runner = Bun.argv[0] || "bun";

  function spawnOnce() {
    const env: Record<string, string> = { ...process.env as any };
    if (hmr) env["HIPST_DEV_HMR"] = "1";
    if (portStr) env["HIPST_FORCE_PORT"] = portStr;
    // If a prebuilt CSR dir is provided, allow the app to serve from it via env
    if (process.env.HIPST_CSR_DIR) env["HIPST_CSR_DIR"] = process.env.HIPST_CSR_DIR;
    const p = Bun.spawn({ cmd: [runner, abs], stdin: "inherit", stdout: "inherit", stderr: "inherit", env });
    return p;
  }

  let child = spawnOnce();

  if (hmr) {
    // Minimal watch: restart process when the entry file changes
    try {
      watch(abs, { persistent: true }, () => {
        try { child.kill(); } catch {}
        child = spawnOnce();
      });
    } catch {}
  }
}

async function runBuild(argv: string[]): Promise<void> {
  const args = parseArgs(argv, 3);
  const app = args._[0];
  if (!app) { usage(); console.error("Missing <AppFilePath>"); process.exit(1); }
  const abs = pathResolve(process.cwd(), app);
  const outDir = pathResolve(process.cwd(), args.out || "dist/app");
  const sourcemap = (args.sourcemap ?? "external") as "external" | "inline" | "none";

  // Build UI entry
  const entryOut = await Bun.build({ entrypoints: [abs], target: "browser", format: "esm", minify: true, sourcemap });
  if (!entryOut.success) {
    console.error("hipst build: UI entry build failed", entryOut);
    process.exit(1);
  }
  let entryJs = ""; let entryMap = "";
  for (const o of entryOut.outputs) {
    const p = o.path.toLowerCase();
    if (p.endsWith(".map")) entryMap = typeof (o as any).text === "function" ? await (o as any).text() : (o as any).text ?? entryMap;
    if (p.endsWith(".js") || p.endsWith(".mjs")) entryJs = typeof (o as any).text === "function" ? await (o as any).text() : (o as any).text ?? entryJs;
  }

  // Build runtime
  let runtimePath = new URL("../core/ui/runtime.ts", import.meta.url).pathname;
  if (!(await Bun.file(runtimePath).exists())) runtimePath = new URL("../core/ui/runtime.js", import.meta.url).pathname;
  const runtimeOut = await Bun.build({ entrypoints: [runtimePath], target: "browser", format: "esm", minify: true, sourcemap });
  if (!runtimeOut.success) {
    console.error("hipst build: runtime build failed", runtimeOut);
    process.exit(1);
  }
  let runtimeJs = ""; let runtimeMap = "";
  for (const o of runtimeOut.outputs) {
    const p = o.path.toLowerCase();
    if (p.endsWith(".map")) runtimeMap = typeof (o as any).text === "function" ? await (o as any).text() : (o as any).text ?? runtimeMap;
    if (p.endsWith(".js") || p.endsWith(".mjs")) runtimeJs = typeof (o as any).text === "function" ? await (o as any).text() : (o as any).text ?? runtimeJs;
  }

  // Wrapper that mounts default or App export
  const wrapper = `import { mount } from "./runtime.mjs";\nimport * as Mod from "./app.entry.mjs";\nconst Root = Mod.default ?? Mod.App;\nconst el = document.getElementById("__hipst_app__");\nif (el && Root) mount(Root, el);\n`;

  // Ensure dir and write files
  await mkdir(outDir, { recursive: true }).catch(() => {});
  await Bun.write(pathResolve(outDir, "app.entry.mjs"), entryJs);
  if (entryMap) await Bun.write(pathResolve(outDir, "app.entry.mjs.map"), entryMap);
  await Bun.write(pathResolve(outDir, "runtime.mjs"), runtimeJs);
  if (runtimeMap) await Bun.write(pathResolve(outDir, "runtime.mjs.map"), runtimeMap);
  await Bun.write(pathResolve(outDir, "app.mjs"), wrapper);
  // CSS aggregation is app-specific; leave placeholder empty file for now
  await Bun.write(pathResolve(outDir, "app.css"), "");

  console.log(`[build] wrote ${outDir}`);
}

export async function main(argv: string[] = Bun.argv) {
  const cmd = argv[2];
  switch (cmd) {
    case "build":
      await runBuild(argv);
      return;
    case "serve":
      await runServe(argv);
      return;
    case "help":
    case undefined:
    default:
      usage();
      return;
  }
}

if (import.meta.main) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
