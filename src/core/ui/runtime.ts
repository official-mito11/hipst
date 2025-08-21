import { HtmlRoot } from "./factory";
import { UIComponent } from "./comp";
import type { UIContext, StateCtx, PropsCtx } from "./context";
import { resolveValue, type ValueOrFn } from "../context";
import { effect, track, type Eff, stop } from "./reactive";
import { unwrap } from "../util";

const ATTR_CACHE = new WeakMap<HTMLElement, Map<string, string | null>>();
const STYLE_CACHE = new WeakMap<HTMLElement, Map<string, string | number>>();
const TEXT_CACHE = new WeakMap<Node, string>();
const EFFECTS_SYM: unique symbol = Symbol.for("__hipst_effects__");

type NodeWithEffects = { [k in typeof EFFECTS_SYM]?: Set<Eff> };
function regEffect(node: Node, e: Eff) {
  const effNode = node as unknown as NodeWithEffects;
  let set = effNode[EFFECTS_SYM];
  if (!set) { set = new Set<Eff>(); effNode[EFFECTS_SYM] = set; }
  set.add(e);
}

function setAttr(el: HTMLElement, name: string, v: unknown) {
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

function setStyle(el: HTMLElement, key: string, v: unknown) {
  const style = el.style as unknown as Record<string, string | number>;
  const next: string | number = (v === undefined || v === null || v === false) ? "" : (v as string | number);
  const cache = STYLE_CACHE.get(el) || (STYLE_CACHE.set(el, new Map()), STYLE_CACHE.get(el)!);
  const prev = cache.get(key);
  if (prev === next) return;
  cache.set(key, next);
  style[key] = next;
}

type LooseObj = Record<string, unknown>;
function mountComponent<T extends string, S extends object, P extends object>(
  nodeIn: UIComponent<T, S, P>,
  container: HTMLElement,
  root: UIComponent<string, LooseObj, LooseObj>
): HTMLElement {
  const node = unwrap(nodeIn) as UIComponent<T, S, P>;
  const el = document.createElement(node.tag);

  const baseCtx: UIContext<UIComponent<T, S, P>, S, P> = {
    self: node,
    parent: node.parent as unknown as UIComponent<string, LooseObj, LooseObj> | undefined,
    root,
    element: el as any,
    state: node.state as unknown as StateCtx<S>,
    props: node.props as PropsCtx<P>,
    styles: node.styles,
    attributes: node.attributes,
    children: [] as unknown[],
  } as any;
  // children should be reactive when accessed inside effect/value functions
  Object.defineProperty(baseCtx, "children", {
    configurable: true,
    enumerable: true,
    get() {
      track((node as unknown as object), "__call_args__");
      const raw = (((node as any)._callArgs) ?? []) as unknown[];
      // Unwrap callable proxies; do not execute function children here
      return raw.map((v: any) => unwrap(v));
    }
  });
  const ctx = baseCtx;

  // attributes: track keys and values, apply all each run, and remove deleted ones
  const rawAttrs: Record<string, unknown> = ((node as unknown) as { _attrsStore?: Record<string, unknown> })._attrsStore ?? {};
  {
    const runner = effect(() => {
      track(rawAttrs, "__keys__");
      const seen = new Set<string>();
      for (const [name, raw] of Object.entries(rawAttrs)) {
        seen.add(name);
        track(rawAttrs, name);
        const v = resolveValue(ctx, raw as ValueOrFn<unknown, UIContext<UIComponent<T, S, P>, S, P>>);
        setAttr(el, name, v);
      }
      const cache = ATTR_CACHE.get(el) || (ATTR_CACHE.set(el, new Map()), ATTR_CACHE.get(el)!);
      for (const key of Array.from(cache.keys())) {
        if (!seen.has(key)) setAttr(el, key, null);
      }
    });
    regEffect(el, runner);
  }

  // styles: track keys and values, apply all each run, and clear removed ones
  const rawStyles: Record<string, unknown> = ((node as unknown) as { _stylesStore?: Record<string, unknown> })._stylesStore ?? {};
  {
    const runner = effect(() => {
      track(rawStyles, "__keys__");
      const seen = new Set<string>();
      for (const key of Object.keys(rawStyles)) {
        seen.add(key);
        track(rawStyles, key);
        const v = resolveValue(ctx, rawStyles[key] as ValueOrFn<unknown, UIContext<UIComponent<T, S, P>, S, P>>);
        setStyle(el, key, v);
      }
      const cache = STYLE_CACHE.get(el) || (STYLE_CACHE.set(el, new Map()), STYLE_CACHE.get(el)!);
      for (const k of Array.from(cache.keys())) {
        if (!seen.has(k)) setStyle(el, k, "");
      }
    });
    regEffect(el, runner);
  }

  // events
  const events: Record<string, Array<(c: UIContext<UIComponent<T, S, P>, S, P>, ev?: Event) => unknown>> =
    (((node as unknown) as { _events?: Record<string, Array<(c: UIContext<UIComponent<T, S, P>, S, P>, ev?: Event) => unknown>> })._events) ?? {};
  for (const [evt, fns] of Object.entries(events)) {
    if (!Array.isArray(fns)) continue;
    el.addEventListener(evt, (ev: Event) => {
      const callCtx = ctx;
      for (const fn of fns) fn(callCtx, ev);
    });
  }

  // user-defined effects registered via UIComponent.effect()
  {
    const list: Array<(c: UIContext<UIComponent<T, S, P>, S, P>) => void> = (((node as any)._effects) ?? []) as any;
    for (const fn of list) {
      const runner = effect(() => { fn(ctx); });
      regEffect(el, runner);
    }
  }

  // children: fully reactive list
  {
    const runner = effect(() => {
      const childStore = ((node as unknown) as { _children: Array<unknown> })._children;
      track(childStore, "__list__");
      // Remove current children and clean up their effects
      while (el.firstChild) {
        cleanupSubtree(el.firstChild);
        el.removeChild(el.firstChild);
      }
      for (const child of childStore) {
        const real = unwrap(child);
        if (real instanceof UIComponent) {
          // mountComponent handles appending to container
          mountComponent(real as UIComponent<string, LooseObj, LooseObj>, el, root);
        } else if (typeof child === "function") {
          const text = document.createTextNode("");
          el.appendChild(text);
          const tr = effect(() => {
            const s = String(((child as unknown as (c: UIContext<UIComponent<T, S, P>, S, P>) => unknown)(ctx)) ?? "");
            const prev = TEXT_CACHE.get(text);
            if (prev !== s) {
              TEXT_CACHE.set(text, s);
              text.data = s;
            }
          });
          regEffect(text, tr);
        } else {
          el.appendChild(document.createTextNode(String(child)));
        }
      }
    });
    regEffect(el, runner);
  }

  container.appendChild(el);
  return el;
}

function cleanupSubtree(node: Node) {
  const effNode = node as unknown as NodeWithEffects;
  const effs = effNode[EFFECTS_SYM];
  if (effs) {
    for (const e of effs) stop(e);
    effNode[EFFECTS_SYM] = undefined;
  }
  const kids = node.childNodes;
  for (let i = 0; i < kids.length; i++) cleanupSubtree(kids[i] as Node);
}

export function mount(rootNode: HtmlRoot | UIComponent<string, LooseObj, LooseObj>, container: HTMLElement) {
  // Clear SSR/previous hipst content before mounting to avoid duplicate DOM and leak effects
  // Clean up any effects registered on the container and its subtree
  cleanupSubtree(container);
  while (container.firstChild) {
    cleanupSubtree(container.firstChild);
    container.removeChild(container.firstChild);
  }
  const maybe = unwrap(rootNode) as HtmlRoot | UIComponent<string, LooseObj, LooseObj>;
  if (maybe instanceof HtmlRoot) {
    // Head management (title/meta)
    const r = maybe as HtmlRoot;
    const ctx: UIContext<HtmlRoot> = {
      self: r,
      parent: undefined,
      root: r,
      element: undefined,
      state: r.state as unknown as StateCtx<{}>,
      props: r.props as PropsCtx<{}>,
      styles: r.styles,
      attributes: r.attributes,
      children: [],
    };
    const title = r.headTitle;
    if (title) {
      const runner = effect(() => {
        const v = resolveValue(ctx, title as ValueOrFn<string, UIContext<HtmlRoot>>);
        if (typeof document !== "undefined") document.title = String(v ?? "");
      });
      // Register on container so it is cleaned up on next mount
      regEffect(container, runner);
    }
    // metas could be handled similarly if needed

    // Body children
    for (const c of (r.children as unknown as Array<unknown>)) {
      const real = unwrap(c);
      if (real instanceof UIComponent) mountComponent(real as UIComponent<string, LooseObj, LooseObj>, container, (r as unknown) as UIComponent<string, LooseObj, LooseObj>);
      else if (typeof c === "function") {
        const text = document.createTextNode("");
        container.appendChild(text);
        const runner = effect(() => {
          const s = String(((c as unknown as (cx: UIContext<HtmlRoot>) => unknown)(ctx)) ?? "");
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
  const realRoot = ((maybe as unknown as { root?: UIComponent<string, LooseObj, LooseObj> }).root) ?? maybe;
  mountComponent(maybe, container, realRoot);
}
