import { server } from "../src/core/server/comp";
import { html, ui } from "../src/core/ui/factory";

server().route(
  html()
  .title("Counter")
  .meta("description", "Counter example")
  (
    ui("div")
      .state("count", 0)
      .flexCol()
      (
        ui("h1")("Counter"),
        ui("p")("Welcome to counter example"),
        ui("button")
          .onClick(({ parent }) => {
            if (parent) parent.state.count = (parent.state.count ?? 0) + 1;
          })
          (({ parent }) => "Count: " + (parent?.state.count ?? 0))
      )
  )
).listen(3000);