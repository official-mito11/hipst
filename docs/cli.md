# CLI

`hipst` exposes two primary commands via the bin in package.json.

- Serve

```text
hipst serve <ServerFilePath> [options]
  --port, -p <number>   Port (default: 3000)
  --watch, -w           Hot reload (HMR)
```

Notes:
- Positional `ServerFilePath` is preferred. Legacy `--ui` and `--api` flags are still parsed but deprecated.
- SSR is always rendered and hydrated with the client runtime; CSR-only mode has been removed.

- Build (alias: `fe-build`)

```text
hipst build <AppFilePath> [options]
  --out <dir>           Output dir (default: dist/fe)
  --sourcemap <mode>    external|inline|none (default: external)
  --full                Integrated build: FE assets, compile-time docs, server runner
```

Notes:
- Default build renders SSR HTML and emits client assets; client runtime is always injected.
- Minification is always enabled.
- Root resolution: default export or `App`.

- Full build

```text
hipst full-build <AppFilePath> [options]
  --api <ApiFile>            Optional legacy API module to include
  --out <dir>                Output dir (default: dist/full)
  --sourcemap <mode>         external|inline|none (default: external)
```

Notes:
- Writes a runnable `server.mjs` that serves prebuilt CSR assets and routes the UI (and optional API).
- Also emits compile-time docs (`_hipst/docs.json`) when possible.
