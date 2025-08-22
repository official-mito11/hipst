#!/usr/bin/env bun

const APP_URL = "file:///home/adeb/work/hipst/examples/counter.app.ts";
const API_URL = "file:///home/adeb/work/hipst/examples/counter.api.ts";
const EX = "App";
const API_EX = "myApi";

async function main() {
  console.log("hipst (full-build): boot");
  // Import hipst server from local repo (absolute index.ts) to avoid requiring package install
  let serverMod;
  try {
    serverMod = await import("file:///home/adeb/work/hipst/index.ts");
  } catch (e) {
    console.error("hipst (full-build): failed to import hipst index:", e);
    process.exit(1);
  }
  const { server } = serverMod;
  let mod;
  try {
    mod = await import(APP_URL);
  } catch (e) {
    console.error("hipst (full-build): failed to import app module:", APP_URL, e);
    process.exit(1);
  }
  const Root = EX ? mod[EX] : (mod.default ?? mod.App);
  if (!Root) { console.error("hipst: build runner: could not resolve UI root export"); process.exit(1); }

  const s = server();
  // Serve prebuilt CSR assets from disk
  const assetsDir = new URL("./_hipst/", import.meta.url).pathname;
  console.log("hipst (full-build): assetsDir=", assetsDir);
  s.csrServeFromDir(assetsDir);
  s.route(Root);

  try {
    const amod = await import(API_URL);
    const apiNode = amod[API_EX];
    if (apiNode) s.route(apiNode);
  } catch {}
  

  // Inject precompiled docs if present
  s.setDocs({"methods":[{"method":"GET","file":"/home/adeb/work/hipst/examples/counter.app.ts","line":47,"column":26},{"method":"GET","file":"/home/adeb/work/hipst/examples/counter.api.ts","line":16,"column":16},{"path":"/test","method":"GET","file":"/home/adeb/work/hipst/examples/counter.api.ts","line":23,"column":17,"schema":{"res":{"type":"string"}}},{"path":"/auth/me","method":"PUT","file":"/home/adeb/work/hipst/examples/counter.api.ts","line":27,"column":22,"schema":{"body":{"type":"any"},"res":{"type":"object","properties":{"data":{"type":"any"}},"required":["data"]}}},{"path":"/auth/me","method":"POST","file":"/home/adeb/work/hipst/examples/counter.api.ts","line":27,"column":22,"schema":{"body":{"type":"any"},"res":{"type":"object","properties":{"data":{"type":"any"}},"required":["data"]}}},{"path":"/auth/me","method":"GET","file":"/home/adeb/work/hipst/examples/counter.api.ts","line":27,"column":22,"schema":{"res":{"type":"object","properties":{"msg":{"type":"string"}},"required":["msg"]}}}]});

  const port = Number(process.env.PORT || 3000);
  s.listen(port, () => console.log(`hipst (full-build): http://localhost:${port}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
