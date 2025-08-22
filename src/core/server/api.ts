import { Component } from "../comp";
import { HttpMethod } from "../http/types";
import { Finalish, FinalResult, ResponseBuilder, createResponseKit, type FinalResultOf } from "../http/response";
import { Middleware, MiddlewareContext } from "./middleware";
import { compilePath } from "./path";
import { parseBody } from "../http/body";
import { createClientFacade } from "./client";
import type { ApiClientOf } from "./client";

export type ApiContext<L extends object = {}> = {
  self: ApiComponent<any>;
  req: Request;
  query: Record<string, string>;
  param: Record<string, string>;
  header: (key: string | Record<string, string>, value?: string) => ResponseBuilder;
  status: (code: number) => ResponseBuilder;
  res: <T>(body: T) => FinalResultOf<T>;
  body: any;
  headers: Headers;
} & L;

// Middleware types imported from ./middleware

export type Handler<L extends object = {}> = (ctx: ApiContext<L>) => Promise<Finalish> | Finalish;

// Helpers: extract response type R from a handler's return type
type InferResFromFinalish<T> = T extends Promise<infer P>
  ? InferResFromFinalish<P>
  : T extends FinalResultOf<infer R>
    ? R
    : T;
type InferResFromHandler<H> = H extends (ctx: any) => infer Ret ? InferResFromFinalish<Ret> : unknown;

// Helper: Finalish with preserved body type via FinalResultOf
export type FinalishOf<T> = Promise<FinalResultOf<T> | T> | FinalResultOf<T> | T;

// Method type specs captured at the type level (phantom only)
export type GetSpec<
  Q = Record<string, any>,
  P = Record<string, string | number>,
  R = unknown
> = { query: Q; params: P; res: R };
export type PostSpec<
  Q = Record<string, any>,
  P = Record<string, string | number>,
  B = any,
  R = unknown
> = { query: Q; params: P; body: B; res: R };
export type PutSpec<
  Q = Record<string, any>,
  P = Record<string, string | number>,
  B = any,
  R = unknown
> = { query: Q; params: P; body: B; res: R };
export type PatchSpec<
  Q = Record<string, any>,
  P = Record<string, string | number>,
  B = any,
  R = unknown
> = { query: Q; params: P; body: B; res: R };
export type DeleteSpec<
  Q = Record<string, any>,
  P = Record<string, string | number>,
  R = unknown
> = { query: Q; params: P; res: R };
export type MethodSpec = {
  GET?: GetSpec<any, any, any>;
  POST?: PostSpec<any, any, any, any>;
  PUT?: PutSpec<any, any, any, any>;
  PATCH?: PatchSpec<any, any, any, any>;
  DELETE?: DeleteSpec<any, any, any>;
};

export type ApiDocNode = {
  path: string;
  methods: HttpMethod[];
  meta?: Record<string, any>;
  children: ApiDocNode[];
};

export class ApiComponent<L extends object = {}, M extends Partial<MethodSpec> = {}> extends Component {
  public readonly basePath: string;
  private handlers: Partial<Record<HttpMethod, Handler<L>>> = {};
  private children: ApiComponent<any>[] = [];
  private parent?: ApiComponent<any>;
  private middlewares: Array<Middleware<any, any>> = [];
  private _clientFacade?: any;
  public get client(): ApiClientOf<this> {
    // Lazily memoize to avoid re-creating facade; typing preserved via getter return type
    return (this._clientFacade ??= createClientFacade(this)) as ApiClientOf<this>;
  }
  // Perf caches (invalidated on mutations)
  private _fullPatternCache?: string;
  private _compiledCache?: ReturnType<typeof compilePath>;
  private _mwChainCache?: Array<Middleware<any, any>>;
  private _docMeta?: Record<string, any>;

  constructor(basePath: string) {
    super();
    this.basePath = basePath.startsWith("/") ? basePath : "/" + basePath;
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

  route(child: ApiComponent<any, any>): this {
    child.parent = this;
    this.children.push(child);
    // parent changed => child's pattern/chain depend on it
    child.invalidateCachesDeep();
    return this;
  }

  use<Add extends object>(mw: Middleware<L, Add>): ApiComponent<L & Add, M> {
    this.middlewares.push(mw as any);
    // adding middleware affects chain for self and descendants
    this.invalidateMwChainDeep();
    return this as unknown as ApiComponent<L & Add, M>;
  }

  /**
   * Attach free-form documentation metadata to this API node. Intended for docs generation.
   */
  doc(meta: Record<string, any>): this {
    this._docMeta = { ...(this._docMeta || {}), ...(meta || {}) };
    return this;
  }

  on(method: HttpMethod, handler: Handler<L>): this {
    this.handlers[method] = handler as any;
    return this;
  }

  // Typed HTTP methods capturing request/response types
  // Overload 0: infer R from handler return type (robust against generic ctx.res)
  get<H extends (ctx: ApiContext<L> & { query: Record<string, unknown>; param: Record<string, unknown> }) => any>(
    handler: H
  ): ApiComponent<L, M & { GET: GetSpec<unknown, unknown, InferResFromHandler<H>> }>;
  // Overload A: explicit Spec generic, res type in parameter position for inference
  get<S extends GetSpec<any, any, any>>(
    handler: (
      ctx: ApiContext<L> & {
        query: S["query"];
        param: S["params"];
        res: (body: S["res"]) => FinalResultOf<S["res"]>;
      }
    ) => FinalishOf<S["res"]>
  ): ApiComponent<L, M & { GET: S }>;
  // Overload B: infer or explicit with param order <Q, Pm, R>
  get<Q = unknown, Pm = unknown, R = unknown>(
    handler: (
      ctx: ApiContext<L> & {
        query: Q;
        param: Pm;
        res: (body: R) => FinalResultOf<R>;
      }
    ) => FinalishOf<R>
  ): ApiComponent<L, M & { GET: GetSpec<Q, Pm, R> }>;
  get(handler: any): any { return this.on("GET", handler as any) as any; }

  // Overload 0: infer R from handler return type (robust against generic ctx.res)
  post<H extends (ctx: ApiContext<L> & { body: unknown; query: Record<string, unknown>; param: Record<string, unknown> }) => any>(
    handler: H
  ): ApiComponent<L, M & { POST: PostSpec<unknown, unknown, unknown, InferResFromHandler<H>> }>;
  // Overload A: explicit Spec generic, res type in parameter position for inference
  post<S extends PostSpec<any, any, any, any>>(
    handler: (
      ctx: ApiContext<L> & {
        body: S["body"];
        query: S["query"];
        param: S["params"];
        res: (body: S["res"]) => FinalResultOf<S["res"]>;
      }
    ) => FinalishOf<S["res"]>
  ): ApiComponent<L, M & { POST: S }>;
  // Overload B: infer or explicit with param order <Q, Pm, B, R>
  post<Q = unknown, Pm = unknown, B = unknown, R = unknown>(
    handler: (
      ctx: ApiContext<L> & {
        body: B;
        query: Q;
        param: Pm;
        res: (body: R) => FinalResultOf<R>;
      }
    ) => FinalishOf<R>
  ): ApiComponent<L, M & { POST: PostSpec<Q, Pm, B, R> }>;
  post(handler: any): any { return this.on("POST", handler as any) as any; }

  // Overload 0: infer R from handler return type (robust against generic ctx.res)
  put<H extends (ctx: ApiContext<L> & { body: unknown; query: Record<string, unknown>; param: Record<string, unknown> }) => any>(
    handler: H
  ): ApiComponent<L, M & { PUT: PutSpec<unknown, unknown, unknown, InferResFromHandler<H>> }>;
  // Overload A: explicit Spec generic, res type in parameter position for inference
  put<S extends PutSpec<any, any, any, any>>(
    handler: (
      ctx: ApiContext<L> & {
        body: S["body"];
        query: S["query"];
        param: S["params"];
        res: (body: S["res"]) => FinalResultOf<S["res"]>;
      }
    ) => FinalishOf<S["res"]>
  ): ApiComponent<L, M & { PUT: S }>;
  // Overload B: infer or explicit with param order <Q, Pm, B, R>
  put<Q = unknown, Pm = unknown, B = unknown, R = unknown>(
    handler: (
      ctx: ApiContext<L> & {
        body: B;
        query: Q;
        param: Pm;
        res: (body: R) => FinalResultOf<R>;
      }
    ) => FinalishOf<R>
  ): ApiComponent<L, M & { PUT: PutSpec<Q, Pm, B, R> }>;
  put(handler: any): any { return this.on("PUT", handler as any) as any; }

  // Overload 0: infer R from handler return type (robust against generic ctx.res)
  patch<H extends (ctx: ApiContext<L> & { body: unknown; query: Record<string, unknown>; param: Record<string, unknown> }) => any>(
    handler: H
  ): ApiComponent<L, M & { PATCH: PatchSpec<unknown, unknown, unknown, InferResFromHandler<H>> }>;
  // Overload A: explicit Spec generic, res type in parameter position for inference
  patch<S extends PatchSpec<any, any, any, any>>(
    handler: (
      ctx: ApiContext<L> & {
        body: S["body"];
        query: S["query"];
        param: S["params"];
        res: (body: S["res"]) => FinalResultOf<S["res"]>;
      }
    ) => FinalishOf<S["res"]>
  ): ApiComponent<L, M & { PATCH: S }>;
  // Overload B: infer or explicit with param order <Q, Pm, B, R>
  patch<Q = unknown, Pm = unknown, B = unknown, R = unknown>(
    handler: (
      ctx: ApiContext<L> & {
        body: B;
        query: Q;
        param: Pm;
        res: (body: R) => FinalResultOf<R>;
      }
    ) => FinalishOf<R>
  ): ApiComponent<L, M & { PATCH: PatchSpec<Q, Pm, B, R> }>;
  patch(handler: any): any { return this.on("PATCH", handler as any) as any; }

  // Overload 0: infer R from handler return type (robust against generic ctx.res)
  delete<H extends (ctx: ApiContext<L> & { query: Record<string, unknown>; param: Record<string, unknown> }) => any>(
    handler: H
  ): ApiComponent<L, M & { DELETE: DeleteSpec<unknown, unknown, InferResFromHandler<H>> }>;
  // Overload A: explicit Spec generic, res type in parameter position for inference
  delete<S extends DeleteSpec<any, any, any>>(
    handler: (
      ctx: ApiContext<L> & {
        query: S["query"];
        param: S["params"];
        res: (body: S["res"]) => FinalResultOf<S["res"]>;
      }
    ) => FinalishOf<S["res"]>
  ): ApiComponent<L, M & { DELETE: S }>;
  // Overload B: infer or explicit with param order <Q, Pm, R>
  delete<Q = unknown, Pm = unknown, R = unknown>(
    handler: (
      ctx: ApiContext<L> & {
        query: Q;
        param: Pm;
        res: (body: R) => FinalResultOf<R>;
      }
    ) => FinalishOf<R>
  ): ApiComponent<L, M & { DELETE: DeleteSpec<Q, Pm, R> }>;
  delete(handler: any): any { return this.on("DELETE", handler as any) as any; }

  /** Return a documentation tree for this ApiComponent and its children. */
  describeDeep(): ApiDocNode {
    const methods: HttpMethod[] = Object.keys(this.handlers) as HttpMethod[];
    return {
      path: this.fullPattern(),
      methods,
      meta: this._docMeta ? { ...this._docMeta } : undefined,
      children: this.children.map((c) => c.describeDeep()),
    };
  }

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
