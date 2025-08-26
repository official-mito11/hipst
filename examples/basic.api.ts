import { api } from "../index.ts";

export const hello = api("/api/hello").get(({ res, query }) => res({ ok: true, q: query }));
