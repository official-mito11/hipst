import { HttpMethod } from "../http/types";
import { applyParams } from "./path";
import type { ApiComponent, MethodSpec } from "./api";

export interface ApiClientRequestArgs {
  params?: Record<string, string | number>;
  query?: Record<string, any>;
  body?: any;
  init?: RequestInit;
  baseUrl?: string; // optional override base URL (default: same origin)
  headers?: HeadersInit;
}

type InferGetArgs<S> = Omit<ApiClientRequestArgs, "body" | "params" | "query"> & {
  params?: S extends { params: infer P } ? P : Record<string, any>;
  query?: S extends { query: infer Q } ? Q : Record<string, any>;
};

type InferPostArgs<S> = Omit<ApiClientRequestArgs, "params" | "query" | "body"> & {
  params?: S extends { params: infer P } ? P : Record<string, any>;
  query?: S extends { query: infer Q } ? Q : Record<string, any>;
  body?: S extends { body: infer B } ? B : unknown;
};

type InferPutArgs<S> = Omit<ApiClientRequestArgs, "params" | "query" | "body"> & {
  params?: S extends { params: infer P } ? P : Record<string, any>;
  query?: S extends { query: infer Q } ? Q : Record<string, any>;
  body?: S extends { body: infer B } ? B : unknown;
};

type InferPatchArgs<S> = Omit<ApiClientRequestArgs, "params" | "query" | "body"> & {
  params?: S extends { params: infer P } ? P : Record<string, any>;
  query?: S extends { query: infer Q } ? Q : Record<string, any>;
  body?: S extends { body: infer B } ? B : unknown;
};

type InferDeleteArgs<S> = Omit<ApiClientRequestArgs, "body" | "params" | "query"> & {
  params?: S extends { params: infer P } ? P : Record<string, any>;
  query?: S extends { query: infer Q } ? Q : Record<string, any>;
};

type MethodsOf<N> = N extends ApiComponent<any, infer M> ? M : Partial<MethodSpec>;

export type ApiClientOf<N extends ApiComponent<any, any>> = MethodsOf<N> extends infer M
  ? (M extends { GET: infer G }
      ? { get: (args?: InferGetArgs<G>) => Promise<G extends { res: infer R } ? R : unknown> }
      : {})
    &
    (M extends { POST: infer H }
      ? { post: (args?: InferPostArgs<H>) => Promise<H extends { res: infer R } ? R : unknown> }
      : {})
    &
    (M extends { PUT: infer U }
      ? { put: (args?: InferPutArgs<U>) => Promise<U extends { res: infer R } ? R : unknown> }
      : {})
    &
    (M extends { PATCH: infer P }
      ? { patch: (args?: InferPatchArgs<P>) => Promise<P extends { res: infer R } ? R : unknown> }
      : {})
    &
    (M extends { DELETE: infer D }
      ? { delete: (args?: InferDeleteArgs<D>) => Promise<D extends { res: infer R } ? R : unknown> }
      : {})
  : never;

export function createClientFacade<N extends ApiComponent<any, any>>(node: N): ApiClientOf<N> {
  const getPattern = () => node.fullPattern();

  const buildUrl = (method: HttpMethod, args?: ApiClientRequestArgs): string => {
    const pat = applyParams(getPattern(), args?.params);
    const base = args?.baseUrl ? String(args.baseUrl).replace(/\/$/, "") : "";
    const url = base + pat;
    const query = args?.query || {};
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((it) => usp.append(k, String(it)));
      else usp.append(k, String(v));
    }
    const qs = usp.toString();
    return qs ? url + (url.includes("?") ? "&" : "?") + qs : url;
  };

  const parseBody = async (res: Response): Promise<any> => {
    if (res.status === 204) return null;
    const ct = res.headers.get("content-type") || "";
    if (/application\/json/i.test(ct)) return await res.json();
    return await res.text();
  };

  const call = async (method: HttpMethod, args?: ApiClientRequestArgs): Promise<any> => {
    const url = buildUrl(method, args);
    const headers = new Headers(args?.headers || {});
    let bodyInit: BodyInit | undefined = undefined;
    const hasBody = args && Object.prototype.hasOwnProperty.call(args, "body");
    if (hasBody) {
      const b = (args as any).body;
      if (
        b instanceof Blob ||
        b instanceof ArrayBuffer ||
        b instanceof FormData ||
        typeof b === "string" ||
        (typeof ReadableStream !== "undefined" && b instanceof ReadableStream)
      ) bodyInit = b as any;
      else { headers.set("Content-Type", headers.get("Content-Type") || "application/json"); bodyInit = JSON.stringify(b); }
    }
    const init: RequestInit = { ...(args?.init || {}), method, body: bodyInit, headers } as any;
    const fetcher = (globalThis as any).fetch as typeof fetch;
    if (typeof fetcher !== "function") throw new Error("global fetch is not available");
    const res = await fetcher(url, init);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(method + " " + getPattern() + " failed: " + res.status + " " + res.statusText + (txt ? ("\n" + txt) : ""));
    }
    return parseBody(res);
  };

  const out: any = {
    get: (args?: Omit<ApiClientRequestArgs, "body">) => call("GET", args as any),
    post: (args?: ApiClientRequestArgs) => call("POST", args),
    put: (args?: ApiClientRequestArgs) => call("PUT", args),
    patch: (args?: ApiClientRequestArgs) => call("PATCH", args),
    delete: (args?: Omit<ApiClientRequestArgs, "body">) => call("DELETE", args as any),
  };
  return out as ApiClientOf<N>;
}
