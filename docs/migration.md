# Migration Notes

- CLI moved to positional app spec: `hipst serve <AppFile[#Export]>` and `hipst build <AppFile[#Export]>`.
  - Legacy flags are still accepted: `--ui`, `--api`, and build `--app`, `--csr <entry>`.
- CSR is synthesized from the UI module by default. Explicit client entries are optional.
- Server runtime assets are served under `/_hipst/*`.
- API handler entrypoint is `dispatch()` internally; use `.get/.post/...` to define handlers.
- UI runtime now clears SSR DOM before mounting to avoid duplicate nodes and leaked effects.
