import { server } from "../../index";
import { resolve } from "node:path";

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

export async function runServe(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const port = args.port ? parseInt(String(args.port), 10) : 3000;

  const s = server();

  if (args.csr) s.csr(resolve(process.cwd(), String(args.csr)));

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
