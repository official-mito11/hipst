import { html, ui } from "../index.ts";

export const App = html()
.title("Counter")
.meta("description", "Counter example")
(
  ui("div")
  .state("tiny", "tiny")
  .p(14)
  .flexCol()
  (
    ui("h1")("Counter"),
    ui("p")("Welcome to counter example"),
    ui("button")
    .onClick(({ parent }) => {
      if (parent) parent.state.tiny = (parent.state.tiny ?? "tiny") + " tiny";
    })
    (({parent}) => `hyunho has ${parent?.state.tiny} dick`)
  )
);
