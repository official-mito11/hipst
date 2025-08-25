import { runFeBuild } from "./fe-build";
import type { GeneratedDocs } from "./docs-gen";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type SourcemapMode = "external" | "inline" | "none";
type FullBuildArgs = {
  app?: string; // legacy --app
  appPos?: string; // positional
  api?: string; // optional legacy api path
  out?: string; // out dir (default: dist/app)
  sourcemap?: SourcemapMode;
};

function isSourcemapMode(v: string): v is SourcemapMode {
  return v === "external" || v === "inline" || v === "none";
}

function parseArgs(argv: string[]): FullBuildArgs {
  const out: FullBuildArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") break;
    if (!a.startsWith("-")) { if (!out.appPos) out.appPos = a; continue; }
    if (a === "--app") { const n = argv[i + 1]; if (n && !n.startsWith("-")) { out.app = n; i++; } continue; }
    if (a.startsWith("--app=")) { out.app = a.slice("--app=".length); continue; }
    if (a === "--out") { const n = argv[i + 1]; if (n && !n.startsWith("-")) { out.out = n; i++; } continue; }
    if (a.startsWith("--out=")) { out.out = a.slice("--out=".length); continue; }
    if (a === "--api") { const n = argv[i + 1]; if (n && !n.startsWith("-")) { out.api = n; i++; } continue; }
    if (a.startsWith("--api=")) { out.api = a.slice("--api=".length); continue; }
    if (a === "--sourcemap") {
      const n = argv[i + 1]; if (n && !n.startsWith("-") && isSourcemapMode(n)) { out.sourcemap = n; i++; }
      continue;
    }
    if (a.startsWith("--sourcemap=")) {
      const v = a.slice("--sourcemap=".length);
      if (isSourcemapMode(v)) out.sourcemap = v as SourcemapMode;
      continue;
    }
  }
  return out;
}

export async function runFullBuild(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const appSpec = args.appPos || args.app;
  if (!appSpec) {
    console.error("Usage: hipst build --full <AppFilePath> [--api <ApiFile>] [--out <dir>] [--sourcemap external|inline|none]\n\nNotes: Generates CSR assets, compile-time docs, and a server runner script.");
    process.exit(1);
  }
  const appPathRaw = String(appSpec!);
  const cwd = process.cwd();
  const appAbs = resolve(cwd, appPathRaw);

  // Resolve optional API spec
  let apiAbs: string | undefined;
  if (args.api) {
    apiAbs = resolve(cwd, String(args.api));
  }

  const outRoot = resolve(cwd, String(args.out || "dist/app"));
  const hipstOut = join(outRoot, "_hipst");
  mkdirSync(hipstOut, { recursive: true });

  // 1) Build FE assets into out/_hipst using existing builder (always minified)
  {
    const feArgv = [
      Bun.argv[0] || "bun",
      "hipst-fe-build",
      appAbs,
      "--out", hipstOut,
    ];
    if (args.sourcemap !== undefined) feArgv.push("--sourcemap", String(args.sourcemap));
    await runFeBuild(feArgv);
  }

  // 2) Generate docs at build time and write docs.json (best-effort)
  let docsJson: GeneratedDocs | undefined = undefined;
  try {
    const { generateDocs } = await import("./docs-gen");
    docsJson = generateDocs([appAbs, ...(apiAbs ? [apiAbs] : [])]);
    writeFileSync(resolve(hipstOut, "docs.json"), JSON.stringify(docsJson), "utf-8");
  } catch {}

  // 3) Emit server.mjs runner
  const appUrl = pathToFileURL(appAbs).href;
  const apiUrl = apiAbs ? pathToFileURL(apiAbs).href : undefined;
  const hipstIndexUrl = pathToFileURL(resolve(cwd, "index.ts")).href;
  const runner = `#!/usr/bin/env bun

const APP_URL = ${JSON.stringify(appUrl)};
${apiUrl ? `const API_URL = ${JSON.stringify(apiUrl)};` : ""}

async function main() {
  console.log("hipst (full-build): boot");
  // Import hipst server from local repo (absolute index.ts) to avoid requiring package install
  let serverMod;
  try {
    serverMod = await import(${JSON.stringify(hipstIndexUrl)});
  } catch (e) {
    console.error("hipst (full-build): failed to import hipst index:", e);
    process.exit(1);
  }
  const { server } = serverMod;
  let mod;
  try {
    mod = await import(APP_URL);
  } catch (e) {
    console.error("hipst (full-build): failed to import app module:", APP_URL, e);
    process.exit(1);
  }
  const Root = (mod.default ?? mod.App);
  if (!Root) { console.error("hipst: build runner: could not resolve UI root export"); process.exit(1); }

  const s = server();
  // Serve prebuilt CSR assets from disk
  const assetsDir = new URL("./_hipst/", import.meta.url).pathname;
  console.log("hipst (full-build): assetsDir=", assetsDir);
  s.csrServeFromDir(assetsDir);
  s.route(Root);

  ${apiUrl ? `try {
    const amod = await import(API_URL);
    const apiNode = amod.default;
    if (apiNode) s.route(apiNode);
  } catch {}
  ` : ""}

  // Inject precompiled docs if present
  ${docsJson !== undefined ? `s.setDocs(${JSON.stringify(docsJson)});` : ""}

  const port = Number(process.env.PORT || 3000);
  s.listen(port, () => console.log(\`hipst (full-build): http://localhost:\${port}\`));
}

main().catch((e) => { console.error(e); process.exit(1); });
`;
  const runnerPath = resolve(outRoot, "server.mjs");
  mkdirSync(dirname(runnerPath), { recursive: true });
  writeFileSync(runnerPath, runner, "utf-8");
  try { chmodSync(runnerPath, 0o755); } catch {}

  console.log(`hipst build (full): wrote ${runnerPath}`);
}

if (import.meta.main) {
  runFullBuild().catch((e) => { console.error(e); process.exit(1); });
}
