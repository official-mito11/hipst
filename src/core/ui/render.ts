import { HtmlRoot } from "./factory";
import { UIComponent } from "./comp";
import type { UIContext } from "./context";
import { resolveValue } from "../context";
import { unwrap } from "../util";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function camelToKebab(s: string) {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

type StyleValue = string | number | boolean | ((c: UIContext<UIComponent<any, any>>) => string | number | boolean);
type PrivateSlots = { [k: string]: Record<string, StyleValue> | undefined };

function styleToString(comp: UIComponent<any, any>, ctx: UIContext<UIComponent<any, any>>): string {
  const parts: string[] = [];
  // Use internal styles store with a safe fallback to the public styles getter
  const storeFromPrivate = (comp as object as PrivateSlots)["_stylesStore"];
  const publicStyles = comp.styles as Record<string, StyleValue>;
  const rawStyles: Record<string, StyleValue> = storeFromPrivate ?? publicStyles ?? {};
  for (const key of Object.keys(rawStyles)) {
    const raw = rawStyles[key];
    const v = resolveValue<string | number | boolean, UIContext<UIComponent<any, any>>>(ctx, raw as (StyleValue));
    if (v === undefined || v === null || v === false) continue;
    const name = camelToKebab(key);
    parts.push(`${name}:${String(v)}`);
  }
  return parts.join(";");
}

function attrsToString(comp: UIComponent<any, any>, ctx: UIContext<UIComponent<any, any>>): string {
  const parts: string[] = [];
  const attrs = (comp as any)._attrsStore ?? {};
  for (const [k, raw] of Object.entries(attrs)) {
    const v: any = resolveValue(ctx, raw as any);
    if (v === undefined || v === null || v === false) continue;
    if (v === true) parts.push(k);
    else parts.push(`${k}="${esc(String(v))}"`);
  }
  const styleStr = styleToString(comp, ctx);
  if (styleStr) parts.push(`style="${esc(styleStr)}"`);
  return parts.join(" ");
}

function renderNode(node: UIComponent<any, any>, root: UIComponent<any, any>): string {
  // Ensure we operate on real component instances, not callable proxies
  node = unwrap(node) as UIComponent;
  root = unwrap(root) as UIComponent;
  // Build a stable state facade that reads directly from the node's state store
  let ctx: UIContext<UIComponent<any, any>>;
  const stateFacade: any = new Proxy(function () {}, {
    get(_t, prop: any) {
      if (typeof prop !== "string") return undefined;
      const raw = (node as any)._stateStore?.[prop];
      return resolveValue(ctx as any, raw as any);
    },
    set(_t, prop: any, value: any) {
      if (typeof prop !== "string") return false;
      ((node as any)._stateStore ||= {})[prop] = value;
      return true;
    },
    apply(_t, _thisArg, args: any[]) {
      const [key, value] = args as [string, any];
      ((node as any)._stateStore ||= {})[key] = value;
      return node as any;
    },
  });
  ctx = {
    self: node,
    parent: node.parent,
    root,
    element: undefined,
    state: stateFacade,
    props: (node as any).props,
    styles: node["styles"],
    attributes: node["attributes"],
    children: [] as any,
  } as any;
  // Resolve children: unwrap callable components and resolve ValueOrFn with current ctx
  (ctx as any).children = (((node as any)._callArgs) ?? []).map((v: any) => {
    const u = unwrap(v);
    if (u instanceof UIComponent) return u;
    return resolveValue(ctx as any, v as any);
  });

  const attrs = attrsToString(node, ctx);
  const open = attrs ? `<${node.tag} ${attrs}>` : `<${node.tag}>`;
  const children = (node as any).children as any[];
  let inner = "";
  for (const c of children) {
    if (c instanceof UIComponent) inner += renderNode(c, root);
    else if (typeof c === "function") inner += esc(String((c as any)(ctx)));
    else inner += esc(String(c));
  }
  const close = `</${node.tag}>`;
  return `${open}${inner}${close}`;
}

export function renderToString(root: HtmlRoot | UIComponent<any, any>): string {
  const maybe = unwrap(root) as HtmlRoot | UIComponent<any, any>;
  if (maybe instanceof HtmlRoot) {
    const r = maybe as HtmlRoot;
    let ctx: UIContext<HtmlRoot>;
    const stateFacade: any = new Proxy(function () {}, {
      get(_t, prop: any) {
        if (typeof prop !== "string") return undefined;
        const raw = (r as any)._stateStore?.[prop];
        return resolveValue(ctx as any, raw as any);
      },
      set(_t, prop: any, value: any) {
        if (typeof prop !== "string") return false;
        ((r as any)._stateStore ||= {})[prop] = value;
        return true;
      },
      apply(_t, _thisArg, args: any[]) {
        const [key, value] = args as [string, any];
        ((r as any)._stateStore ||= {})[key] = value;
        return r as any;
      },
    });
    ctx = {
      self: r,
      parent: undefined,
      root: r,
      element: undefined,
      state: stateFacade,
      props: (r as any).props,
      styles: (r as any).styles,
      attributes: (r as any).attributes,
      children: [],
    } as UIContext<HtmlRoot>;
    (ctx as any).children = (((r as any)._callArgs) ?? []).map((v: any) => {
      const u = unwrap(v);
      if (u instanceof UIComponent) return u;
      return resolveValue(ctx as any, v as any);
    });
    const title = (r as any).headTitle
      ? String(resolveValue(ctx, (r as any).headTitle as any))
      : "";
    const metas: string[] = [];
    for (const [name, v] of Object.entries((r as any).headMetas ?? {})) {
      const content = String(resolveValue(ctx, v as any));
      metas.push(`<meta name="${esc(name)}" content="${esc(content)}">`);
    }
    const bodyChildren = (r as any).children as any[];
    let body = "";
    for (const c of bodyChildren) {
      const real = unwrap(c);
      if (real instanceof UIComponent) body += renderNode(real, r);
      else if (typeof c === "function") body += esc(String((c as any)(ctx)));
      else body += esc(String(c));
    }
    return `<!doctype html><html><head>${title ? `<title>${esc(title)}</title>` : ""}${metas.join("")}</head><body>${body}</body></html>`;
  }
  const top = maybe as UIComponent<any, any>;
  const realRoot = (maybe as any).root ?? maybe;
  return renderNode(top, realRoot as UIComponent<any, any>);
}
