# SSR and CSR

- SSR is the default. Rendering is handled by `renderToString()` for both `HtmlRoot` and `UIComponent` trees.
- When CSR is enabled, the server or builder injects:
  - `<link rel="stylesheet" href=".../app.css">` if CSS is present
  - `<script type="module" src=".../app.mjs"></script>`
- The body is wrapped in a mount container `#__hipst_app__` so the runtime can attach and update the DOM.

## Server-side CSR

- CSR is auto-enabled when you route a UI root via `server().route(App)`.
- The server serves runtime assets from internal paths:
  - `/_hipst/app.mjs` (wrapper)
  - `/_hipst/app.entry.mjs` (UI module bundle)
  - `/_hipst/runtime.mjs` (runtime bundle)
  - `/_hipst/app.css` (concatenated from `HtmlRoot.css()`)
  - optional source maps under `/_hipst/*.map`
- CSR-only mode has been removed. SSR + hydration is always used.

## Build-time CSR

- `hipst build` produces:
  - `index.html` with SSR markup (or empty body for `--client`)
  - `app.mjs` wrapper that mounts the app on load
  - `runtime.mjs`, `app.entry.mjs` and their source maps
  - optional `app.css` if `HtmlRoot.css()` declared paths
- Explicit client entries and `--csr` flags were removed; the builder synthesizes the client runtime automatically.

## Runtime mount

- The client runtime `mount()` clears any SSR content under the container before mounting and registers reactive effects for attributes, styles, events, and text nodes.
