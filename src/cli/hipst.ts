#!/usr/bin/env bun
import { runFeBuild } from "./fe-build";
import { runServe } from "./serve";
import { runFullBuild } from "./full-build";

function usage() {
  console.log(`
Hipst CLI

Usage:
  hipst serve <ServerFilePath> [options]
    --port, -p <number>   Port
    --watch, -w           Hot reload (HMR)
    --csr <path>           Optional CSR entry override (auto if omitted)

  hipst build <AppFilePath> [options]
    --full                Integrated build: FE assets, compile-time docs, server runner
    --out <dir>           Output dir (default: dist/app)
    --sourcemap <mode>    external|inline|none (default: external)
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
