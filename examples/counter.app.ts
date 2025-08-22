import { html, ui, ValueOrFn, UIContext, component } from "../index.ts";
import { myApi } from "./counter.api.ts";

const TestComponent = component(ui('div')
.flexCol()
.state("rv", 1)
.state("omni", 0)
.prop("r", ({self}, v?: string) => self.style("borderRadius", v || "1rem"))
.prop("newt", ({self}, v: string) => self.style("margin", v || "1rem"))
.style("textAlign", "center")
.state("test", "1rem")
)


// Demo: Checkbox component using .define() to accept a boolean at call-time via ctx.children
const Checkbox = component(ui('input').type('checkbox')
  .define(({ self, children }) => self.attr('checked', !!children[0])));

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
    // Using Checkbox(true) via .define() invoker
    Checkbox(true),
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
      const data = await myApi.client.get({query:{q:"gay"}});
      if (parent) parent.state.api = String(data ?? "");
    })
    ("Fetch API"),
    ui("p")(({ parent }) => String(parent?.state.api ?? ""))
  )
);
