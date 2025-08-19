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
    .state("count", 10)
    .p(({self})=> self.state.count)
    .onClick(({ parent, self }) => {
      if (parent) parent.state.tiny = (parent.state.tiny ?? "tiny") + " tiny";
      self.state.count = self.state.count / 2;
    })
    (({parent, self}) => `hyunho has ${parent?.state.tiny} dick (${self.state.count}cm)`)
  )
);
