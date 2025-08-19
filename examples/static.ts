import { html, ui, renderToString } from "../index.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const App = html()
  .title("hipst static demo")
  .meta("description", "static example")
  (
    ui("div")
      .flexCol()
      .p(16)
      (
        ui("h1")("Static build"),
        ui("p")("This page was generated at build time.")
      )
  );

const outPath = "dist/static/index.html";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, renderToString(App), "utf-8");
console.log(`Wrote ${outPath}`);
