import { api, server, html, ui } from "../index.ts";

// API: GET /api/hello?q=123 -> { ok: true, q: { q: "123" } }
const hello = api("/api/hello").get(({ res, query }) => res({ ok: true, q: query }));

// UI: simple page
const App = html()
  .title("hipst demo")
  .meta("description", "basic example")
  (
    ui("div")
      .flexCol()
      .p(16)
      (
        ui("h1")("Hello hipst"),
        ui("p")("Welcome to hipst example")
      )
  );

const s = server().route(hello).route(App).listen(3000);
console.log("Server running at http://localhost:3000");
