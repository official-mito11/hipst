import { HtmlRoot } from "./factory";
import { UIComponent } from "./comp";
import type { UIContext } from "./context";
import { resolveValue } from "../context";
import { effect } from "./reactive";
import { unwrap } from "../util";

function setAttr(el: HTMLElement, name: string, v: any) {
  if (v === undefined || v === null || v === false) {
    el.removeAttribute(name);
    return;
  }
  if (v === true) {
    el.setAttribute(name, "");
    return;
  }
  el.setAttribute(name, String(v));
}

function setStyle(el: HTMLElement, key: string, v: any) {
  const style = (el.style as any);
  if (v === undefined || v === null || v === false) {
    style[key] = "";
    return;
  }
  style[key] = v;
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
    effect(() => {
      const v = resolveValue(ctx, raw as any);
      setAttr(el, name, v);
    });
  }

  // styles
  const rawStyles = (node as any)._stylesStore ?? {};
  for (const key of Object.keys(rawStyles)) {
    effect(() => {
      const v = resolveValue(ctx, (rawStyles as any)[key]);
      // convert camelCase to kebab for CSSOM property names if necessary
      setStyle(el, key, v);
    });
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
      effect(() => {
        const v = (child as any)(ctx);
        text.data = String(v ?? "");
      });
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  container.appendChild(el);
  return el;
}

export function mount(rootNode: HtmlRoot | UIComponent<any, any>, container: HTMLElement) {
  // Clear SSR content before mounting to avoid duplicate DOM
  while (container.firstChild) container.removeChild(container.firstChild);
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
        effect(() => {
          const v = (c as any)(ctx);
          text.data = String(v ?? "");
        });
      } else {
        container.appendChild(document.createTextNode(String(c)));
      }
    }
    return;
  }
  const realRoot = (maybe as any).root ?? maybe;
  mountComponent(maybe, container, realRoot as UIComponent<any, any>);
}
