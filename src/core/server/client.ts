import { HttpMethod } from "../http/types";
import { applyParams } from "./path";
import type { ApiComponent } from "./api";

export interface ApiClientRequestArgs {
  params?: Record<string, string | number>;
  query?: Record<string, any>;
  body?: any;
  init?: RequestInit;
  baseUrl?: string; // optional override base URL (default: same origin)
  headers?: HeadersInit;
}

export interface ApiClient {
  get(args?: Omit<ApiClientRequestArgs, "body">): Promise<any>;
  delete(args?: Omit<ApiClientRequestArgs, "body">): Promise<any>;
  post(args?: ApiClientRequestArgs): Promise<any>;
  put(args?: ApiClientRequestArgs): Promise<any>;
  patch(args?: ApiClientRequestArgs): Promise<any>;
}

export function createClientFacade(node: ApiComponent<any>): ApiClient {
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

  return {
    get: (args?: Omit<ApiClientRequestArgs, "body">) => call("GET", args as any),
    delete: (args?: Omit<ApiClientRequestArgs, "body">) => call("DELETE", args as any),
    post: (args?: ApiClientRequestArgs) => call("POST", args),
    put: (args?: ApiClientRequestArgs) => call("PUT", args),
    patch: (args?: ApiClientRequestArgs) => call("PATCH", args),
  };
}
