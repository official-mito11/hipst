import { describe, test, expect } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function makeTmpDir(suffix: string): string {
  const d = join(tmpdir(), `hipst-serve-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}`);
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

async function waitForOutput(proc: Bun.Subprocess, re: RegExp, timeoutMs = 4000): Promise<string | undefined> {
  if (!proc.stdout) return undefined;
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  try {
    const dec = new TextDecoder();
    let buf = "";
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const race = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((r) => setTimeout(() => r({ done: true }), 60)),
      ]) as ReadableStreamReadResult<Uint8Array> | { done: true; value?: undefined };
      if ((race as any).done && !(race as any).value) continue;
      const { done, value } = race as ReadableStreamReadResult<Uint8Array>;
      if (!done && value) buf += dec.decode(value);
      if (re.test(buf)) return buf;
    }
    return undefined;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

function writeServeModule(modPath: string, staticDir: string): { uiPath: string } {
  const repoIndex = resolve(process.cwd(), "index.ts");
  const uiPath = join(modPath.replace(/\.ts$/, "")) + ".ui.ts";
  const uiSrc = `import { html, ui } from ${JSON.stringify(repoIndex)};
export const App = html().title("serve test")(ui("div")(ui("h1")("SSR")));`;
  writeFileSync(uiPath, uiSrc, "utf-8");

  const src = `import { server, api } from ${JSON.stringify(repoIndex)};
import { App } from ${JSON.stringify(uiPath)};
const ping = api("/api/ping").get(({ res }) => res({ ok: true }));
const s = server()
  .route(ping)
  .route(App)
  .csrAutoFrom(${JSON.stringify(uiPath)}, "App")
  .static("/pub", ${JSON.stringify(staticDir)});
export default s;`;
  writeFileSync(modPath, src, "utf-8");
  return { uiPath };
}

function writeNonServerModule(modPath: string): void {
  const repoIndex = resolve(process.cwd(), "index.ts");
  const src = `import { html, ui } from ${JSON.stringify(repoIndex)};
const App = html()(ui("div")("x"));
export default App;`;
  writeFileSync(modPath, src, "utf-8");
}

describe("serve features", () => {
  test("SSR + HMR injection + CSR assets + docs + static", async () => {
    const tmp = makeTmpDir("features");
    const staticDir = join(tmp, "pub");
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(join(staticDir, "hello.txt"), "world", "utf-8");

    const modPath = join(tmp, "app.ts");
    writeServeModule(modPath, staticDir);

    const port = 4200 + Math.floor(Math.random() * 300);
    const proc = Bun.spawn({
      cmd: ["bun", "run", "src/cli/hipst.ts", "serve", modPath, "-w", "-p", String(port)],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      await Promise.race([
        waitForOutput(proc, /hipst serve:/, 4000),
        waitForOk(`http://127.0.0.1:${port}/`, 4500),
      ]);

      // Root HTML: SSR present, CSR script injected, and HMR snippet in head
      const rootRes = await waitForOk(`http://127.0.0.1:${port}/`);
      const html = await rootRes.text();
      expect(html.includes('/_hipst/app.mjs')).toBe(true);
      expect(html.includes('EventSource("/_hipst/hmr")') || html.includes("EventSource('/_hipst/hmr')")).toBe(true);
      expect(html.includes('id="__hipst_app__"')).toBe(true);

      // CSR assets
      expect((await waitForOk(`http://127.0.0.1:${port}/_hipst/app.mjs`)).status).toBe(200);
      expect((await waitForOk(`http://127.0.0.1:${port}/_hipst/runtime.mjs`)).status).toBe(200);

      // Docs pre-parsing endpoint
      const docsRes = await waitForOk(`http://127.0.0.1:${port}/_hipst/docs.json`);
      const docs = await docsRes.json();
      expect(typeof docs).toBe("object");
      expect(Array.isArray(docs?.methods) || Array.isArray((docs as any)?.apis)).toBe(true);

      // Static from explicit mount
      const txt = await waitForOk(`http://127.0.0.1:${port}/pub/hello.txt`);
      expect(await txt.text()).toBe("world");

      // Auto-static from repo assets directory
      const icon = await waitForOk(`http://127.0.0.1:${port}/assets/icon.svg`);
      const svg = await icon.text();
      expect(svg.includes("<svg")).toBe(true);

      // Trigger watch restart by touching module
      const before = readFileSync(modPath, "utf-8");
      writeFileSync(modPath, before + "\n// touch\n", "utf-8");
      // Wait for server to become responsive after restart
      expect((await waitForOk(`http://127.0.0.1:${port}/_hipst/app.mjs`, 4500)).status).toBe(200);
    } finally {
      try { proc.kill(); } catch {}
      await new Promise((r) => setTimeout(r, 120));
    }
  });

  test("rejects non-Server export", async () => {
    const tmp = makeTmpDir("reject");
    const modPath = join(tmp, "bad.ts");
    writeNonServerModule(modPath);

    const port = 4600 + Math.floor(Math.random() * 200);
    const proc = Bun.spawn({
      cmd: ["bun", "run", "src/cli/hipst.ts", "serve", modPath, "-p", String(port)],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    expect(code !== 0).toBe(true);
  });
});
