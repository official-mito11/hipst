import { Component } from "../comp";
import { HttpMethod } from "../http/types";
import { Finalish, FinalResult, ResponseBuilder, createResponseKit } from "../http/response";
import { Middleware, MiddlewareContext } from "./middleware";
import { compilePath } from "./path";
import { parseBody } from "../http/body";
import { createClientFacade, type ApiClient, type ApiClientRequestArgs } from "./client";

export type ApiContext<L extends object = {}> = {
  self: ApiComponent<any>;
  req: Request;
  query: Record<string, string>;
  param: Record<string, string>;
  header: (key: string | Record<string, string>, value?: string) => ResponseBuilder;
  status: (code: number) => ResponseBuilder;
  res: (body: any) => FinalResult;
  body: any;
  headers: Headers;
} & L;

// Middleware types imported from ./middleware

export type Handler<L extends object = {}> = (ctx: ApiContext<L>) => Promise<Finalish> | Finalish;

export class ApiComponent<L extends object = {}> extends Component {
  public readonly basePath: string;
  private handlers: Partial<Record<HttpMethod, Handler<L>>> = {};
  private children: ApiComponent<any>[] = [];
  private parent?: ApiComponent<any>;
  private middlewares: Array<Middleware<any, any>> = [];
  public readonly client: ApiClient;
  // Perf caches (invalidated on mutations)
  private _fullPatternCache?: string;
  private _compiledCache?: ReturnType<typeof compilePath>;
  private _mwChainCache?: Array<Middleware<any, any>>;

  constructor(basePath: string) {
    super();
    this.basePath = basePath.startsWith("/") ? basePath : "/" + basePath;
    this.client = createClientFacade(this as any);
  }

  private invalidateCachesDeep(): void {
    this._fullPatternCache = undefined;
    this._compiledCache = undefined;
    this._mwChainCache = undefined;
    for (const ch of this.children) ch.invalidateCachesDeep();
  }

  private invalidateMwChainDeep(): void {
    this._mwChainCache = undefined;
    for (const ch of this.children) ch.invalidateMwChainDeep();
  }

  route(child: ApiComponent<any>): this {
    child.parent = this;
    this.children.push(child);
    // parent changed => child's pattern/chain depend on it
    child.invalidateCachesDeep();
    return this;
  }

  use<Add extends object>(mw: Middleware<L, Add>): ApiComponent<L & Add> {
    this.middlewares.push(mw as any);
    // adding middleware affects chain for self and descendants
    this.invalidateMwChainDeep();
    return this as unknown as ApiComponent<L & Add>;
  }

  on(method: HttpMethod, handler: Handler<L>): this {
    this.handlers[method] = handler as any;
    return this;
  }

  get(handler: Handler<L>): this { return this.on("GET", handler); }
  post(handler: Handler<L>): this { return this.on("POST", handler); }
  put(handler: Handler<L>): this { return this.on("PUT", handler); }
  patch(handler: Handler<L>): this { return this.on("PATCH", handler); }
  delete(handler: Handler<L>): this { return this.on("DELETE", handler); }

  public fullPattern(): string {
    if (this._fullPatternCache) return this._fullPatternCache;
    const parts: string[] = [];
    let p: ApiComponent<any> | undefined = this as any;
    const stack: string[] = [];
    while (p) { stack.push(p.basePath); p = p.parent; }
    for (let i = stack.length - 1; i >= 0; i--) parts.push(stack[i]!);
    const joined = parts.join("") || "/";
    this._fullPatternCache = joined;
    return joined;
  }

  match(pathname: string): { matched: boolean; params: Record<string, string> } {
    const compiled = this._compiledCache || (this._compiledCache = compilePath(this.fullPattern()));
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

  private collectMiddlewares(): Array<Middleware<any, any>> {
    if (this._mwChainCache) return this._mwChainCache;
    const chain: Array<Middleware<any, any>> = [];
    const stack: ApiComponent<any>[] = [];
    let p: ApiComponent<any> | undefined = this;
    while (p) { stack.push(p); p = p.parent; }
    for (let i = stack.length - 1; i >= 0; i--) {
      const n = stack[i]!;
      for (const mw of (n as any).middlewares as Array<Middleware<any, any>>) chain.push(mw);
    }
    this._mwChainCache = chain;
    return chain;
  }

  async dispatch(req: Request, url: URL, inheritedLocals?: Record<string, any>): Promise<Finalish | undefined> {
    const path = url.pathname;
    // Check self
    const selfMatch = this.match(path);
    if (selfMatch.matched) {
      const handler = this.handlers[req.method as HttpMethod];
      if (handler) {
        const { statusFn, headerFn, resFn } = (inheritedLocals && (inheritedLocals as any).statusFn && (inheritedLocals as any).headerFn)
          ? { statusFn: (inheritedLocals as any).statusFn, headerFn: (inheritedLocals as any).headerFn, resFn: (inheritedLocals as any).resFn }
          : createResponseKit();
        const inheritedQuery = (inheritedLocals && (inheritedLocals as any).query) as Record<string, string> | undefined;
        const query: Record<string, string> = inheritedQuery ? inheritedQuery : (() => {
          const q: Record<string, string> = {};
          url.searchParams.forEach((v, k) => (q[k] = v));
          return q;
        })();
        const headers = req.headers;
        let body: any = (inheritedLocals && (inheritedLocals as any).body !== undefined)
          ? (inheritedLocals as any).body
          : undefined;
        if (body === undefined) body = await parseBody(req, headers);
        const base = {
          self: this,
          req,
          query,
          param: selfMatch.params,
          header: headerFn,
          status: statusFn,
          res: resFn,
          body,
          headers,
        } as const;

        const mwBase = {
          req,
          url,
          query,
          param: selfMatch.params,
          header: headerFn,
          status: statusFn,
          res: resFn,
          body,
          headers,
        } as const;

        const chain = this.collectMiddlewares();
        const locals: Record<string, any> = { ...(inheritedLocals || {}) };
        // Reuse one object per chain
        const mwCtx: any = { ...mwBase, ...locals, next: undefined as any };

        const run = async (i: number): Promise<Finalish | undefined> => {
          if (i < chain.length) {
            const mw = chain[i]!;
            mwCtx.next = async (extra?: Record<string, any>) => {
              if (extra && typeof extra === "object") {
                Object.assign(locals, extra);
                Object.assign(mwCtx, extra);
              }
              return await run(i + 1);
            };
            return await mw(mwCtx);
          }
          const finalCtx = { ...(locals as any), ...base } as any;
          return await handler(finalCtx);
        };
        return await run(0);
      }
    }
    // Check children
    for (const ch of this.children) {
      const out = await ch.dispatch(req, url, inheritedLocals);
      if (out !== undefined) return out;
    }
    return undefined;
  }
}

export function api(path: string) {
  return new ApiComponent(path);
}
