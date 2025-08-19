import { Component } from "../comp";
import { ApiComponent, type Finalish, type FinalResult } from "./api";
import type { HtmlRoot } from "../ui/factory";
import { UIComponent } from "../ui/comp";
import { renderToString } from "../ui/render";

export class Server extends Component {
  private _server?: Bun.Server;
  private apis: ApiComponent[] = [];
  private uiRoot?: HtmlRoot | UIComponent;

  constructor() {
    super();
  }

  route(node: ApiComponent | HtmlRoot | UIComponent): this {
    if (node instanceof ApiComponent) this.apis.push(node);
    else this.uiRoot = node as any;
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