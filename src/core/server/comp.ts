import { Component } from "../comp";
import { ApiComponent, type Finalish, type FinalResult } from "./api";
import type { HtmlRoot } from "../ui/factory";
import { UIComponent } from "../ui/comp";
import { renderToString } from "../ui/render";
import { resolve as pathResolve, normalize as pathNormalize } from "path";

export class Server extends Component {
  private _server?: Bun.Server;
  private apis: ApiComponent[] = [];
  private uiRoot?: HtmlRoot | UIComponent;
  private statics: Array<{ mount: string; dir: string }> = [];

  constructor() {
    super();
  }

  route(node: ApiComponent | HtmlRoot | UIComponent): this {
    if (node instanceof ApiComponent) this.apis.push(node);
    else this.uiRoot = node as any;
    return this;
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

  listen(port: number) {
    this._server = Bun.serve({
      port: port,
      fetch: async (req) => {
        const url = new URL(req.url);
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
          const html = renderToString(this.uiRoot);
          return new Response(html, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        return new Response("Not Found", { status: 404 });
      },
    });
  }
}

export function server(): Server {
  return new Server();
}