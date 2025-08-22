import { api, server, html, ui } from "../index.ts";

// API: GET /api/hello?q=123 -> { ok: true, q: { q: "123" } }
const hello = api("/api/hello").get(({ res, query }) => res({ ok: true, q: query }));

// UI: simple page
const App = html()
  .title("hipst demo")
  .meta("description", "basic example")
  (
    ui("div")
      .display("flex")
      .flexDirection("column")
      .p(16)
      .style("gap", "10px")
      (
        ui("h1")("Hello hipst"),
        ui("p")("Welcome to hipst example"),
        ui("button").onClick(() => {
          alert("Button clicked");
        })("Click me")
      )
  );

export default server().route(hello).route(App).listen(3000);
