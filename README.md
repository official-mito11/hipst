# Hipst

**This project is not ready for production use. Please use with caution. Official release is expected in December 2025.**

[![DeepWiki](https://img.shields.io/badge/DeepWiki-Explore-blue)](https://deepwiki.com/official-mito11/hipst)

<p align="center">
  <img src="assets/icon.svg" alt="hipst logo" width="80" height="80" />
</p>

<p align="center">
  <b>Tiny Bun‑first full‑stack framework</b> — build UI (SSR/CSR) and APIs with one type‑safe DSL.
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.2%2B-black?logo=bun&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9%2B-3178C6?logo=typescript&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## Navigate
- Getting Started: `docs/getting-started.md`
- CLI: `docs/cli.md`
- SSR/CSR: `docs/ssr-csr.md`
- FE‑only Build: `docs/fe-build.md`
- API: `docs/api.md`
- UI DSL: `docs/ui.md`
- Migration: `docs/migration.md`

## Why hipst?
- Minimal, Bun‑native. Zero config, instant startup.
- One DSL for everything. Compose UI and API as components.
- SSR by default, CSR auto‑mounted. CSR‑only mode removed.
- Type‑safe styles (csstype) and stateful, reactive UI primitives.
- Tiny client: auto‑generated assets and optional API client helpers.

## Requirements
- Bun 1.2+
- TypeScript 5.9+

## Quick start
```bash
# Install deps
bun install

# Run an example server (SSR + CSR assets)
hipst serve examples/counter.ts --port 3000

# Build (SSR HTML + CSR assets): emits index.html + app.mjs (+ app.css) and supporting bundles
hipst build examples/counter.app.ts --out dist/counter-fe
```

## Usage

Create `main.ts`:

```ts
import { server, api, html, ui } from "hipst";

const App = html()
.title("Hello Hipst")
.meta("description", "Minimal example")
(
  ui("div").padding(24)(
    ui("h1")("Hello Hipst"),
    ui("button")
      .state("count", 0)
      .onClick(({ state }) => { state.count++; })
      (({ state }) => `Clicked ${state.count} times`)
  )
);

const Api = api("/api")
.get(({ res }) => res("Hello Hipst"))

server()
.route(Api)
.route(App)
.listen(3000, () => console.log("server is running on *:3000"))
```

Serve locally:

```bash
hipst serve app.ts
```

Build static assets (SSR HTML + CSR assets):

```bash
hipst build app.ts --out dist/app
```

---

## More
- Explore: https://deepwiki.com/official-mito11/hipst
- Scripts: see `package.json` for runnable examples (e.g., `example:counter`, `example:static`).
