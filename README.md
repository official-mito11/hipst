# hipst

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.19. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Quick Start

```ts
import { route, server, html, ui } from "hipst";

// API
const hello = route("/api/hello").get(({ res, query }) => res({ ok: true, q: query }));

// UI
const App = html()
  .title("hipst demo")
  (
    ui("div")().flexCol().p(16)(
      ui("h1")("Hello hipst"),
      ui("p")("Welcome!")
    )
  );

new server().route(hello).route(App).listen(3000);
```

Run it:

```bash
bun run examples/basic.ts
# API:  http://localhost:3000/api/hello?q=123
# HTML: http://localhost:3000/
```

## FE-only Static Build

Generate a static HTML file (no server):

```bash
bun run examples/static.ts
# writes dist/static/index.html
```

## API Notes

- **Routing**: `api(path)` builds an API component. Public alias: `route`.
- **Server**: `new Server().route(node).listen(port)`; public alias: `server`.
- **Handlers**: `(ctx) => res(value)` where `ctx` includes `req`, `query`, `param`, `headers`, `status`, `header`, `res`, `body`.
- **UI**: `ui(tag)` and `html()` return fluent, chainable components: `.flexCol().p(16).textCenter()` etc.
- **Dynamic values**: any chained value can be a function of context, e.g. `.p((c) => c.state.padding)`.

## Reactivity & CSR

- **State** is a Proxy-based, callable facade. Initialize via function-call, then read/write via properties:

```ts
const App = html()(
  ui("button")
    .p(12)
    .onClick((c) => (c.state.count = (c.state.count ?? 0) + 1))
    (c => `Count: ${c.state.count ?? 0}`)
);

// initialize
(App.nth(0)!).state("count", 0);
```

- There is no `.stateSet(...)` helper; use the state property setter: `c.state.foo = 123`.
- For client-side reactivity, mount in the browser:

```ts
import { mount } from "hipst";
// ... define App as above
mount(App, document.getElementById("app")!);
```

> Note: SSR renders HTML by default. CSR mounting requires loading your app bundle in the browser and calling `mount(...)`. Hydration support can be added next.

## Migration

- `ApiComponent.handle(req, url)` was renamed to `dispatch(req, url)` to avoid conflict with `Component.handle()`.
