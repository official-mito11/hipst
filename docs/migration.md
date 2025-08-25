# Migration Notes

- CLI moved to positional specs:
  - `hipst serve <ServerFilePath>`
  - `hipst build <AppFilePath>`
  - Legacy flags are parsed but deprecated: `serve --ui/--api`, `build --app`
- SSR is always rendered and hydrated. CSR-only mode and explicit client entries (`--csr`) are removed.
- Server runtime assets are served under `/_hipst/*`.
- API handler entrypoint is `dispatch()` internally; use `.get/.post/...` to define handlers.
- UI runtime now clears SSR DOM before mounting to avoid duplicate nodes and leaked effects.
