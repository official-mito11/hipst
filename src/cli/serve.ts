import { Server } from "../../index";
import { resolve } from "node:path";
import { watch } from "node:fs";
import { pathToFileURL } from "node:url";

type ServeArgs = {
  app?: string; // positional path to server module
  ui?: string; // legacy
  api?: string; // legacy
  watch?: boolean; // -w/--watch
  port?: string; // -p/--port
  csr?: string; // --csr <path> optional CSR entry override
};

function parseArgs(argv: string[]): ServeArgs {
  const out: ServeArgs = {};

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") break;
    if (a === "--watch" || a === "-w") { out.watch = true; continue; }
    if (a.startsWith("--port=")) { out.port = a.slice("--port=".length); continue; }
    if (a === "--port" || a === "-p") {
      const n = argv[i + 1];
      if (n && !n.startsWith("-")) { out.port = n; i++; } else out.port = "";
      continue;
    }
    if (a.startsWith("--csr=")) { out.csr = a.slice("--csr=".length); continue; }
    if (a === "--csr") {
      const n = argv[i + 1];
      if (n && !n.startsWith("-")) { out.csr = n; i++; }
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
    console.error("Usage: hipst serve <ServerFilePath> [--port|-p <number>] [--watch|-w] [--csr <ClientEntryFilePath>]");
    process.exit(1);
  }
  const abs = resolve(cwd, String(uiSpec));
  const csrAbs = args.csr ? resolve(cwd, String(args.csr)) : undefined;
  // Helper: import with cache-busting for HMR
  let bust = 0;
  const importFresh = async (p: string) => {
    const url = pathToFileURL(p);
    const href = url.href + `?v=${++bust}`;
    return await import(href);
  };

  // Try to import a default-exported Server instance
  type MaybeServerModule = { default?: Server };
  let sCandidate: Server | undefined;
  try {
    const mod = (await importFresh(abs)) as MaybeServerModule;
    const exported = mod.default;
    if (exported instanceof Server) sCandidate = exported;
  } catch {}

  // Fallback: if no Server default export, run the file with Bun (bun-like behavior)
  if (!sCandidate) {
    const runner = Bun.argv[0] || "bun";
    console.log(`hipst serve (fallback): ${runner} ${abs}`);
    let child = Bun.spawn({
      cmd: [runner, abs],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        ...(args.port ? { PORT: String(port), HIPST_FORCE_PORT: String(port) } : {}),
        ...(csrAbs ? { HIPST_CSR_ENTRY: csrAbs } : {}),
      },
    });
    if (args.watch) {
      const restart = () => {
        try { child.kill(); } catch {}
        child = Bun.spawn({
          cmd: [runner, abs],
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          env: {
            ...process.env,
            ...(args.port ? { PORT: String(port), HIPST_FORCE_PORT: String(port) } : {}),
            ...(csrAbs ? { HIPST_CSR_ENTRY: csrAbs } : {}),
          },
        });
        console.log(`[watch] restarted fallback process`);
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const scheduleRestart = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = undefined; restart(); }, 150);
      };
      try {
        watch(abs, { persistent: true }, () => scheduleRestart());
        console.log("[watch] watching:", abs);
      } catch (e) {
        console.warn("[watch] could not watch:", abs, e);
      }
    }
    return;
  }

  let s: Server = sCandidate;
  if (args.watch) s.enableHMR();
  if (csrAbs) try { s.setCsrEntry(csrAbs); } catch {}

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
        try { s.hmrBroadcast(); } catch {}
        // Close current server
        try { s.close(); } catch {}
        // Re-import module fresh
        const mod = await importFresh(abs);
        const next = (mod as MaybeServerModule).default;
        if (!(next instanceof Server)) {
          console.error(`[watch] export is not a Server instance after reload. Skipping restart.`);
          return;
        }
        s = next as Server;
        s.enableHMR();
        if (csrAbs) try { s.setCsrEntry(csrAbs); } catch {}
        try {
          const { generateDocs } = await import("./docs-gen");
          s.setDocs(generateDocs([abs]));
        } catch {}
        s.listen(port, () => console.log(`[watch] restarted at http://localhost:${port}`));
      } catch (e) {
        console.error("[watch] restart failed:", e);
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRestart = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; restart(); }, 150);
    };
    try {
      watch(abs, { persistent: true }, () => scheduleRestart());
      console.log("[watch] watching:", abs);
    } catch (e) {
      console.warn("[watch] could not watch:", abs, e);
    }
  }
}

if (import.meta.main) {
  runServe().catch((e) => { console.error(e); process.exit(1); });
}
