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

function styleToString(comp: UIComponent, ctx: UIContext<UIComponent>): string {
  const parts: string[] = [];
  for (const key of Object.keys(comp.styles) as any) {
    const raw = (comp as any)._stylesStore?.[key];
    const v = resolveValue(ctx, raw);
    if (v === undefined || v === null || v === false) continue;
    const name = camelToKebab(String(key));
    parts.push(`${name}:${String(v)}`);
  }
  return parts.join(";");
}

function attrsToString(comp: UIComponent, ctx: UIContext<UIComponent>): string {
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

function renderNode(node: UIComponent, root: UIComponent): string {
  // Ensure we operate on real component instances, not callable proxies
  node = unwrap(node) as UIComponent;
  root = unwrap(root) as UIComponent;
  const ctx: UIContext<UIComponent> = {
    self: node,
    parent: node.parent,
    root,
    state: node["state"],
    styles: node["styles"],
    attributes: node["attributes"],
  } as any;

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

export function renderToString(root: HtmlRoot | UIComponent): string {
  const maybe = unwrap(root) as HtmlRoot | UIComponent;
  if (maybe instanceof HtmlRoot) {
    const r = maybe as HtmlRoot;
    const ctx: UIContext<any> = {
      self: r,
      parent: undefined,
      root: r,
      state: (r as any).state,
      styles: (r as any).styles,
      attributes: (r as any).attributes,
    };
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
  const top = maybe;
  const realRoot = (maybe as any).root ?? maybe;
  return renderNode(top, realRoot);
}
