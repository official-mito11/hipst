import { html, ui } from "../index.ts";
import { myApi } from "./counter.api.ts";

export const App = html()
.title("Counter")
.meta("description", "Counter example")
(
  ui("div")
  .state("tiny", "tiny")
  .state("api", "")
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
    (({ parent, self }) => `Tiny: ${parent?.state.tiny} (count: ${self.state.count})`),
    ui("button")
    .p(10)
    .onClick(async ({ parent }) => {
      const data = await myApi.client.get({ query: { q: "great" } });
      if (parent) parent.state.api = String(data ?? "");
    })
    ("Fetch API"),
    ui("p")((c) => String(c.parent?.state.api ?? ""))
  )
);
