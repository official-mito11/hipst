# CLI

`hipst` exposes two primary commands via the bin in package.json.

- Serve

```text
hipst serve <AppFilePath[#Export]> [options]
  --csr                 CSR-only (no SSR body)
  --port, -p <number>   Port (default: 3000)
  --watch, -w           Hot reload (TBD)
```

Notes:
- Positional `AppFilePath[#Export]` is preferred. Legacy `--ui` and `--api` flags are still supported.
- With `--csr`, the server enables CSR-only mode via `server().csrAutoFrom(<path>, <export>).csrOnly()`; SSR body is replaced by an empty mount container.

- Build (alias: `fe-build`)

```text
hipst build <AppFilePath[#Export]> [options]
  --client              CSR-only HTML (default builds SSR HTML + CSR assets)
  --out <dir>           Output dir (default: dist/fe)
  --minify <bool>       Minify (default: true)
  --sourcemap <mode>    external|inline|none (default: external)
```

Notes:
- Default build renders SSR HTML and emits client assets. `--client` forces CSR-only HTML.
- For `--client`, do not specify `#Export`. The CLI loads `default` or falls back to `App`. If you do specify, it must be `#default`.
- Legacy explicit client entry is supported via `--csr <entry.ts>` but is deprecated in favor of auto synthesis.
- Export resolution: `#Export` overrides; otherwise uses `default` or `App`.
