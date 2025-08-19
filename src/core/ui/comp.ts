import type { Properties as CSSProps } from "csstype";
import { Component } from "../comp";
import type { ValueOrFn } from "../context";
import { resolveValue } from "../context";
import { unwrap } from "../util";
import type { UIContext } from "./context";
import { track, trigger } from "./reactive";
import type { MethodType } from "../util";

type CSSProperties = CSSProps<string | number>;

type Child = string | UIComponent<any> | ValueOrFn<string, UIContext<UIComponent<any>>>;
export type WithCallable<C extends UIComponent<any>> = C & ((...children: any[]) => C);
export type StateCall<C extends UIComponent<any>> = ((key: string, value: any) => WithCallable<C>) & Record<string, any>;

export class UIComponent<Tag extends string = string> extends Component {
  private _tag: Tag;
  private _stateStore: Record<string, any> = {};
  private _stylesStore: CSSProperties = {};
  private _attrsStore: Record<string, any> = {};
  private _stateProxy?: any;
  private _children: Child[] = [];
  private _events: Record<string, Array<(ctx: UIContext<any>, ev?: any) => any>> = {};
  private _parent?: UIComponent<any>;
  private _root?: UIComponent<any>;

  constructor(tag: Tag) {
    super();
    this._tag = tag;
  }

  // identity & structure
  public get tag() { return this._tag; }
  public get parent() { return this._parent; }
  public set parent(p: UIComponent<any> | undefined) { this._parent = p; }
  public get root() { return this._root; }
  public set root(r: UIComponent<any> | undefined) { this._root = r; }
  public get children() { return this._children; }

  // Context-aware reactive state facade: callable for init, property get/set for reactive access
  public get state(): StateCall<this> {
    if (!this._stateProxy) {
      this._stateProxy = this.createStateFacade();
    }
    return this._stateProxy;
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

  public nth(i: number): UIComponent<any> | undefined {
    const k = this._children[i];
    return k instanceof UIComponent ? k : undefined;
  }

  // State / Attributes / Styles
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
  // Restrict attribute helpers to specific tags using conditional parameter types
  public htmlFor(v: this extends UIComponent<"label"> ? ValueOrFn<string, UIContext<this>> : never): this {
    return this.attr("for", v as any);
  }
  public type(v: this extends UIComponent<"input"> ? ValueOrFn<string, UIContext<this>> : never): this {
    return this.attr("type", v as any);
  }
  public checked(v: this extends UIComponent<"input"> ? ValueOrFn<boolean, UIContext<this>> : never): this {
    return this.attr("checked", v as any);
  }
  public value(v: this extends UIComponent<"input" | "textarea" | "select"> ? ValueOrFn<any, UIContext<this>> : never): this {
    return this.attr("value", v as any);
  }

  public display(v: ValueOrFn<CSSProperties["display"], UIContext<this>>): this { return this.style("display", v as any); }
  public flexDirection(v: ValueOrFn<CSSProperties["flexDirection"], UIContext<this>>): this { return this.style("flexDirection", v as any); }
  public flexCol(): this { return this.display("flex").flexDirection("column"); }
  public flexRow(): this { return this.display("flex").flexDirection("row"); }
  public p(px: string | number): this { return this.style({ padding: typeof px === "number" ? `${px}px` : px }); }
  public m(px: string | number): this { return this.style({ margin: typeof px === "number" ? `${px}px` : px }); }
  public textCenter(): this { return this.style({ textAlign: "center" }); }

  // Events (stored only)
  public onClick(fn: (ctx: UIContext<this>, ev?: any) => any): this {
    (this._events["click"] ||= []).push(fn);
    return this;
  }

  // Define a custom chainable method (fluent interface) using UIContext
  // Overloads to infer optional argument if handler's value parameter is optional
  public prop<K extends string, T = any>(
    name: K,
    fn: (ctx: UIContext<this>, value: T) => this
  ): this & { [P in K]: (value: T) => this };
  public prop<K extends string, T = any>(
    name: K,
    fn: (ctx: UIContext<this>, value?: T) => this
  ): this & { [P in K]: (value?: T) => this };
  public prop<K extends string, T = any>(
    name: K,
    fn: (ctx: UIContext<this>, value: T | undefined) => this
  ): this & { [P in K]: MethodType<this, T> } {
    if ((this as any)[name]) {
      throw new Error(`Method ${String(name)} already exists`);
    }
    Object.defineProperty(this, name, {
      // Accept optional value at runtime; compile-time optionality comes from overloads/MethodType
      value: (value?: T) => fn(this.uiCtx(), value as any),
      writable: true,
      configurable: true,
      enumerable: false,
    });
    return this as any;
  }

  private findRoot(): UIComponent<any> | undefined {
    let p: UIComponent<any> | undefined = this;
    while (p && p.parent) p = p.parent;
    return p;
  }

  private createStateFacade() {
    const self = this as UIComponent<any>;
    // callable initializer
    const init = function (this: any, key: string, value: any) {
      (self as any)._stateStore[key] = value;
      // return the component instance for chaining; Component proxy will map to receiver
      return self as any;
    } as unknown as any;
    // wrap with proxy to support property get/set reactivity
    const proxy: any = new Proxy(init, {
      get(_t, prop: any, _r) {
        // Preserve function properties (name, length, bind, etc.)
        const fnVal = Reflect.get(init as any, prop, _r);
        if (fnVal !== undefined) return fnVal;
        if (typeof prop === "string") {
          track((self as any)._stateStore, prop);
          const raw = (self as any)._stateStore[prop];
          const ctx: UIContext<UIComponent> = {
            self,
            parent: self.parent,
            root: self.root,
            state: proxy as any,
            styles: (self as any)._stylesStore as any,
            attributes: (self as any)._attrsStore as any,
          } as any;
          return resolveValue(ctx, raw as any);
        }
        return undefined as any;
      },
      set(_t, prop: any, value: any) {
        if (typeof prop !== "string") return Reflect.set(init as any, prop, value);
        const old = (self as any)._stateStore[prop];
        (self as any)._stateStore[prop] = value;
        if (old !== value) trigger((self as any)._stateStore, prop);
        return true;
      },
      deleteProperty(_t, prop: any) {
        if (typeof prop !== "string") return Reflect.deleteProperty(init as any, prop);
        const ok = delete (self as any)._stateStore[prop];
        trigger((self as any)._stateStore, prop);
        return ok;
      },
      apply(_t, _thisArg, args: any[]) {
        // allow calling as function: state(key, value)
        const [key, value] = args as [string, any];
        (self as any)._stateStore[key] = value;
        // trigger initial observers for SSR-less mount
        trigger((self as any)._stateStore, key);
        return (self as any).__hipst_callable__ ?? (self as any);
      },
    });
    // prevent higher-level wrapping (Component/toCallable) from overriding proxy behavior
    proxy.__hipst_no_wrap__ = true;
    return proxy;
  }
}
