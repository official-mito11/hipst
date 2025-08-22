import { describe, test, expect } from "bun:test";
import { runFeBuild } from "../src/cli/fe-build";
import { runFullBuild } from "../src/cli/full-build";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function makeTmpDir(suffix: string) {
  const d = join(tmpdir(), `hipst-build-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}`);
  mkdirSync(d, { recursive: true });
  return d;
}

async function waitForOk(url: string, timeoutMs = 3500): Promise<Response> {
  const t0 = Date.now();
  let lastErr: unknown;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.ok || (r.status >= 200 && r.status < 400)) return r;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw lastErr instanceof Error ? lastErr : new Error(`timeout waiting for ${url}`);
}

describe("fe-build features", () => {
  test("SSR+CSR index.html has no HMR script", async () => {
    const out = makeTmpDir("ssr-csr");
    const appSpec = "examples/counter.app.ts#App";
    const argv = ["bun", "hipst", appSpec, "--out", out];
    await runFeBuild(argv);

    const indexHtml = join(out, "index.html");
    expect(existsSync(indexHtml)).toBe(true);
    const html = readFileSync(indexHtml, "utf-8");
    expect(html.includes('<script type="module" src="./app.mjs"></script>')).toBe(true);
    // Ensure no HMR EventSource is injected in build output
    expect(/EventSource\(\"\/_hipst\/hmr\"\)/.test(html) || /EventSource\('\/_hipst\/hmr'\)/.test(html)).toBe(false);
  });

  test("--client CSR-only removes SSR body and keeps mount container", async () => {
    const out = makeTmpDir("client");
    // --client requires default export. Create a wrapper that default-exports App
    const wrapper = join(out, "app.wrapper.ts");
    const absApp = resolve(process.cwd(), "examples/counter.app.ts");
    writeFileSync(wrapper, `import { App } from ${JSON.stringify(absApp)}; export default App;`, "utf-8");
    const argv = ["bun", "hipst", wrapper, "--out", out, "--client"]; // csrOnly
    await runFeBuild(argv);

    const indexHtml = join(out, "index.html");
    const html = readFileSync(indexHtml, "utf-8");
    // Expect empty SSR body replaced by mount container + script
    expect(html.includes('<div id="__hipst_app__"></div>')).toBe(true);
    // Ensure SSR body markup is removed (title may still include "Counter")
    expect(html.includes('<h1>Counter</h1>')).toBe(false);
  });
});

describe("full-build runner features", () => {
  test("runner HTML has SSR+CSR and no HMR", async () => {
    const out = makeTmpDir("full");
    const appSpec = "examples/counter.app.ts#App";
    const argv = ["bun", "hipst", appSpec, "--out", out];
    await runFullBuild(argv);

    const runner = join(out, "server.mjs");
    expect(existsSync(runner)).toBe(true);

    const port = 4300 + Math.floor(Math.random() * 300);
    const proc = Bun.spawn({
      cmd: ["bun", runner],
      env: { ...process.env, PORT: String(port) },
      cwd: out,
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      await waitForOk(`http://127.0.0.1:${port}/`);
      const res = await waitForOk(`http://127.0.0.1:${port}/`);
      const html = await res.text();
      expect(html.includes('/_hipst/app.mjs')).toBe(true);
      // No HMR script expected in full-build runner (enableHMR not used)
      expect(/EventSource\(\"\/_hipst\/hmr\"\)/.test(html) || /EventSource\('\/_hipst\/hmr'\)/.test(html)).toBe(false);
    } finally {
      try { proc.kill(); } catch {}
      await new Promise((r) => setTimeout(r, 120));
    }
  });
});
