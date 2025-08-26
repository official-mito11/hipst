import { html, ui } from "../index.ts";
import { hello } from "./basic.api.ts";

export const App = html()
  .title("hipst demo")
  .meta("description", "basic example")
  (
    ui("div")
      .state("count", 0)
      .display("flex")
      .flexDirection("column")
      .p(16)
      .style("gap", "10px")
      (
        ui("h1")("Hello hipst"),
        ui("p")("Welcome to hipst example"),
        ui("button").onClick(async () => {
          const res = await hello.client.get({ query: { q: "hyunho" } });
          alert(JSON.stringify(res));
        })("Click me ", ({ parent }) => parent?.state?.count)
      )
  );
