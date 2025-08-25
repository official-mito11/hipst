import { renderToString } from "../../index";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { injectHtmlAssets } from "../core/html/inject";

type SourcemapMode = "external" | "inline" | "none";

interface OutputReadable {
  text?: (() => Promise<string>) | string;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  bytes?: () => Promise<Uint8Array>;
}
type BuildArgs = {
  app?: string; // legacy --app
  appPos?: string; // positional
  out?: string;
  sourcemap?: SourcemapMode;
};

function isSourcemapMode(v: string): v is SourcemapMode {
  return v === "external" || v === "inline" || v === "none";
}

function parseArgs(argv: string[]): BuildArgs {
  const out: BuildArgs = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") break;
    if (!a.startsWith("-")) { if (!out.appPos) out.appPos = a; continue; }
    if (a === "--app") {
      const n = argv[i + 1]; if (n && !n.startsWith("-")) { out.app = n; i++; }
      continue;
    }
    if (a.startsWith("--app=")) { out.app = a.slice("--app=".length); continue; }
    if (a === "--out") {
      const n = argv[i + 1]; if (n && !n.startsWith("-")) { out.out = n; i++; }
      continue;
    }
    if (a.startsWith("--out=")) { out.out = a.slice("--out=".length); continue; }
    if (a === "--sourcemap") {
      const n = argv[i + 1]; if (n && !n.startsWith("-") && isSourcemapMode(n)) { out.sourcemap = n; i++; }
      continue;
    }
    if (a.startsWith("--sourcemap=")) {
      const v = a.slice("--sourcemap=".length);
      if (isSourcemapMode(v)) out.sourcemap = v as SourcemapMode;
      continue;
    }
    // ignore unknown flags
  }
  return out;
}

async function readOutputText(art: OutputReadable): Promise<string> {
  if (typeof art.text === "function") {
    // Call as a method to preserve internal this binding
    const t: string = await art.text();
    return t;
  }
  if (typeof art.arrayBuffer === "function") {
    const ab: ArrayBuffer = await art.arrayBuffer();
    return new TextDecoder().decode(new Uint8Array(ab));
  }
  if (typeof art.bytes === "function") {
    const u8: Uint8Array = await art.bytes();
    return new TextDecoder().decode(u8);
  }
  const t = art.text;
  if (typeof t === "string") return t;
  return String(t ?? "");
}

function injectCSR(html: string, hasCss: boolean): string {
  return injectHtmlAssets(html, {
    hmr: { enabled: false },
    csr: {
      scriptSrc: "./app.mjs",
      cssHref: hasCss ? "./app.css" : undefined,
    },
  });
}

interface HeadCssProvider {
  headCss?: string[] | (() => string[]);
}

function getHeadCssFromRoot(root: object | null | undefined): string[] {
  if (!root || typeof root !== "object") return [];
  const prop = (root as HeadCssProvider).headCss;
  if (Array.isArray(prop) && prop.every((x) => typeof x === "string")) return prop;
  if (typeof prop === "function") {
    try {
      const out = prop();
      if (Array.isArray(out) && out.every((x) => typeof x === "string")) return out;
    } catch {}
  }
  return [];
}

export async function runFeBuild(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const appSpec = args.appPos || args.app;
  if (!appSpec) {
    console.error("Usage: hipst build <AppFilePath> [--out <dir>] [--sourcemap external|inline|none]  (alias: fe-build)\n\nNotes: Builds SSR HTML and CSR assets; client runtime is always included.");
    process.exit(1);
  }
  const appPathRaw = String(appSpec!);
  const appPath = resolve(process.cwd(), appPathRaw);
  const mod = await import(appPath);
  const root = (mod.default ?? mod.App);
  if (!root) {
    console.error(`Could not resolve UI root (expected default export or 'App') in ${appPath}`);
    process.exit(1);
  }

  let html = renderToString(root);

  const outDir = resolve(process.cwd(), String(args.out || "dist/app"));
  mkdirSync(outDir, { recursive: true });

  // Build path selection: always auto mode, minified
  const sourcemap: SourcemapMode = args.sourcemap ?? "external";
  const bunSourcemap: boolean | "external" | "inline" = sourcemap === "none" ? false : sourcemap;

  // Auto mode: build UI module and runtime separately, concatenate CSS, emit wrapper
  {
    const entryOut = await Bun.build({ entrypoints: [appPath], target: "browser", format: "esm", sourcemap: bunSourcemap, minify: true });
    if (!entryOut.success) {
      console.error("hipst build: UI entry build failed", entryOut);
      process.exit(1);
    }
    let entryJs: string | undefined;
    let entryMap: string | undefined;
    for (const art of entryOut.outputs) {
      const p = art.path.toLowerCase();
      if (p.endsWith(".js") || p.endsWith(".mjs")) entryJs = await readOutputText(art);
      else if (p.endsWith(".map")) entryMap = await readOutputText(art);
    }

    // Resolve runtime path relative to this file (TS or JS)
    let runtimePath = new URL("../core/ui/runtime.ts", import.meta.url).pathname;
    if (!(await Bun.file(runtimePath).exists())) {
      runtimePath = new URL("../core/ui/runtime.js", import.meta.url).pathname;
    }
    const runtimeOut = await Bun.build({ entrypoints: [runtimePath], target: "browser", format: "esm", sourcemap: bunSourcemap, minify: true });
    if (!runtimeOut.success) {
      console.error("hipst build: runtime build failed", runtimeOut);
      process.exit(1);
    }
    let runtimeJs: string | undefined;
    let runtimeMap: string | undefined;
    for (const art of runtimeOut.outputs) {
      const p = art.path.toLowerCase();
      if (p.endsWith(".js") || p.endsWith(".mjs")) runtimeJs = await readOutputText(art);
      else if (p.endsWith(".map")) runtimeMap = await readOutputText(art);
    }

    // Collect CSS from HtmlRoot
    const cssList: string[] = [];
    const headCss = getHeadCssFromRoot(root);
    for (const css of headCss) {
      if (css) cssList.push(resolve(process.cwd(), css));
    }
    let cssCombined = "";
    for (const p of cssList) {
      try { cssCombined += (await Bun.file(p).text()) + "\n"; } catch {}
    }

    // Emit files
    if (entryJs) {
      const normalized = entryJs.replace(/\/# sourceMappingURL=.*$/m, '//# sourceMappingURL=app.entry.mjs.map');
      writeFileSync(resolve(outDir, "app.entry.mjs"), normalized, "utf-8");
    }
    if (entryMap) writeFileSync(resolve(outDir, "app.entry.mjs.map"), entryMap, "utf-8");
    if (runtimeJs) {
      const normalized = runtimeJs.replace(/\/# sourceMappingURL=.*$/m, '//# sourceMappingURL=runtime.mjs.map');
      writeFileSync(resolve(outDir, "runtime.mjs"), normalized, "utf-8");
    }
    if (runtimeMap) writeFileSync(resolve(outDir, "runtime.mjs.map"), runtimeMap, "utf-8");
    if (cssCombined) writeFileSync(resolve(outDir, "app.css"), cssCombined, "utf-8");

    // Wrapper that mounts UI when loaded
    const wrapper = `// auto wrapper (fe-build)
import { mount } from "./runtime.mjs";
import * as Mod from "./app.entry.mjs";
const Root = Mod.default ?? Mod.App;
const el = document.getElementById("__hipst_app__");
if (el && Root) mount(Root, el);
`;
    writeFileSync(resolve(outDir, "app.mjs"), wrapper, "utf-8");

    html = injectCSR(html, !!cssCombined);
  }

  const htmlPath = resolve(outDir, "index.html");
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html, "utf-8");
  console.log(`hipst build: wrote ${htmlPath}`);
}

if (import.meta.main) {
  runFeBuild().catch((e) => { console.error(e); process.exit(1); });
}
