import { expect, test, describe } from "bun:test";
import { runFeBuild } from "../src/cli/fe-build";
import { runFullBuild } from "../src/cli/full-build";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function makeTmpDir(suffix: string) {
  const d = join(tmpdir(), `hipst-cli-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}`);
  mkdirSync(d, { recursive: true });
  return d;
}

async function waitForOk(url: string, timeoutMs = 3500): Promise<Response> {
  const t0 = Date.now();
  let lastErr: any;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.ok || (r.status >= 200 && r.status < 400)) return r;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw lastErr || new Error(`timeout waiting for ${url}`);
}

async function waitForOutput(proc: Bun.Subprocess, re: RegExp, timeoutMs = 3000) {
  if (proc.stdout) {
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    let buf = "";
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((r) => setTimeout(() => r({ done: true }), 50)),
      ] as const) as ReadableStreamReadResult<Uint8Array> | { done: true; value?: undefined };
      if (done && !value) continue;
      if (value) buf += dec.decode(value);
      if (re.test(buf)) return buf;
    }
  }
}

describe("CLI fe-build", () => {
  test("builds SSR+CSR bundle and writes expected files", async () => {
    const out = makeTmpDir("fe");
    const appSpec = "examples/counter.app.ts#App";
    const argv = ["bun", "hipst", appSpec, "--out", out];
    await runFeBuild(argv);

    const indexHtml = join(out, "index.html");
    expect(existsSync(indexHtml)).toBe(true);
    const html = readFileSync(indexHtml, "utf-8");
    expect(html.includes('<script type="module" src="./app.mjs"></script>')).toBe(true);

    // Core JS artifacts
    expect(existsSync(join(out, "app.mjs"))).toBe(true);
    expect(existsSync(join(out, "app.entry.mjs"))).toBe(true);
    expect(existsSync(join(out, "runtime.mjs"))).toBe(true);

    // CSS may be absent if no headCss; maps are optional, so we don't assert
  });
});

describe("CLI full-build", () => {
  test("builds full bundle and server runner serves assets & docs", async () => {
    const out = makeTmpDir("full");
    const appSpec = "examples/counter.app.ts#App";
    const apiSpec = "examples/counter.api.ts#myApi";
    const argv = ["bun", "hipst", appSpec, "--api", apiSpec, "--out", out];
    await runFullBuild(argv);

    // Check files
    const runner = join(out, "server.mjs");
    expect(existsSync(runner)).toBe(true);
    const assets = join(out, "_hipst");
    expect(existsSync(join(assets, "app.mjs"))).toBe(true);
    expect(existsSync(join(assets, "app.entry.mjs"))).toBe(true);
    expect(existsSync(join(assets, "runtime.mjs"))).toBe(true);
    expect(existsSync(join(assets, "docs.json"))).toBe(true);

    // Start server
    const port = 4100 + Math.floor(Math.random() * 400);
    const proc = Bun.spawn({
      cmd: ["bun", runner],
      env: { ...process.env, PORT: String(port) },
      cwd: out,
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      // wait for startup log or first OK response, whichever comes first
      await Promise.race([
        waitForOutput(proc, /hipst \(full-build\):/),
        waitForOk(`http://127.0.0.1:${port}/`),
      ]);

      // Wait for server to respond
      const rootRes = await waitForOk(`http://127.0.0.1:${port}/`);
      const html = await rootRes.text();
      expect(html.includes('/_hipst/app.mjs')).toBe(true);

      const appJs = await waitForOk(`http://127.0.0.1:${port}/_hipst/app.mjs`);
      expect(appJs.status).toBe(200);

      const docsRes = await waitForOk(`http://127.0.0.1:${port}/_hipst/docs.json`);
      const docs = await docsRes.json();
      expect(typeof docs).toBe("object");
      expect(Array.isArray(docs?.methods) || Array.isArray((docs as any)?.apis)).toBe(true);
    } finally {
      try { proc.kill(); } catch {}
      // give the process a moment to terminate to avoid port reuse races across tests
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});
