import { Component } from "../comp";
import { ApiComponent } from "./api";
import { createResponseKit, toResponse, type Finalish, type FinalResult } from "../http/response";
import { parseBody } from "../http/body";
import type { Middleware } from "./middleware";
import type { HtmlRoot } from "../ui/factory";
import { UIComponent } from "../ui/comp";
import { renderToString } from "../ui/render";
import { injectHtmlAssets } from "../html/inject";
import { resolve as pathResolve } from "path";
 
export class Server<L extends object = {}> extends Component {
  private _server?: Bun.Server;
  private apis: ApiComponent<any>[] = [];
  private uiRoot?: HtmlRoot | UIComponent;
  private statics: Array<{ mount: string; dir: string }> = [];
  private middlewares: Array<Middleware<any, any>> = [];
  // HMR
  private hmrEnabled = false;
  private hmrClients: Set<(data: string) => void> = new Set();
  // Docs override (CLI can inject compile-time docs)
  private docsOverride?: any;
  // CSR configuration & in-memory built assets
  private csrEnabled = true;
  private csrAutoSpec?: { modulePath: string; exportName?: string };
  private csrBuilt?: {
    js: string; // wrapper or explicit bundle
    entry?: string; // bundled UI module (when auto)
    runtime?: string; // bundled runtime (when auto)
    css?: string; // concatenated HtmlRoot.css()
    map?: string; // map for js (only when explicit entry)
    entryMap?: string; // map for entry (when auto)
    runtimeMap?: string; // map for runtime (when auto)
  };
  // Optional: serve CSR assets from a prebuilt directory (used by integrated build)
  private csrServeDir?: string;

  constructor() {
    super();
  }

  route(node: ApiComponent<any> | HtmlRoot | UIComponent): this {
    if (node instanceof ApiComponent) {
      this.apis.push(node);
    } else {
      this.uiRoot = node as any;
      // Determine CSR entry:
      // 1) Prefer CLI-provided module via HIPST_CSR_ENTRY
      // 2) Fallback to any __hipst_module__ hint on the UI root (best-effort)
      if (!this.csrAutoSpec) {
        const envEntry = (process?.env?.HIPST_CSR_ENTRY ?? "").trim();
        if (envEntry) {
          this.csrAutoSpec = { modulePath: envEntry, exportName: undefined };
        } else {
          try {
            const modPath = (node as unknown as { __hipst_module__?: string }).__hipst_module__;
            if (typeof modPath === "string" && modPath.length > 0) {
              this.csrAutoSpec = { modulePath: modPath, exportName: undefined };
            }
          } catch {}
        }
      }
    }
    return this;
  }

  /** Clear registered routes (UI root and APIs). Useful for HMR reloads. */
  resetRoutes(): this {
    this.apis = [];
    this.uiRoot = undefined;
    return this;
  }

  /** Invalidate in-memory CSR build so it will rebuild on next request. */
  invalidateClientBuild(): this {
    this.csrBuilt = undefined;
    return this;
  }

  use<Add extends object>(mw: Middleware<L, Add>): Server<L & Add> {
    this.middlewares.push(mw as any);
    return this as unknown as Server<L & Add>;
  }

  /** Enable SSE-based live-reload for dev. */
  enableHMR(): this { this.hmrEnabled = true; return this; }
  /** Broadcast a reload event to connected HMR clients. */
  hmrBroadcast(): void {
    if (!this.hmrEnabled) return;
    for (const send of this.hmrClients) {
      try { send("reload"); } catch {}
    }
  }
  /** Allow CLI to override docs payload (e.g., compiled type schemas). */
  setDocs(doc: any): this { this.docsOverride = doc; return this; }

  // CSR-only mode removed: SSR body is always preserved and wrapped for hydration.

  /** @internal Use CSR assets from a prebuilt directory. Files expected: app.mjs, app.entry.mjs, runtime.mjs, app.css, and optional .map files. */
  csrServeFromDir(dir: string): this {
    this.csrServeDir = dir;
    return this;
  }

  // No longer auto-discovers .client.* entries; CSR is generated from UI module or explicit entry.

  private async ensureClientBuilt(): Promise<void> {
    if (this.csrBuilt) return;
    const cwd = process.cwd();
    // Auto mode only: build UI module and runtime separately, concatenate CSS from HtmlRoot, and serve via wrapper
    if (!this.csrAutoSpec) { this.csrBuilt = { js: "" }; return; }
    const { modulePath: modPath, exportName: ex } = this.csrAutoSpec;

    // Build UI module
    const entryOut = await Bun.build({
      entrypoints: [modPath],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "external",
    });
    if (!entryOut.success) {
      console.error("hipst: UI entry build failed", entryOut);
      this.csrBuilt = { js: "" };
      return;
    }
    let entryJs: string | undefined;
    let entryMap: string | undefined;
    for (const art of entryOut.outputs) {
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
      if (p.endsWith(".js") || p.endsWith(".mjs")) entryJs = await getText();
      else if (p.endsWith(".map")) entryMap = await getText();
    }

    // Build runtime module (resolve relative to this file; support TS or JS)
    let runtimePath = new URL("../ui/runtime.ts", import.meta.url).pathname;
    if (!(await Bun.file(runtimePath).exists())) {
      runtimePath = new URL("../ui/runtime.js", import.meta.url).pathname;
    }
    const runtimeOut = await Bun.build({
      entrypoints: [runtimePath],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "external",
    });
    if (!runtimeOut.success) {
      console.error("hipst: runtime build failed", runtimeOut);
      this.csrBuilt = { js: "" };
      return;
    }
    let runtimeJs: string | undefined;
    let runtimeMap: string | undefined;
    for (const art of runtimeOut.outputs) {
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
      if (p.endsWith(".js") || p.endsWith(".mjs")) runtimeJs = await getText();
      else if (p.endsWith(".map")) runtimeMap = await getText();
    }

    // Collect CSS from HtmlRoot and concatenate
    const cssList: string[] = [];
    const r: any = this.uiRoot as any;
    const headCss: string[] | undefined = r && typeof r === "object" && Array.isArray(r.headCss) ? r.headCss : (typeof r?.headCss === "function" ? r.headCss() : undefined);
    if (Array.isArray(headCss)) {
      for (const css of headCss) {
        if (typeof css === "string" && css) {
          const absCss = css.startsWith("/") || css.startsWith(".") ? pathResolve(cwd, css) : pathResolve(cwd, css);
          cssList.push(absCss);
        }
      }
    }
    let cssCombined = "";
    for (const p of cssList) {
      try { cssCombined += (await Bun.file(p).text()) + "\n"; } catch {}
    }

    // Wrapper JS served as /_hipst/app.mjs
    const wrapper =
`// auto wrapper (in-memory)
import { mount } from "/_hipst/runtime.mjs";
import * as Mod from "/_hipst/app.entry.mjs";
const Root = ${ex ? `Mod[${JSON.stringify(ex)}]` : `Mod.default ?? Mod.App`};
const el = document.getElementById("__hipst_app__");
if (el && Root) mount(Root, el);
`;

    this.csrBuilt = {
      js: wrapper,
      entry: entryJs ?? "",
      runtime: runtimeJs ?? "",
      css: cssCombined || undefined,
      entryMap,
      runtimeMap,
    };
  }

  private injectCSR(html: string): string {
    return injectHtmlAssets(html, {
      hmr: { enabled: this.hmrEnabled, eventPath: "/_hipst/hmr" },
      csr: {
        scriptSrc: "/_hipst/app.mjs",
        cssHref: "/_hipst/app.css",
      },
    });
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

  listen(port: number, cb?: (server: Bun.Server) => void) {
    const forcedEnv = (process?.env?.HIPST_FORCE_PORT ?? "").trim();
    const forced = forcedEnv ? Number.parseInt(forcedEnv, 10) : NaN;
    const finalPort = Number.isFinite(forced) && forced > 0 ? forced : port;
    // Auto-enable HMR in dev via environment flag
    const hmrEnv = (process?.env?.HIPST_DEV_HMR ?? "").trim().toLowerCase();
    if (hmrEnv === "1" || hmrEnv === "true" || hmrEnv === "yes") this.enableHMR();
    // Prebuilt CSR asset directory (if provided by CLI build)
    {
      const dir = (process?.env?.HIPST_CSR_DIR ?? "").trim();
      if (dir) this.csrServeDir = pathResolve(process.cwd(), dir);
    }
    // Optional docs override file (JSON)
    {
      const docFile = (process?.env?.HIPST_DOCS_FILE ?? "").trim();
      if (docFile) {
        const abs = pathResolve(process.cwd(), docFile);
        Bun.file(abs).text().then((txt) => {
          try { this.setDocs(JSON.parse(txt)); } catch {}
        }).catch(() => {});
      }
    }
    this._server = Bun.serve({
      port: finalPort,
      fetch: async (req: Request) => {
        const url = new URL(req.url);
        const headers = req.headers;
        // Build shared response helpers and parse body once for server-level middleware
        const { statusFn, headerFn, resFn } = createResponseKit();
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => (query[k] = v));
        let body: any = await parseBody(req, headers);

        // Run server-level middlewares
        const locals: Record<string, any> = { statusFn, headerFn, resFn, query, body };
        // Reuse a single context object across middleware calls
        const mwCtx: any = {
          ...locals,
          req,
          url,
          query,
          param: {},
          header: headerFn,
          status: statusFn,
          res: resFn,
          body,
          headers,
          next: undefined as any,
        };
        const runServer = async (i: number): Promise<Finalish | undefined> => {
          if (i < this.middlewares.length) {
            const mw = this.middlewares[i]!;
            mwCtx.next = async (extra?: Record<string, any>) => {
              if (extra && typeof extra === "object") {
                Object.assign(locals, extra);
                Object.assign(mwCtx, extra);
              }
              return await runServer(i + 1);
            };
            return await mw(mwCtx);
          }
          return undefined;
        };
        const pre = await runServer(0);
        if (pre !== undefined) return toResponse(pre as any);
        // Serve internal docs JSON
        if (url.pathname === "/_hipst/docs.json") {
          const doc = this.docsOverride ?? { apis: this.apis.map((a) => a.describeDeep()) };
          return new Response(JSON.stringify(doc, null, 2), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }

        // SSE HMR endpoint
        if (this.hmrEnabled && url.pathname === "/_hipst/hmr") {
          const encoder = new TextEncoder();
          let sendRef: ((data: string) => void) | undefined;
          const stream = new ReadableStream<Uint8Array>({
            start: (controller) => {
              const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              sendRef = send;
              this.hmrClients.add(send);
              send("ready");
            },
            cancel: () => {
              if (sendRef) this.hmrClients.delete(sendRef);
            },
          });
          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Serve internal CSR assets
        const serveFromDisk = async (rel: string, type: string) => {
          if (!this.csrServeDir) return undefined;
          const full = pathResolve(this.csrServeDir, rel);
          const file = Bun.file(full);
          if (await file.exists()) {
            return new Response(file, { status: 200, headers: { "Content-Type": type } });
          }
          return new Response("Not Found", { status: 404 });
        };
        if (url.pathname === "/_hipst/app.mjs" || url.pathname === "/_hipst/app.js") {
          if (this.csrServeDir) {
            const r = await serveFromDisk("app.mjs", "application/javascript; charset=utf-8");
            if (r) return r;
          } else {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.js ?? "";
            return new Response(body, { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8" } });
          }
        }
        if (url.pathname === "/_hipst/app.entry.mjs") {
          if (this.csrServeDir) {
            const r = await serveFromDisk("app.entry.mjs", "application/javascript; charset=utf-8");
            if (r) return r;
          } else {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.entry ?? "";
            return new Response(body, { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8" } });
          }
        }
        if (url.pathname === "/_hipst/runtime.mjs") {
          if (this.csrServeDir) {
            const r = await serveFromDisk("runtime.mjs", "application/javascript; charset=utf-8");
            if (r) return r;
          } else {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.runtime ?? "";
            return new Response(body, { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8" } });
          }
        }
        if (url.pathname === "/_hipst/app.css") {
          if (this.csrServeDir) {
            const r = await serveFromDisk("app.css", "text/css; charset=utf-8");
            if (r) return r;
          } else {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.css ?? "";
            return new Response(body, { status: 200, headers: { "Content-Type": "text/css; charset=utf-8" } });
          }
        }
        if (url.pathname === "/_hipst/app.mjs.map" || url.pathname === "/_hipst/app.js.map") {
          if (this.csrServeDir) {
            const r = await serveFromDisk("app.mjs.map", "application/json; charset=utf-8");
            if (r) return r;
          } else {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.map ?? "";
            return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
          }
        }
        // Optional maps for auto mode
        if (url.pathname === "/_hipst/app.entry.mjs.map") {
          if (this.csrServeDir) {
            const r = await serveFromDisk("app.entry.mjs.map", "application/json; charset=utf-8");
            if (r) return r;
          } else {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.entryMap ?? "";
            return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
          }
        }
        if (url.pathname === "/_hipst/runtime.mjs.map") {
          if (this.csrServeDir) {
            const r = await serveFromDisk("runtime.mjs.map", "application/json; charset=utf-8");
            if (r) return r;
          } else {
            await this.ensureClientBuilt();
            const body = this.csrBuilt?.runtimeMap ?? "";
            return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
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
                // If request path already starts with the base segment, strip it to avoid duplication
                let rel: string;
                const basePrefix = "/" + base + "/";
                if (p.startsWith(basePrefix)) {
                  // remove '/<base>/' prefix; ensure relative path (no leading '/')
                  rel = p.slice(basePrefix.length);
                } else {
                  // drop leading '/'
                  rel = p.startsWith("/") ? p.slice(1) : p;
                }
                const full = pathResolve(process.cwd(), base, rel);
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
          const out = await api.dispatch(req, url, locals);
          if (out !== undefined) return toResponse(out);
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
    } as any);
    cb?.(this._server);
  }

  /** Stop the underlying Bun server (used by CLI watch restarts). */
  close(): void {
    try { (this._server as any)?.stop?.(); } catch {}
    this._server = undefined;
  }
}

export function server<T extends object = {}>(): Server<T> { return new Server() as unknown as Server<T> }