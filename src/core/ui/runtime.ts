import { HtmlRoot } from "./factory";
import { UIComponent } from "./comp";
import type { UIContext } from "./context";
import { resolveValue } from "../context";
import { effect, type Eff, stop } from "./reactive";
import { unwrap } from "../util";

const ATTR_CACHE = new WeakMap<HTMLElement, Map<string, any>>();
const STYLE_CACHE = new WeakMap<HTMLElement, Map<string, any>>();
const TEXT_CACHE = new WeakMap<Node, string>();
const EFFECTS_SYM: unique symbol = Symbol.for("__hipst_effects__");

function regEffect(node: Node, e: Eff) {
  const anyNode = node as any;
  let set: Set<Eff> = anyNode[EFFECTS_SYM];
  if (!set) anyNode[EFFECTS_SYM] = set = new Set<Eff>();
  set.add(e);
}

function setAttr(el: HTMLElement, name: string, v: any) {
  let val: string | null;
  if (v === undefined || v === null || v === false) val = null;
  else if (v === true) val = "";
  else val = String(v);
  const cache = ATTR_CACHE.get(el) || (ATTR_CACHE.set(el, new Map()), ATTR_CACHE.get(el)!);
  const prev = cache.get(name);
  if (prev === val) return;
  cache.set(name, val);
  if (val === null) el.removeAttribute(name);
  else el.setAttribute(name, val);
}

function setStyle(el: HTMLElement, key: string, v: any) {
  const style = (el.style as any);
  const next = (v === undefined || v === null || v === false) ? "" : v;
  const cache = STYLE_CACHE.get(el) || (STYLE_CACHE.set(el, new Map()), STYLE_CACHE.get(el)!);
  const prev = cache.get(key);
  if (prev === next) return;
  cache.set(key, next);
  style[key] = next;
}

function mountComponent(node: UIComponent<any, any>, container: HTMLElement, root: UIComponent<any, any>): HTMLElement {
  node = unwrap(node) as UIComponent<any, any>;
  const el = document.createElement(node.tag);

  const ctx: UIContext<UIComponent<any, any>> = {
    self: node,
    parent: node.parent,
    root,
    state: (node as any).state,
    styles: (node as any).styles,
    attributes: (node as any).attributes,
  } as any;

  // attributes
  const rawAttrs = (node as any)._attrsStore ?? {};
  for (const [name, raw] of Object.entries(rawAttrs)) {
    const runner = effect(() => {
      const v = resolveValue(ctx, raw as any);
      setAttr(el, name, v);
    });
    regEffect(el, runner);
  }

  // styles
  const rawStyles = (node as any)._stylesStore ?? {};
  for (const key of Object.keys(rawStyles)) {
    const runner = effect(() => {
      const v = resolveValue(ctx, (rawStyles as any)[key]);
      setStyle(el, key, v);
    });
    regEffect(el, runner);
  }

  // events
  const events: Record<string, Array<(c: UIContext<UIComponent<any, any>>, ev?: any) => any>> = (node as any)._events ?? {};
  for (const [evt, fns] of Object.entries(events)) {
    if (!Array.isArray(fns)) continue;
    el.addEventListener(evt, (ev: Event) => {
      const callCtx: UIContext<UIComponent<any, any>> = {
        self: node,
        parent: node.parent,
        root,
        state: (node as any).state,
        styles: (node as any).styles,
        attributes: (node as any).attributes,
      } as any;
      for (const fn of fns) fn(callCtx, ev);
    });
  }

  // children
  for (const child of node.children as any[]) {
    const real = unwrap(child);
    if (real instanceof UIComponent) {
      const childEl = mountComponent(real, el, root);
      el.appendChild(childEl);
    } else if (typeof child === "function") {
      const text = document.createTextNode("");
      el.appendChild(text);
      const runner = effect(() => {
        const v = (child as any)(ctx);
        const s = String(v ?? "");
        const prev = TEXT_CACHE.get(text);
        if (prev !== s) {
          TEXT_CACHE.set(text, s);
          text.data = s;
        }
      });
      regEffect(text, runner);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  container.appendChild(el);
  return el;
}

function cleanupSubtree(node: Node) {
  const effs: Set<Eff> | undefined = (node as any)[EFFECTS_SYM];
  if (effs) {
    for (const e of effs) stop(e);
    (node as any)[EFFECTS_SYM] = undefined;
  }
  if ((node as Element).childNodes) {
    const kids = (node as Element).childNodes;
    for (let i = 0; i < kids.length; i++) cleanupSubtree(kids[i]!);
  }
}

export function mount(rootNode: HtmlRoot | UIComponent<any, any>, container: HTMLElement) {
  // Clear SSR/previous hipst content before mounting to avoid duplicate DOM and leak effects
  while (container.firstChild) {
    cleanupSubtree(container.firstChild);
    container.removeChild(container.firstChild);
  }
  const maybe = unwrap(rootNode) as HtmlRoot | UIComponent<any, any>;
  if (maybe instanceof HtmlRoot) {
    // Head management (title/meta)
    const r = maybe as HtmlRoot;
    const ctx: UIContext<HtmlRoot> = {
      self: r,
      parent: undefined,
      root: r,
      state: (r as any).state,
      styles: (r as any).styles,
      attributes: (r as any).attributes,
    };
    const title = (r as any).headTitle;
    if (title) effect(() => {
      const v = resolveValue(ctx, title as any);
      if (typeof document !== "undefined") document.title = String(v ?? "");
    });
    // metas could be handled similarly if needed

    // Body children
    for (const c of (r as any).children as any[]) {
      const real = unwrap(c);
      if (real instanceof UIComponent) mountComponent(real, container, r);
      else if (typeof c === "function") {
        const text = document.createTextNode("");
        container.appendChild(text);
        const runner = effect(() => {
          const v = (c as any)(ctx);
          const s = String(v ?? "");
          const prev = TEXT_CACHE.get(text);
          if (prev !== s) {
            TEXT_CACHE.set(text, s);
            text.data = s;
          }
        });
        regEffect(text, runner);
      } else {
        container.appendChild(document.createTextNode(String(c)));
      }
    }
    return;
  }
  const realRoot = (maybe as any).root ?? maybe;
  mountComponent(maybe, container, realRoot as UIComponent<any, any>);
}
