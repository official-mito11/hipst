import { html, ui, ValueOrFn, UIContext } from "../index.ts";
import { myApi } from "./counter.api.ts";

const VStack = ui('div')
.flexCol()
.state("rv", 1)
.prop("r", (ctx, v?: string) => ctx.self.style("gap", v || "1rem"))

VStack.r()

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
    .state("selfstate", 0)
    .p(10)
    .onClick(async ({ parent, state }) => {
      state.selfstate = state.selfstate + 1;
      const data = await myApi.client.get({ query: { q: "gay" } });
      if (parent) parent.state.api = String(data ?? "");
    })
    ("Fetch API"),
    ui("p")(({ parent }) => String(parent?.state.api ?? ""))
  )
);
