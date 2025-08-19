import type { Properties as CSSProps } from "csstype";
import { Component } from "../comp";
import type { ValueOrFn } from "../context";
import { resolveValue } from "../context";
import { unwrap } from "../util";
import type { UIContext } from "./context";

type CSSProperties = CSSProps<string | number>;

type Child = string | UIComponent | ValueOrFn<string, UIContext<UIComponent>>;

export class UIComponent extends Component {
  private _tag: string;
  private _stateStore: Record<string, any> = {};
  private _stylesStore: CSSProperties = {};
  private _attrsStore: Record<string, any> = {};
  private _children: Child[] = [];
  private _events: Record<string, Array<(ctx: UIContext<any>, ev?: any) => any>> = {};
  private _parent?: UIComponent;
  private _root?: UIComponent;

  constructor(tag: string) {
    super();
    this._tag = tag;
  }

  // identity & structure
  public get tag() { return this._tag; }
  public get parent() { return this._parent; }
  public set parent(p: UIComponent | undefined) { this._parent = p; }
  public get root() { return this._root; }
  public set root(r: UIComponent | undefined) { this._root = r; }
  public get children() { return this._children; }

  // Context-aware views
  public get state(): Record<string, any> {
    // Return a proxy that resolves ValueOrFn using the latest known context when accessed
    const self = this;
    return new Proxy(this._stateStore, {
      get(target, prop: string, receiver) {
        const raw = Reflect.get(target, prop, receiver);
        const ctx: UIContext<UIComponent> = { self, parent: self.parent, root: self.root, state: self.state as any, styles: self._stylesStore as any, attributes: self._attrsStore } as any;
        return resolveValue(ctx, raw as any);
      },
    });
  }
  public get styles() { return this._stylesStore; }
  public get attributes() { return this._attrsStore; }

  // Helpers
  private uiCtx(): UIContext<this> {
    return {
      self: this,
      parent: this._parent,
      root: this._root,
      state: this.state as any,
      styles: this._stylesStore as any,
      attributes: this._attrsStore as any,
    };
  }

  // Composition
  public append(...kids: Child[]): this {
    for (const k of kids) {
      const real = unwrap<Child>(k);
      if (real instanceof UIComponent) {
        real.parent = this;
        const root = this._root ?? this.findRoot();
        real.root = root;
        this._children.push(real);
      } else {
        this._children.push(k);
      }
    }
    return this;
  }

  public nth(i: number): UIComponent | undefined {
    const k = this._children[i];
    return k instanceof UIComponent ? k : undefined;
  }

  // State / Attributes / Styles
  public stateSet<T = any>(key: string, value: ValueOrFn<T, UIContext<this>>): this {
    this._stateStore[key] = value as any;
    return this;
  }

  public attr<T = any>(key: string, value: ValueOrFn<T, UIContext<this>>): this {
    this._attrsStore[key] = value as any;
    return this;
  }

  public style(key: keyof CSSProperties, value: ValueOrFn<any, UIContext<this>>): this;
  public style(obj: Partial<CSSProperties>): this;
  public style(arg1: any, arg2?: any): this {
    if (typeof arg1 === "object") {
      Object.assign(this._stylesStore, arg1);
    } else {
      (this._stylesStore as any)[arg1] = arg2;
    }
    return this;
  }

  // Common shorthands
  public id(v: ValueOrFn<string, UIContext<this>>): this { return this.attr("id", v); }
  public htmlFor(v: ValueOrFn<string, UIContext<this>>): this { return this.attr("for", v); }
  public type(v: ValueOrFn<string, UIContext<this>>): this { return this.attr("type", v); }
  public checked(v: ValueOrFn<boolean, UIContext<this>>): this { return this.attr("checked", v); }
  public value(v: ValueOrFn<any, UIContext<this>>): this { return this.attr("value", v); }

  public display(v: ValueOrFn<CSSProperties["display"], UIContext<this>>): this { return this.style("display", v as any); }
  public flexDirection(v: ValueOrFn<CSSProperties["flexDirection"], UIContext<this>>): this { return this.style("flexDirection", v as any); }
  public flexCol(): this { return this.display("flex").flexDirection("column"); }
  public flexRow(): this { return this.display("flex").flexDirection("row"); }
  public p(px: number): this { return this.style({ padding: px }); }
  public m(px: number): this { return this.style({ margin: px }); }
  public textCenter(): this { return this.style({ textAlign: "center" }); }

  // Events (stored only)
  public onClick(fn: (ctx: UIContext<this>, ev?: any) => any): this {
    (this._events["click"] ||= []).push(fn);
    return this;
  }

  // Define a custom chainable method (fluent interface) using UIContext
  public prop<K extends string, T = any>(
    name: K,
    fn: (ctx: UIContext<this>, value: T) => this
  ): this & { [P in K]: (value: T) => this } {
    if ((this as any)[name]) {
      throw new Error(`Method ${String(name)} already exists`);
    }
    Object.defineProperty(this, name, {
      value: (value: T) => fn(this.uiCtx(), value),
      writable: true,
      configurable: true,
      enumerable: false,
    });
    return this as any;
  }

  private findRoot(): UIComponent | undefined {
    let p: UIComponent | undefined = this;
    while (p && p.parent) p = p.parent;
    return p;
  }
}
