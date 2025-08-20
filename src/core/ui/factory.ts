import { toCallable } from "../util";
import { UIComponent, type WithCallable } from "./comp";
import type { UIContext } from "./context";
import type { ValueOrFn } from "../context";

export class HtmlRoot extends UIComponent<"__html_root__"> {
  private _title?: ValueOrFn<string, UIContext<this>>;
  private _metas: Record<string, ValueOrFn<string, UIContext<this>>> = {};
  private _css: string[] = [];

  constructor() {
    super("__html_root__");
    this.root = this;
  }

  title(v: ValueOrFn<string, UIContext<this>>): this {
    this._title = v;
    return this;
  }

  meta(name: string, content: ValueOrFn<string, UIContext<this>>): this {
    this._metas[name] = content;
    return this;
  }

  /**
   * Declare a CSS file to be included by the client runtime bundle when CSR is enabled.
   * The path should be resolvable from the project root (absolute or relative).
   */
  css(path: string): this {
    if (path) this._css.push(path);
    return this;
  }

  get headTitle() { return this._title; }
  get headMetas() { return this._metas; }
  get headCss() { return this._css.slice(); }
}

function flatten<T>(arr: T[]): T[] {
  const out: T[] = [];
  for (const a of arr as any) {
    if (Array.isArray(a)) out.push(...flatten(a));
    else out.push(a);
  }
  return out;
}

export function ui<Tag extends string>(tag: Tag): WithCallable<UIComponent<Tag>> {
  const base = new UIComponent<Tag>(tag);
  const callable = toCallable<UIComponent<Tag>, any[], UIComponent<Tag>>(base, (self, ...children: any[]) => {
    const kids = flatten(children);
    (self as UIComponent<any>).append(...kids as any);
    return self;
  });
  // keep a back ref for methods that need to return the callable proxy (e.g., state facade)
  (base as any).__hipst_callable__ = callable;
  return callable;
}

export function html(): WithCallable<HtmlRoot> {
  const base = new HtmlRoot();
  const callable = toCallable<HtmlRoot, any[], HtmlRoot>(base, (self, ...children: any[]) => {
    const kids = flatten(children);
    (self as UIComponent<any>).append(...kids as any);
    return self;
  });
  (base as any).__hipst_callable__ = callable;
  return callable;
}
