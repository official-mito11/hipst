import { describe, it, expect, beforeEach } from "bun:test";
import { ui, component, mount, UIComponent } from "../index";

class FakeNode {
  childNodes: any[] = [];
  get firstChild() { return this.childNodes[0] ?? null; }
}

class FakeTextNode extends FakeNode {
  data: string;
  constructor(data = "") { super(); this.data = data; }
}

class FakeElement extends FakeNode {
  tagName: string;
  style: Record<string, string | number> = {};
  private _attrs = new Map<string, string | null>();
  private _listeners: Record<string, Array<(ev: any) => void>> = {};
  constructor(tag: string) { super(); this.tagName = tag.toUpperCase(); }
  setAttribute(name: string, value: string) { this._attrs.set(name, value); }
  removeAttribute(name: string) { this._attrs.set(name, null); }
  getAttribute(name: string) { const v = this._attrs.get(name); return v == null ? null : v; }
  appendChild(node: any) { this.childNodes.push(node); return node; }
  removeChild(node: any) { const i = this.childNodes.indexOf(node); if (i >= 0) this.childNodes.splice(i, 1); return node; }
  addEventListener(type: string, fn: (ev: any) => void) { (this._listeners[type] ||= []).push(fn); }
  dispatchEvent(ev: any) { const list = this._listeners[ev.type] || []; for (const fn of list) fn(ev); return true; }
}

function createFakeDocument() {
  return {
    title: "",
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (s: string) => new FakeTextNode(s),
  } as any;
}

function findFirstByTag(root: any, tag: string): any | null {
  if (root instanceof FakeElement && root.tagName === tag.toUpperCase()) return root;
  for (const c of root.childNodes || []) {
    const f = findFirstByTag(c, tag);
    if (f) return f;
  }
  return null;
}

function findFirstText(root: any): FakeTextNode | null {
  if (root instanceof FakeTextNode) return root;
  for (const c of root.childNodes || []) {
    const f = findFirstText(c);
    if (f) return f;
  }
  return null;
}

let container: FakeElement;

beforeEach(() => {
  (globalThis as any).document = createFakeDocument();
  container = new FakeElement("div");
});

// ctx.children at define-time: does not execute function children on access
it("ctx.children does not execute function children on access", () => {
  let executed = 0;
  const fnChild = () => { executed++; return "txt"; };
  const childComp = ui("span")("c");

  const Parent = ui("div").define(({ self, children }) => {
    // Access should not execute fnChild
    return self.attr("data-first-type", typeof children[0])
    // Accessing callable proxy shouldn't execute either
    .attr("data-second-type", typeof children[1]);
  });

  const inst = Parent(fnChild, childComp);
  const root = ui("div")(inst);
  expect(executed).toBe(0);

  mount(root as any, container as any);
  // After mount, call-time function children are NOT auto-rendered; they remain only in ctx.children
  // so the function should not have executed.
  expect(executed).toBe(0);

  const parentEl = container.childNodes[0].childNodes[0] as FakeElement;
  expect(parentEl.getAttribute("data-first-type")).toBe("function");
  expect(parentEl.getAttribute("data-second-type")).toBe("function");
});

// component(ui(...).define(...)) cloning preserves define invoker semantics
it("component() preserves define invoker semantics and reacts to arg changes", () => {
  const tmpl = ui("span").define(({ self }) =>
    self.attr("data-val", (ctx) => String(ctx.children[0]))
  );
  const F = component(tmpl);
  const inst = F("a") as any;

  const parent = ui("div")(inst);
  mount(parent as any, container as any);

  const spanEl = findFirstByTag(container, "span") as FakeElement;
  expect(spanEl.getAttribute("data-val")).toBe("a");

  (inst as any).__hipst_callable__("b");
  expect(spanEl.getAttribute("data-val")).toBe("b");
});

// .define() rewrapping semantics and reactive ctx.children
it("define rewrapping exposes call-time args via ctx.children and reacts to updates", () => {
  const Checkbox = component(
    ui("input").type("checkbox").define(({ self }) =>
      self.attr("data-checked", (ctx) => String(ctx.children[0]))
    )
  );

  const parent = ui("div");
  const inst = Checkbox("1") as any; // concrete instance to be updated later
  parent(inst);

  mount(parent as any, container as any);

  const inputEl = findFirstByTag(container, "input") as FakeElement;
  expect(inputEl).toBeTruthy();
  expect(inputEl.getAttribute("data-checked")).toBe("1");

  // Update call-time args on the same instance via callable proxy; should trigger reactive attr update
  (inst as any).__hipst_callable__("0");
  expect(inputEl.getAttribute("data-checked")).toBe("0");
});

// .effect() receives ctx.element and reacts to state changes
it("effect receives element and re-runs on state updates", () => {
  const comp = ui("div").state("x", 1).effect(({ element, state }) => {
    (element as any)?.setAttribute("data-x", String(state.x));
  });

  const parent = ui("div")(comp);
  mount(parent as any, container as any);

  // container -> [root div] -> [component div]
  const rootDiv = container.childNodes.find((c: any) => c instanceof FakeElement) as FakeElement;
  const innerDiv = rootDiv.childNodes.find((c: any) => c instanceof FakeElement) as FakeElement;
  expect(innerDiv.getAttribute("data-x")).toBe("1");

  (comp as any).state("x", 2);
  expect(innerDiv.getAttribute("data-x")).toBe("2");
});

// Event wiring: onClick handler gets ctx and can mutate attrs
it("event handlers receive UIContext and can mutate attributes", () => {
  const btn = ui("button").onClick(({ self }) => {
    self.attr("data-clicked", "yes");
  });

  const parent = ui("div")(btn);
  mount(parent as any, container as any);

  const buttonEl = findFirstByTag(container, "button") as FakeElement;
  expect(buttonEl.getAttribute("data-clicked")).toBe(null);

  buttonEl.dispatchEvent({ type: "click" });
  expect(buttonEl.getAttribute("data-clicked")).toBe("yes");
});

// Children value functions render and react to state changes
it("child value functions render text and react to state updates", () => {
  const comp = ui("div").state("n", 1)(({ self }) => String(self.state.n));
  const parent = ui("div")(comp);

  mount(parent as any, container as any);

  const text1 = findFirstText(container)!;
  expect(text1.data).toBe("1");

  (comp as any).state("n", 2);
  const text2 = findFirstText(container)!;
  expect(text2.data).toBe("2");
});

// Effect cleanup on unmount: effects stop running after container remount
it("cleans up effects on unmount/remount", () => {
  let runs = 0;
  const comp = ui("div").state("x", 1).effect(({ state }) => {
    // access state.x to create reactive dependency
    void state.x;
    runs++;
  });

  const parent = ui("div")(comp);
  mount(parent as any, container as any);
  expect(runs).toBe(1);

  (comp as any).state("x", 2);
  expect(runs).toBe(2);

  // Remount different content into same container; should cleanup previous effects
  const other = ui("div")("new");
  mount(other as any, container as any);

  // Update state on previously mounted component; its effects should no longer run
  (comp as any).state("x", 3);
  expect(runs).toBe(2);
});
