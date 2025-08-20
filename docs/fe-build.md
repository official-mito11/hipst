# Frontend Build

`hipst build` (alias: `fe-build`) renders SSR HTML and emits CSR assets by default.

- Positional app spec: `<AppFilePath[#Export]>`.
- Output directory: `--out <dir>` (default: `dist/fe`).
- Flags: `--minify`, `--sourcemap external|inline|none`.
- CSR-only HTML: `--client`.
- Legacy explicit CSR entry: `--csr <path/to/entry.ts>` (deprecated).

## Outputs (auto mode)

- `index.html`
- `app.entry.mjs` (+ `.map`)
- `runtime.mjs` (+ `.map`)
- `app.mjs` wrapper that imports the two above and calls `mount()`
- `app.css` if any CSS paths were declared via `HtmlRoot.css()`

## Export resolution

- If `#Export` is provided in the spec, that symbol is used.
- Otherwise `default` is preferred; if missing, `App` is used.
