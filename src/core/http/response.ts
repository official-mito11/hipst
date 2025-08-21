export type Finalish = Response | FinalResult | BodyInit | object | null | undefined;

export interface FinalResult {
  __hipst_final: true;
  status: number;
  headers: Record<string, string>;
  body: BodyInit | null;
}

// Type helper that preserves the response body type at the type level only.
// Runtime shape is still FinalResult; __type is never emitted.
export type FinalResultOf<T> = FinalResult & { __type?: T };

export interface ResponseBuilder {
  status: (code: number) => ResponseBuilder;
  header: (key: string | Record<string, string>, value?: string) => ResponseBuilder;
  res: <T>(body: T) => FinalResultOf<T>;
}

export function createResponseKit(initStatus = 200, initHeaders: Record<string, string> = {}) {
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
      else if (
        body instanceof Blob ||
        body instanceof ArrayBuffer ||
        body instanceof ReadableStream ||
        typeof body === "string"
      ) out = body as any;
      else {
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

export function toResponse(out: Finalish): Response {
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
