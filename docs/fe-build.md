# Frontend Build

`hipst build` (alias: `fe-build`) renders SSR HTML and emits CSR assets by default.

- Positional app spec: `<AppFilePath>`.
- Output directory: `--out <dir>` (default: `dist/fe`).
- Flags: `--sourcemap external|inline|none`.
- Minification is always enabled.
- CSR runtime is always injected; CSR-only mode is removed.

## Outputs (auto mode)

- `index.html`
- `app.entry.mjs` (+ `.map`)
- `runtime.mjs` (+ `.map`)
- `app.mjs` wrapper that imports the two above and calls `mount()`
- `app.css` if any CSS paths were declared via a root `headCss` array or `headCss()` method

## Root resolution

- Uses the module's default export if present; otherwise `App`.
