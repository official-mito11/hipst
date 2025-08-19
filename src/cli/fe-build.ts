import { renderToString } from "../../index";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out as {
    app?: string;
    out?: string;
    csr?: string;
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

function injectCSR(html: string, hasCss: boolean): string {
  const link = hasCss ? '<link rel="stylesheet" href="./app.css">' : '';
  const script = '<script type="module" src="./app.mjs"></script>';
  if (hasCss) html = html.replace(/<head(\s*[^>]*)>/i, (m) => m + link);
  html = html.replace(/<body(\s*[^>]*)>/i, (m) => m + '<div id="__hipst_app__">');
  html = html.replace(/<\/body>/i, '</div>' + script + '</body>');
  return html;
}

export async function runFeBuild(argv: string[] = Bun.argv) {
  const args = parseArgs(argv);
  const appArg = args.app;
  if (!appArg) {
    console.error("Usage: hipst fe-build --app <path>[#export] [--csr <clientEntry>] [--out <dir>] [--minify true|false] [--sourcemap external|inline|none]");
    process.exit(1);
  }
  const [appPathRaw, exportName] = String(appArg!).split("#") as [string, string?];
  const appPath = resolve(process.cwd(), appPathRaw);
  const mod = await import(appPath);
  const root = exportName ? mod[exportName] : (mod.default ?? mod.App);
  if (!root) {
    console.error(`Could not find export '${exportName || "default|App"}' in ${appPath}`);
    process.exit(1);
  }

  let html = renderToString(root);

  const outDir = resolve(process.cwd(), String(args.out || "dist/fe"));
  mkdirSync(outDir, { recursive: true });

  const csrEntry = args.csr ? resolve(process.cwd(), String(args.csr)) : undefined;
  if (csrEntry) {
    const sourcemap = (args.sourcemap ?? "external") as "external" | "inline" | "none";
    const minify = args.minify === undefined ? true : String(args.minify) !== "false";
    const out = await Bun.build({ entrypoints: [csrEntry], target: "browser", format: "esm", sourcemap: sourcemap as any, minify });
    if (!out.success) {
      console.error("hipst fe-build: CSR build failed", out);
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
      html = injectCSR(html, !!css);
    }
  }

  const htmlPath = resolve(outDir, "index.html");
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(htmlPath, html, "utf-8");
  console.log(`hipst fe-build: wrote ${htmlPath}`);
}

if (import.meta.main) {
  runFeBuild().catch((e) => { console.error(e); process.exit(1); });
}
