import { runFeBuild } from "./fe-build";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv: string[]) {
  const out: any = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") break;
    if (!a.startsWith("-")) { out.appPos = a; continue; }
    const eq = a.indexOf("=");
    if (a.startsWith("--")) {
      if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) { out[key] = next; i++; }
        else out[key] = true;
      }
    }
  }
  return out as {
    app?: string; // legacy --app
    appPos?: string; // positional
    api?: string; // optional legacy api path
    out?: string; // out dir (default: dist/full)
    minify?: string | boolean;
    sourcemap?: string;
  };
}

export async function runFullBuild(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const appSpec = args.appPos || args.app;
  if (!appSpec) {
    console.error("Usage: hipst build --full <AppFilePath[#Export]> [--api <ApiFile[#Export]>] [--out <dir>] [--minify true|false] [--sourcemap external|inline|none]\n\nNotes: Generates CSR assets, compile-time docs, and a server runner script.");
    process.exit(1);
  }
  const [appPathRaw, exportName] = String(appSpec!).split("#") as [string, string?];
  const cwd = process.cwd();
  const appAbs = resolve(cwd, appPathRaw);

  // Resolve optional API spec
  let apiAbs: string | undefined;
  let apiExport: string | undefined;
  if (args.api) {
    const [ap, aex] = String(args.api).split("#") as [string, string?];
    apiAbs = resolve(cwd, ap);
    apiExport = aex;
  }

  const outRoot = resolve(cwd, String(args.out || "dist/full"));
  const hipstOut = join(outRoot, "_hipst");
  mkdirSync(hipstOut, { recursive: true });

  // 1) Build FE assets into out/_hipst using existing builder
  {
    const feArgv = [
      Bun.argv[0] || "bun",
      "hipst-fe-build",
      appAbs + (exportName ? `#${exportName}` : ""),
      "--out", hipstOut,
    ];
    if (args.minify !== undefined) feArgv.push("--minify", String(args.minify));
    if (args.sourcemap !== undefined) feArgv.push("--sourcemap", String(args.sourcemap));
    await runFeBuild(feArgv);
  }

  // 2) Generate docs at build time and write docs.json (best-effort)
  let docsJson: any = undefined;
  try {
    const { generateDocs } = await import("./docs-gen");
    docsJson = generateDocs([appAbs, ...(apiAbs ? [apiAbs] : [])]);
    writeFileSync(resolve(hipstOut, "docs.json"), JSON.stringify(docsJson, null, 2), "utf-8");
  } catch {}

  // 3) Emit server.mjs runner
  const appUrl = pathToFileURL(appAbs).href;
  const apiUrl = apiAbs ? pathToFileURL(apiAbs).href : undefined;
  const hipstIndexUrl = pathToFileURL(resolve(cwd, "index.ts")).href;
  const runner = `#!/usr/bin/env bun

const APP_URL = ${JSON.stringify(appUrl)};
${apiUrl ? `const API_URL = ${JSON.stringify(apiUrl)};` : ""}
const EX = ${exportName ? JSON.stringify(exportName) : "undefined"};
${apiExport ? `const API_EX = ${JSON.stringify(apiExport)};` : ""}

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
  const Root = EX ? mod[EX] : (mod.default ?? mod.App);
  if (!Root) { console.error("hipst: build runner: could not resolve UI root export"); process.exit(1); }

  const s = server();
  // Serve prebuilt CSR assets from disk
  const assetsDir = new URL("./_hipst/", import.meta.url).pathname;
  console.log("hipst (full-build): assetsDir=", assetsDir);
  s.csrServeFromDir(assetsDir);
  s.route(Root);

  ${apiUrl ? `try {
    const amod = await import(API_URL);
    const apiNode = ${apiExport ? `amod[API_EX]` : `amod.default`};
    if (apiNode) s.route(apiNode);
  } catch {}
  ` : ""}

  // Inject precompiled docs if present
  ${docsJson && Array.isArray(docsJson.methods) && docsJson.methods.length > 0 ? `s.setDocs(${JSON.stringify(docsJson)});` : ""}

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
