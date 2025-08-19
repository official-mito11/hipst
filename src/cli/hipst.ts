#!/usr/bin/env bun
import { runFeBuild } from "./fe-build";
import { runServe } from "./serve";

function usage() {
  console.log(`
Hipst CLI

Usage:
  hipst build    --app <path>[#export] [--csr <clientEntry>] [--out <dir>] [--minify true|false] [--sourcemap external|inline|none] [--codegen-api <path>[#export]] [--codegen-out <file|dir>] [--codegen-base-url <url>]
  hipst fe-build (alias of build)
  hipst serve --ui <path>[#export] [--api <path>[#export]] [--csr <clientEntry>] [--port <number>]
`);
}

export async function main(argv: string[] = Bun.argv) {
  const cmd = argv[2];
  const forwarded = argv.slice(0, 2).concat(argv.slice(3));
  switch (cmd) {
    case "build":
      await runFeBuild(forwarded);
      return;
    case "fe-build":
      await runFeBuild(forwarded);
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
