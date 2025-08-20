# Getting Started

- Requirements: Bun >= 1.2, TypeScript >= 5.9.
- Install deps:

```bash
bun install
```

- Serve an app (SSR by default, CSR auto-injected when needed):

```bash
bun run hipst serve examples/counter.app.ts#App --port 3000
```

- Build static output (SSR HTML + CSR assets by default):

```bash
bun run hipst build examples/counter.app.ts#App --out dist/counter-fe
```

- CSR-only build (no SSR body; client mounts into an empty container):

```bash
bun run hipst build examples/counter.app.ts --client --out dist/counter-fe-client
```

Note: `--client` requires the app to be exported as default (do not specify `#Export`).

- Minimal app example:

```ts
import { html, ui } from "hipst";

export const App = html()
  .title("Hello Hipst")
  .meta("description", "Minimal example")
  (
    ui("div").p(24)(
      ui("h1")("Hello Hipst"),
      ui("button")
        .state("count", 0)
        .onClick(({ self }) => { self.state.count++; })
        (({ self }) => `Clicked ${self.state.count} times`)
    )
  );
```

- Optional API example:

```ts
import { api } from "hipst";
export const hello = api("/hello").get(({ res }) => res({ ok: true }));
```

- Serve both UI and API (legacy flags still supported):

```bash
bun run hipst serve app.ts#App --api api.ts#hello --port 3000
```
