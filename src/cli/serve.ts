import { server } from "../../index";
import { resolve } from "node:path";
import { readdirSync, statSync, readFileSync } from "node:fs";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out as {
    ui?: string; // path[#export]
    api?: string; // path[#export]
    csr?: string; // path to client entry
    port?: string;
  };
}

function readHipstClientFromPackageJson(cwd: string): string | undefined {
  try {
    const pkgJson = readFileSync(resolve(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgJson);
    const client = pkg?.hipst?.client;
    if (typeof client === "string" && client.length) return resolve(cwd, client);
  } catch {}
  return undefined;
}

function findFirstClientEntry(root: string): string | undefined {
  const exts = [".ts", ".tsx", ".js", ".jsx"];
  const ignore = new Set(["node_modules", "dist", ".git", "build", "coverage", ".cache", ".next", "out", ".turbo"]);
  function walk(dir: string): string | undefined {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return undefined; }
    for (const name of entries) {
      if (ignore.has(name)) continue;
      const abs = resolve(dir, name);
      let st; try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) {
        const found = walk(abs);
        if (found) return found;
      } else {
        for (const ext of exts) {
          if (name.endsWith(`.client${ext}`)) return abs;
        }
      }
    }
    return undefined;
  }
  return walk(root);
}

function resolveCsrEntryFromArgsOrAuto(arg?: string): string | undefined {
  if (arg) return resolve(process.cwd(), String(arg));
  const fromPkg = readHipstClientFromPackageJson(process.cwd());
  if (fromPkg) return fromPkg;
  return findFirstClientEntry(process.cwd());
}

export async function runServe(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const port = args.port ? parseInt(String(args.port), 10) : 3000;

  const s = server();

  const csrAbs = resolveCsrEntryFromArgsOrAuto(args.csr ? String(args.csr) : undefined);
  if (csrAbs) {
    if (!args.csr) console.log(`hipst serve: auto-detected CSR entry: ${csrAbs}`);
    s.csr(csrAbs);
  }

  if (args.ui) {
    const [p, ex] = String(args.ui).split("#") as [string, string?];
    const abs = resolve(process.cwd(), p);
    const mod = await import(abs);
    const root = ex ? mod[ex] : (mod.default ?? mod.App);
    if (!root) {
      console.error(`Could not find export '${ex || "default|App"}' in ${abs}`);
      process.exit(1);
    }
    s.route(root);
  }

  if (args.api) {
    const [p, ex] = String(args.api).split("#") as [string, string?];
    const abs = resolve(process.cwd(), p);
    const mod = await import(abs);
    const apiNode = ex ? mod[ex] : (mod.default);
    if (!apiNode) {
      console.error(`Could not find export '${ex || "default"}' in ${abs}`);
      process.exit(1);
    }
    s.route(apiNode);
  }

  s.listen(port, () => {
    console.log(`hipst serve: http://localhost:${port}`);
  });
}

if (import.meta.main) {
  runServe().catch((e) => { console.error(e); process.exit(1); });
}
