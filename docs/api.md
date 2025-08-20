# API

Create API routes with `api("/base")` which returns an `ApiComponent`.

- HTTP methods: `.get(handler)`, `.post(handler)`, `.put(handler)`, `.patch(handler)`, `.delete(handler)`.
- Nesting: `.route(child)` to compose sub-routes.
- Middleware: `.use(mw)` where `mw` can add typed locals to the context.

## Handler context

```ts
import { api } from "hipst";

export const users = api("/users").get(({ query, param, headers, body, status, header, res }) => {
  return res({ ok: true });
});
```

`ApiContext` fields:
- `self` (the current `ApiComponent`)
- `req`, `headers`
- `query`, `param`
- `body` (parsed once per request)
- `status()`, `header()`, `res()` helpers (from response kit)

Middleware context adds:
- `url` (the parsed `URL` for the request)
- `next(extra?)` to continue the chain and optionally add locals to subsequent middleware/handler context

## Middleware

```ts
import { middleware, type MiddlewareContext } from "hipst";

const auth = middleware<{ user?: { id: string } }>(async (ctx) => {
  const token = ctx.headers.get("authorization");
  if (!token) return ctx.status(401).res({ error: "unauthorized" });
  return ctx.next({ user: { id: "u1" } });
});

export const me = api("/me").use(auth).get(({ user, res }) => res({ id: user!.id }));
```

## Client facade

Every `ApiComponent` exposes `client` with `get/delete/post/put/patch`:

```ts
const data = await users.client.get({
  params: { id: 1 },
  query: { q: "name" },
  baseUrl: "", // optional override
  headers: { Authorization: "Bearer ..." },
});
```

- JSON bodies are auto-serialized unless you pass a raw `BodyInit` (FormData, Blob, string, etc.).
- Non-2xx responses throw with status and response text.
