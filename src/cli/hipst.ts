#!/usr/bin/env bun
import { runFeBuild } from "./fe-build";
import { runServe } from "./serve";
import { runFullBuild } from "./full-build";

function usage() {
  console.log(`
Hipst CLI

Usage:
  hipst serve <AppFilePath[#Export]> [options]
    --csr                 Use CSR-only (no SSR body)
    --port, -p <number>   Port
    --watch, -w           Hot reload (HMR)

  hipst build <AppFilePath[#Export]> [options]
    --client              Build as FE client (default builds SSR HTML + CSR assets)
    --full                Integrated build: FE assets, compile-time docs, server runner
    --out <dir>           Output dir (default: dist/fe)
    --minify <bool>       Minify (default: true)
    --sourcemap <mode>    external|inline|none (default: external)

  hipst full-build <AppFilePath[#Export]> [options]
    --api <ApiFile[#Export]>   Optional legacy API module to include
    --out <dir>                Output dir (default: dist/full)
    --minify <bool>            Minify (default: true)
    --sourcemap <mode>         external|inline|none (default: external)

  Notes:
    - Legacy flags are still supported: serve --ui/--api ..., build --app ...
  `);
}

export async function main(argv: string[] = Bun.argv) {
  const cmd = argv[2];
  const forwarded = argv.slice(0, 2).concat(argv.slice(3));
  switch (cmd) {
    case "build":
      if (argv.includes("--full")) await runFullBuild(forwarded);
      else await runFeBuild(forwarded);
      return;
    case "fe-build":
      await runFeBuild(forwarded);
      return;
    case "full-build":
      await runFullBuild(forwarded);
      return;
    case "serve":
      await runServe(forwarded);
      return;
    case "help":
    case undefined:
    default:
      usage();
      return;
  }
}

if (import.meta.main) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
