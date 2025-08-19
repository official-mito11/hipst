import { Component } from "../comp";
import type { Context } from "../context";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export interface ApiContext<C extends ApiComponent> extends Context<C> {
  req: Request;
  query: Record<string, string>;
  param: Record<string, string>;
  header: (key: string | Record<string, string>, value?: string) => ResponseBuilder;
  status: (code: number) => ResponseBuilder;
  res: (body: any) => FinalResult;
  body: any;
  headers: Headers;
}

export type Handler<C extends ApiComponent> = (ctx: ApiContext<C>) => Promise<Finalish> | Finalish;

export type Finalish = Response | FinalResult | BodyInit | object | null | undefined;

export interface FinalResult {
  __hipst_final: true;
  status: number;
  headers: Record<string, string>;
  body: BodyInit | null;
}

export interface ResponseBuilder {
  status: (code: number) => ResponseBuilder;
  header: (key: string | Record<string, string>, value?: string) => ResponseBuilder;
  res: (body: any) => FinalResult;
}

function createResponseKit(initStatus = 200, initHeaders: Record<string, string> = {}): {
  statusFn: (code: number) => ResponseBuilder;
  headerFn: (key: string | Record<string, string>, value?: string) => ResponseBuilder;
  resFn: (body: any) => FinalResult;
} {
  let status = initStatus;
  const headers: Record<string, string> = { ...initHeaders };
  const builder: ResponseBuilder = {
    status(c: number) {
      status = c;
      return builder;
    },
    header(key: string | Record<string, string>, value?: string) {
      if (typeof key === "string") headers[key] = value ?? "";
      else Object.assign(headers, key);
      return builder;
    },
    res(body: any): FinalResult {
      let out: BodyInit | null = null;
      if (body === null || body === undefined) out = null;
      else if (body instanceof Blob || body instanceof ArrayBuffer || body instanceof ReadableStream || typeof body === "string") out = body as any;
      else {
        // default JSON
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        out = JSON.stringify(body);
      }
      return { __hipst_final: true, status, headers, body: out };
    },
  };
  return {
    statusFn: (c: number) => builder.status(c),
    headerFn: (k: any, v?: any) => builder.header(k, v),
    resFn: (b: any) => builder.res(b),
  };
}

function compilePath(pattern: string) {
  const parts = pattern.split("/").filter(Boolean);
  const keys: string[] = [];
  const regexParts = parts.map((p) => {
    if (p.startsWith(":")) {
      keys.push(p.slice(1));
      return "([^/]+)";
    }
    return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  const regex = new RegExp("^/" + regexParts.join("/") + "/*$");
  return { regex, keys };
}

export class ApiComponent extends Component {
  public readonly basePath: string;
  private handlers: Partial<Record<HttpMethod, Handler<any>>> = {};
  private children: ApiComponent[] = [];
  private parent?: ApiComponent;

  constructor(basePath: string) {
    super();
    this.basePath = basePath.startsWith("/") ? basePath : "/" + basePath;
  }

  route(child: ApiComponent): this {
    child.parent = this;
    this.children.push(child);
    return this;
  }

  on(method: HttpMethod, handler: Handler<this>): this {
    this.handlers[method] = handler as any;
    return this;
  }

  get(handler: Handler<this>): this { return this.on("GET", handler); }
  post(handler: Handler<this>): this { return this.on("POST", handler); }
  put(handler: Handler<this>): this { return this.on("PUT", handler); }
  patch(handler: Handler<this>): this { return this.on("PATCH", handler); }
  delete(handler: Handler<this>): this { return this.on("DELETE", handler); }

  private fullPattern(): string {
    const parts: string[] = [];
    let p: ApiComponent | undefined = this;
    const stack: string[] = [];
    while (p) { stack.push(p.basePath); p = p.parent; }
    for (let i = stack.length - 1; i >= 0; i--) parts.push(stack[i]!);
    const joined = parts.join("");
    return joined || "/";
  }

  match(pathname: string): { matched: boolean; params: Record<string, string> } {
    const compiled = compilePath(this.fullPattern());
    const m = compiled.regex.exec(pathname);
    if (!m) return { matched: false, params: {} };
    const params: Record<string, string> = {};
    for (let i = 0; i < compiled.keys.length; i++) {
      const key = compiled.keys[i];
      const val = m[i + 1];
      if (key !== undefined && val !== undefined) params[key] = decodeURIComponent(val!);
    }
    return { matched: true, params };
  }

  async dispatch(req: Request, url: URL): Promise<Finalish | undefined> {
    const path = url.pathname;
    // Check self
    const selfMatch = this.match(path);
    if (selfMatch.matched) {
      const handler = this.handlers[req.method as HttpMethod];
      if (handler) {
        const { statusFn, headerFn, resFn } = createResponseKit();
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => (query[k] = v));
        const headers = req.headers;
        let body: any = undefined;
        try {
          const contentType = headers.get("content-type") || "";
          if (contentType.includes("application/json")) body = await req.json();
          else if (contentType.includes("text/")) body = await req.text();
          else body = await req.arrayBuffer();
        } catch {}
        const ctx: ApiContext<this> = {
          self: this,
          req,
          query,
          param: selfMatch.params,
          header: headerFn,
          status: statusFn,
          res: resFn,
          body,
          headers,
        } as any;
        return await handler(ctx);
      }
    }
    // Check children
    for (const ch of this.children) {
      const out = await ch.dispatch(req, url);
      if (out !== undefined) return out;
    }
    return undefined;
  }
}

export function api(path: string) {
  return new ApiComponent(path);
}
