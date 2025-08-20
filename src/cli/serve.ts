import { server } from "../../index";
import { resolve } from "node:path";

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

  const s = server();

  const cwd = process.cwd();
  const uiSpec = args.app || args.ui; // prefer positional
  if (!uiSpec) {
    console.error("Usage: hipst serve <AppFilePath[#Export]> [--csr] [--port|-p <number>] [--watch|-w]");
    process.exit(1);
  }
  const [p, ex] = String(uiSpec).split("#") as [string, string?];
  const abs = resolve(cwd, p);
  const mod = await import(abs);
  const root = ex ? mod[ex] : (mod.default ?? mod.App);
  if (!root) {
    console.error(`Could not find export '${ex || "default|App"}' in ${abs}`);
    process.exit(1);
  }
  // CSR is opt-in: --csr -> enable CSR-only (no SSR body)
  if (args.csrOnly) s.csrAutoFrom(abs, ex).csrOnly();
  s.route(root);

  // legacy API support if provided
  if (args.api) {
    const [ap, aex] = String(args.api).split("#") as [string, string?];
    const aabs = resolve(cwd, ap);
    const amod = await import(aabs);
    const apiNode = aex ? amod[aex] : (amod.default);
    if (apiNode) s.route(apiNode);
  }

  s.listen(port, () => {
    console.log(`hipst serve: http://localhost:${port}`);
    if (args.watch) console.log("[watch] hot reload is not implemented yet");
  });
}

if (import.meta.main) {
  runServe().catch((e) => { console.error(e); process.exit(1); });
}
