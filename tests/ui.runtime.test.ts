import { describe, it, expect, beforeEach } from "bun:test";
import { ui, component, mount } from "../index.ts";

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

// .define() rewrapping semantics and reactive ctx.children
it("define rewrapping exposes call-time args via ctx.children and reacts to updates", () => {
  const Checkbox = component(
    ui("input").type("checkbox").define(({ self, children }) =>
      self.attr("data-checked", (ctx) => (ctx.children[0] ? "1" : "0"))
    )
  );

  const parent = ui("div");
  const inst = Checkbox(true) as any; // concrete instance to be updated later
  parent(inst);

  mount(parent as any, container as any);

  const inputEl = findFirstByTag(container, "input") as FakeElement;
  expect(inputEl).toBeTruthy();
  expect(inputEl.getAttribute("data-checked")).toBe("1");

  // Update call-time args on the same instance; should trigger reactive attr update
  (inst as any)(false);
  expect(inputEl.getAttribute("data-checked")).toBe("0");
});

// .effect() receives ctx.element and reacts to state changes
it("effect receives element and re-runs on state updates", () => {
  const comp = ui("div").state("x", 1).effect(({ element, state }) => {
    (element as any)?.setAttribute("data-x", String(state.x));
  });

  const parent = ui("div")(comp);
  mount(parent as any, container as any);

  const divEl = findFirstByTag(container, "div") as FakeElement; // parent div
  // The first child div is the component itself
  const innerDiv = divEl.childNodes.find((c: any) => c instanceof FakeElement && c !== divEl) as FakeElement;
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
  const comp = ui("div").state("n", 1)(({ state }) => String(state.n));
  const parent = ui("div")(comp);

  mount(parent as any, container as any);

  const text1 = findFirstText(container)!;
  expect(text1.data).toBe("1");

  (comp as any).state("n", 2);
  const text2 = findFirstText(container)!;
  expect(text2.data).toBe("2");
});
