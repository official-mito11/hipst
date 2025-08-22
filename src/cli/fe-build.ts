import { renderToString } from "../../index";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { injectHtmlAssets } from "../core/html/inject";

function parseArgs(argv: string[]) {
  const out: any = { };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") break;
    if (!a.startsWith("-")) { out.appPos = a; continue; }
    const eq = a.indexOf("=");
    if (a === "--client") { out.client = true; continue; }
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
    out?: string;
    csr?: string; // legacy explicit client entry
    client?: boolean; // new flag
    minify?: string | boolean;
    sourcemap?: string;
  };
}

async function readOutputText(art: any): Promise<string> {
  if (typeof art.text === "function") return await art.text();
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

function injectCSR(html: string, hasCss: boolean, csrOnly = false): string {
  return injectHtmlAssets(html, {
    // Build output is static; no HMR here
    hmr: { enabled: false },
    csr: {
      scriptSrc: "./app.mjs",
      cssHref: hasCss ? "./app.css" : undefined,
      csrOnly,
    },
  });
}

export async function runFeBuild(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const appSpec = args.appPos || args.app;
  if (!appSpec) {
    console.error("Usage: hipst build <AppFilePath[#Export]> [--client] [--out <dir>] [--minify true|false] [--sourcemap external|inline|none]  (alias: fe-build)\n\nNotes: --client builds CSR-only HTML; default builds SSR HTML + CSR assets. Legacy --app/--csr are supported.");
    process.exit(1);
  }
  const [appPathRaw, exportName] = String(appSpec!).split("#") as [string, string?];
  const appPath = resolve(process.cwd(), appPathRaw);
  const mod = await import(appPath);
  const root = exportName ? mod[exportName] : (mod.default ?? mod.App);
  if (args.client && exportName && exportName !== "default") {
    console.error("--client requires the app to be exported as default (no #Export override).");
    process.exit(1);
  }
  if (!root) {
    console.error(`Could not find export '${exportName || "default|App"}' in ${appPath}`);
    process.exit(1);
  }

  let html = renderToString(root);

  const outDir = resolve(process.cwd(), String(args.out || "dist/fe"));
  mkdirSync(outDir, { recursive: true });

  // Build path selection
  const sourcemap = (args.sourcemap ?? "external") as "external" | "inline" | "none";
  const minify = args.minify === undefined ? true : String(args.minify) !== "false";

  const explicitEntry = args.csr ? resolve(process.cwd(), String(args.csr)) : undefined;
  if (explicitEntry) {
    // Legacy/explicit path: build single bundle
    const out = await Bun.build({ entrypoints: [explicitEntry], target: "browser", format: "esm", sourcemap: sourcemap as any, minify });
    if (!out.success) {
      console.error("hipst build: CSR build failed", out);
    } else {
      let js: string | undefined;
      let css: string | undefined;
      let jsMap: string | undefined;
      let cssMap: string | undefined;
      for (const art of out.outputs) {
        const p = art.path.toLowerCase();
        if (p.endsWith(".js") || p.endsWith(".mjs")) js = await readOutputText(art);
        else if (p.endsWith(".css")) css = await readOutputText(art);
        else if (p.endsWith(".map")) {
          const m = await readOutputText(art);
          try {
            const json = JSON.parse(m);
            const f = String(json.file || "");
            if (f.endsWith(".css")) cssMap = m; else jsMap = m;
          } catch { jsMap = m; }
        }
      }
      if (js) {
        js = js.replace(/\/# sourceMappingURL=.*$/m, '//# sourceMappingURL=app.mjs.map');
        writeFileSync(resolve(outDir, "app.mjs"), js, "utf-8");
      }
      if (jsMap) writeFileSync(resolve(outDir, "app.mjs.map"), jsMap, "utf-8");
      if (css) {
        css = css.replace(/\/*# sourceMappingURL=.*\*\//m, '/*# sourceMappingURL=app.css.map */');
        writeFileSync(resolve(outDir, "app.css"), css, "utf-8");
      }
      if (cssMap) writeFileSync(resolve(outDir, "app.css.map"), cssMap, "utf-8");
      html = injectCSR(html, !!css, !!args.client);
    }
  } else {
    // Auto mode: build UI module and runtime separately, concatenate CSS, emit wrapper
    const entryOut = await Bun.build({ entrypoints: [appPath], target: "browser", format: "esm", sourcemap: sourcemap as any, minify });
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
    const runtimeOut = await Bun.build({ entrypoints: [runtimePath], target: "browser", format: "esm", sourcemap: sourcemap as any, minify });
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
    const r: any = root as any;
    const headCss: string[] | undefined = r && typeof r === "object" && Array.isArray(r.headCss) ? r.headCss : (typeof r?.headCss === "function" ? r.headCss() : undefined);
    if (Array.isArray(headCss)) {
      for (const css of headCss) {
        if (typeof css === "string" && css) cssList.push(resolve(process.cwd(), css));
      }
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
const Root = ${exportName ? `Mod[${JSON.stringify(exportName)}]` : `(Mod as any).default ?? (Mod as any).App`};
const el = document.getElementById("__hipst_app__");
if (el && Root) mount(Root, el);
`;
    writeFileSync(resolve(outDir, "app.mjs"), wrapper, "utf-8");

    html = injectCSR(html, !!cssCombined, !!args.client);
  }

  const htmlPath = resolve(outDir, "index.html");
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html, "utf-8");
  console.log(`hipst build: wrote ${htmlPath}`);
}

if (import.meta.main) {
  runFeBuild().catch((e) => { console.error(e); process.exit(1); });
}
