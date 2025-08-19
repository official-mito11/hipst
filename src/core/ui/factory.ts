import { toCallable } from "../util";
import { UIComponent } from "./comp";
import type { UIContext } from "./context";
import type { ValueOrFn } from "../context";

export class HtmlRoot extends UIComponent {
  private _title?: ValueOrFn<string, UIContext<this>>;
  private _metas: Record<string, ValueOrFn<string, UIContext<this>>> = {};

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

  get headTitle() { return this._title; }
  get headMetas() { return this._metas; }
}

function flatten<T>(arr: T[]): T[] {
  const out: T[] = [];
  for (const a of arr as any) {
    if (Array.isArray(a)) out.push(...flatten(a));
    else out.push(a);
  }
  return out;
}

export function ui<Tag extends string>(tag: Tag) {
  const base = new UIComponent(tag);
  const callable = toCallable(base, (self, ...children: any[]) => {
    const kids = flatten(children);
    (self as UIComponent).append(...kids as any);
    return self;
  });
  return callable;
}

export function html() {
  const base = new HtmlRoot();
  const callable = toCallable(base, (self, ...children: any[]) => {
    const kids = flatten(children);
    (self as UIComponent).append(...kids as any);
    return self;
  });
  return callable;
}
