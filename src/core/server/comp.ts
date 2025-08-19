import { Component } from "../comp";
import { ApiComponent, type Finalish, type FinalResult } from "./api";
import type { HtmlRoot } from "../ui/factory";
import { UIComponent } from "../ui/comp";
import { renderToString } from "../ui/render";
import { resolve as pathResolve } from "path";

export class Server extends Component {
  private _server?: Bun.Server;
  private apis: ApiComponent[] = [];
  private uiRoot?: HtmlRoot | UIComponent;
  private statics: Array<{ mount: string; dir: string }> = [];
  // CSR configuration & in-memory built assets
  private csrEnabled = false;
  private csrEntry?: string;
  private csrBuilt?: {
    js: string;
    css?: string;
    map?: string;
  };

  constructor() {
    super();
  }

  route(node: ApiComponent | HtmlRoot | UIComponent): this {
    if (node instanceof ApiComponent) this.apis.push(node);
    else this.uiRoot = node as any;
    return this;
  }

  /**
   * Enable client-side runtime (CSR). When enabled, Server will:
   * - Build a browser bundle from the provided entry (or auto-detect common entries)
   * - Inject <link rel="stylesheet"> and <script type="module"> tags into SSR HTML
   * - Serve built assets under /_hipst/app.css and /_hipst/app.mjs
   *
   * Example:
   *   server().csr("examples/counter.client.ts").route(App).listen(3000)
   */
  csr(entry?: string): this {
    this.csrEnabled = true;
    this.csrEntry = entry;
    return this;
  }

  private async findDefaultClientEntry(): Promise<string | undefined> {
    const cwd = process.cwd();
    // 1) package.json configuration (preferred)
    try {
      const pkgFile = Bun.file(pathResolve(cwd, "package.json"));
      if (await pkgFile.exists()) {
        const pkg = JSON.parse(await pkgFile.text());
        const cfg: string | undefined =
          pkg?.hipst?.client ?? pkg?.hipst?.csr?.entry ?? pkg?.hipst?.csrEntry;
        if (cfg) return pathResolve(cwd, cfg);
      }
    } catch { /* ignore */ }

    // 2) Glob search for a conventional client entry
    try {
      const glob = new Bun.Glob("**/*.client.{ts,tsx,js,jsx}");
      for await (const p of glob.scan({ cwd })) {
        return pathResolve(cwd, p);
      }
    } catch { /* ignore */ }
    return undefined;
  }

  private async ensureClientBuilt(): Promise<void> {
    if (!this.csrEnabled) return;
    if (this.csrBuilt) return;
    const entry = this.csrEntry ?? (await this.findDefaultClientEntry());
    if (!entry) {
      // No client entry found; provide empty assets so tags don't 404
      this.csrBuilt = { js: "" };
      return;
    }
    const out = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "external",
    });
    if (!out.success) {
      console.error("hipst: CSR build failed", out);
      this.csrBuilt = { js: "" };
      return;
    }
    let js: string | undefined;
    let css: string | undefined;
    let map: string | undefined;
    for (const art of out.outputs) {
      const p = art.path.toLowerCase();
      const getText = async (): Promise<string> => {
        const a: any = art as any;
        if (typeof a.text === "function") return await a.text();
        if (typeof a.arrayBuffer === "function") {
          const ab: ArrayBuffer = await a.arrayBuffer();
          return new TextDecoder().decode(new Uint8Array(ab));
        }
        if (typeof a.bytes === "function") {
          const u8: Uint8Array = await a.bytes();
          return new TextDecoder().decode(u8);
        }
        const t = a.text;
        if (typeof t === "string") return t;
        return String(t ?? "");
      };
      if (p.endsWith(".js") || p.endsWith(".mjs")) js = await getText();
      else if (p.endsWith(".css")) css = await getText();
      else if (p.endsWith(".map")) map = await getText();
    }
    this.csrBuilt = { js: js ?? "", css, map };
  }

  private injectCSR(html: string): string {
    if (!this.csrEnabled) return html;
    // Inject link/script and wrap body content in a mount container
    const link = '<link rel="stylesheet" href="/_hipst/app.css">';
    const script = '<script type="module" src="/_hipst/app.mjs"></script>';
    // head injection
    html = html.replace(/<head(\s*[^>]*)>/i, (m) => m + link);
    // body wrap
    html = html.replace(/<body(\s*[^>]*)>/i, (m) => m + '<div id="__hipst_app__">');
    html = html.replace(/<\/body>/i, '</div>' + script + '</body>');
    return html;
  }

  /**
   * Serve static files from a directory under a URL mount path.
   * Example: .static("/static", pathToPublic)
   */
  static(mount: string, dir: string): this {
    // normalize mount to start with '/'
    if (!mount.startsWith("/")) mount = "/" + mount;
    // and no trailing slash (except root)
    if (mount.length > 1 && mount.endsWith("/")) mount = mount.slice(0, -1);
    this.statics.push({ mount, dir });
    return this;
  }

  private toResponse(out: Finalish): Response {
    if (out instanceof Response) return out;
    const r = out as FinalResult;
    if (r && (r as any).__hipst_final) {
      const headers = new Headers(r.headers);
      return new Response(r.body, { status: r.status, headers });
    }
    // default JSON
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  listen(port: number, cb?: (server: Bun.Server) => void) {
    this._server = Bun.serve({
      port: port,
      fetch: async (req) => {
        const url = new URL(req.url);
        // Serve internal CSR assets
        if (this.csrEnabled) {
          if (url.pathname === "/_hipst/app.mjs" || url.pathname === "/_hipst/app.js") {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.js ?? "";
            return new Response(body, {
              status: 200,
              headers: { "Content-Type": "application/javascript; charset=utf-8" },
            });
          }
          if (url.pathname === "/_hipst/app.css") {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.css ?? "";
            return new Response(body, {
              status: 200,
              headers: { "Content-Type": "text/css; charset=utf-8" },
            });
          }
          if (url.pathname === "/_hipst/app.mjs.map" || url.pathname === "/_hipst/app.js.map") {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.map ?? "";
            return new Response(body, {
              status: 200,
              headers: { "Content-Type": "application/json; charset=utf-8" },
            });
          }
        }
        // Static files
        for (const s of this.statics) {
          if (url.pathname.startsWith(s.mount + "/") || url.pathname === s.mount) {
            const rel = decodeURIComponent(url.pathname.slice(s.mount.length));
            const full = pathResolve(s.dir, "." + (rel || "/index.html"));
            const safeBase = pathResolve(s.dir);
            if (!full.startsWith(safeBase)) {
              return new Response("Not Found", { status: 404 });
            }
            const file = Bun.file(full);
            if (await file.exists()) {
              const headers = new Headers();
              if (file.type) headers.set("Content-Type", file.type);
              return new Response(file, { status: 200, headers });
            }
            // If directory requested without index.html, 404
            // fallthrough to other handlers
          }
        }

        // Auto static from default dirs for common asset extensions
        {
          const p = url.pathname;
          const dot = p.lastIndexOf(".");
          if (dot > -1) {
            const ext = p.slice(dot + 1).toLowerCase();
            const ok = /^(css|js|mjs|cjs|map|ico|png|jpg|jpeg|gif|svg|webp|avif|json|txt|woff|woff2|ttf|otf|webmanifest)$/.test(ext);
            if (ok) {
              const bases = ["public", "assets", "dist"];
              for (const base of bases) {
                const full = pathResolve(process.cwd(), base, "." + p);
                const safeBase = pathResolve(process.cwd(), base);
                if (!full.startsWith(safeBase)) continue;
                const file = Bun.file(full);
                if (await file.exists()) {
                  const headers = new Headers();
                  if (file.type) headers.set("Content-Type", file.type);
                  return new Response(file, { status: 200, headers });
                }
              }
            }
          }
        }

        // API routing
        for (const api of this.apis) {
          const out = await api.dispatch(req, url);
          if (out !== undefined) return this.toResponse(out);
        }

        // UI fallback for GET
        if (req.method === "GET" && this.uiRoot) {
          let html = renderToString(this.uiRoot);
          html = this.injectCSR(html);
          return new Response(html, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    cb?.(this._server);
  }
}

export function server(): Server {
  return new Server();
}