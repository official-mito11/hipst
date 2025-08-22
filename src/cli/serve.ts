import { Server } from "../../index";
import { resolve } from "node:path";
import { watch } from "node:fs";
import { pathToFileURL } from "node:url";

function parseArgs(argv: string[]) {
  const out: {
    app?: string; // positional path[#export]
    ui?: string; // legacy
    api?: string; // legacy
    csrOnly?: boolean; // --csr
    watch?: boolean; // -w/--watch
    port?: string; // -p/--port
  } = {} as any;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") break;
    if (a === "--watch" || a === "-w") { out.watch = true; continue; }
    if (a === "--csr") { out.csrOnly = true; continue; }
    if (a.startsWith("--port=")) { out.port = a.slice("--port=".length); continue; }
    if (a === "--port" || a === "-p") {
      const n = argv[i + 1];
      if (n && !n.startsWith("-")) { out.port = n; i++; } else out.port = "";
      continue;
    }
    // legacy flags
    if (a.startsWith("--ui=")) { out.ui = a.slice("--ui=".length); continue; }
    if (a === "--ui") { const n = argv[i + 1]; if (n) { out.ui = n; i++; } continue; }
    if (a.startsWith("--api=")) { out.api = a.slice("--api=".length); continue; }
    if (a === "--api") { const n = argv[i + 1]; if (n) { out.api = n; i++; } continue; }
    // first non-flag -> app positional
    if (!a.startsWith("-")) { if (!out.app) out.app = a; continue; }
  }
  return out;
}

export async function runServe(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const port = args.port ? parseInt(String(args.port), 10) : 3000;

  const cwd = process.cwd();
  const uiSpec = args.app || args.ui; // prefer positional (legacy --ui kept for compat)
  if (!uiSpec) {
    console.error("Usage: hipst serve <ServerFilePath[#Export]> [--port|-p <number>] [--watch|-w]");
    process.exit(1);
  }
  const [p, ex] = String(uiSpec).split("#") as [string, string?];
  const abs = resolve(cwd, p);
  // Helper: import with cache-busting for HMR
  let bust = 0;
  const importFresh = async (p: string) => {
    const url = pathToFileURL(p);
    const href = url.href + `?v=${++bust}`;
    return await import(href);
  };

  const mod = await importFresh(abs);
  const exported = ex ? mod[ex] : (mod.default);
  if (!exported) {
    console.error(`Could not find export '${ex || "default"}' in ${abs}`);
    process.exit(1);
  }
  // Accept only a Server instance (server component). FE root is not served here.
  if (!(exported instanceof Server)) {
    console.error(`hipst serve expects a Server instance export. Got '${typeof exported}'.`);
    console.error(`Tip: export default server().route(...); // without .listen()`);
    process.exit(1);
  }
  let s = exported as Server;
  if (args.watch) s.enableHMR();

  // Generate and inject docs (compile-time via TS) for app and optional legacy api
  try {
    const { generateDocs } = await import("./docs-gen");
    s.setDocs(generateDocs([abs]));
  } catch {}

  s.listen(port, () => {
    console.log(`hipst serve: http://localhost:${port}`);
  });

  // Watch mode: restart server on file change and trigger HMR reload in clients
  if (args.watch) {
    const restart = async () => {
      try {
        // Notify clients to reload before restarting
        try { (s as any).hmrBroadcast?.(); } catch {}
        // Close current server
        try { s.close(); } catch {}
        // Re-import module fresh
        const mod = await importFresh(abs);
        const next = ex ? mod[ex] : (mod.default);
        if (!(next instanceof Server)) {
          console.error(`[watch] export is not a Server instance after reload. Skipping restart.`);
          return;
        }
        s = next as Server;
        s.enableHMR();
        try {
          const { generateDocs } = await import("./docs-gen");
          s.setDocs(generateDocs([abs]));
        } catch {}
        s.listen(port, () => console.log(`[watch] restarted at http://localhost:${port}`));
      } catch (e) {
        console.error("[watch] restart failed:", e);
      }
    };
    try {
      watch(abs, { persistent: true }, (_event) => restart());
      console.log("[watch] watching:", abs);
    } catch (e) {
      console.warn("[watch] could not watch:", abs, e);
    }
  }
}

if (import.meta.main) {
  runServe().catch((e) => { console.error(e); process.exit(1); });
}
