import type { ResponseBuilder, Finalish, FinalResult, FinalResultOf } from "../http/response";

export type MiddlewareContext<L extends object = {}> = {
  req: Request;
  url: URL;
  query: Record<string, string>;
  param: Record<string, string>;
  header: (key: string | Record<string, string>, value?: string) => ResponseBuilder;
  status: (code: number) => ResponseBuilder;
  res: <T>(body: T) => FinalResultOf<T>;
  body: any;
  headers: Headers;
} & L;

export type Middleware<In extends object, Add extends object> = (
  ctx: MiddlewareContext<In> & { next: (extra?: Add) => Promise<Finalish | undefined> }
) => Promise<Finalish | undefined> | Finalish | undefined;

export function middleware<Add extends object = {}>(fn: Middleware<{}, Add>): Middleware<{}, Add>;
export function middleware<In extends object = {}, Add extends object = {}>(fn: Middleware<In, Add>): Middleware<In, Add>;
export function middleware(fn: any): any { return fn; }
