import { describe, it, expect } from "bun:test";
import { effect, track, trigger } from "./reactive";
import { UIComponent } from "./comp";
import { html, ui } from "./factory";
import { renderToString } from "./render";

describe("reactive core", () => {
  it("effect runs on dependency change", () => {
    const target: Record<string, any> = {};
    let calls = 0;
    let last: any;

    effect(() => {
      calls++;
      track(target, "x");
      last = target["x"];
    });

    expect(calls).toBe(1);
    expect(last).toBeUndefined();

    target["x"] = 1;
    trigger(target, "x");

    expect(calls).toBe(2);
    expect(last).toBe(1);
  });
});

describe("UIComponent state facade", () => {
  it("supports reactive get/set via property setter", () => {
    const btn = new UIComponent("button");
    // init via property setter
    (btn.state as any).count = 0;
    expect((btn.state as any).count).toBe(0);

    let seen = -1;
    effect(() => {
      // reading tracks dependency
      seen = (btn.state as any).count ?? -1;
    });
    expect(seen).toBe(0);

    // update via setter
    (btn.state as any).count = 2;
    expect(seen).toBe(2);
  });
});

describe("SSR render with state-driven content", () => {
  it("renders dynamic child text using state", () => {
    const p = ui("p");
    // initialize state prior to render
    (p as any).state.count = 42;
    // sanity check pre-render
    expect(((p as any).state as any).count).toBe(42);
    const textFn = (c: any) => `Count: ${c.state.count ?? 0}`;
    // Direct ctx evaluation
    const node: any = (p as any).__hipst_target__ ?? (p as any);
    const ctx: any = {
      self: node,
      parent: node.parent,
      root: node.root,
      state: node.state,
      styles: node.styles,
      attributes: node.attributes,
    };
    expect(textFn(ctx)).toBe("Count: 42");
    const App = html()(p(textFn));
    const out = renderToString(App as any);
    expect(out).toContain("Count: 42");
  });
});
