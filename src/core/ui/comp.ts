import type { Properties as CSSProps } from "csstype";
import { Component } from "../comp";
import type { ValueOrFn } from "../context";
import { resolveValue } from "../context";
import { unwrap } from "../util";
import type { UIContext } from "./context";
import { track, trigger } from "./reactive";
import type { MethodType } from "../util";

type CSSProperties = CSSProps<string | number>;

// A callable component where children value functions receive a context
// whose parent is the concrete component type `C`.
export type WithCallable<C extends UIComponent<any, any>, P = UIComponent<any, any>> = C & ((
  ...children: Array<
    | string
    | UIComponent<any, any>
    | ValueOrFn<string, { self: C; parent?: P }>
  >
) => C);

type StateProps<S extends object> = { [K in keyof S]: S[K] };
type WithState<C extends UIComponent<any, any>, NS extends object> = C extends UIComponent<infer TG, any>
  ? UIComponent<TG, NS>
  : UIComponent<any, NS>;
// Typed, non-recursive state facade: callable + key accessors, refined return type for chaining
export type StateFacade<C extends UIComponent<any, any>, S extends object> = {
  <K extends keyof S & string>(key: K, value: S[K]): WithCallable<C>;
  <K extends string, V>(key: K, value: V): WithCallable<WithState<C, S & { [P in K]: V }>>;
  <T extends Record<string, any>>(obj: T): WithCallable<WithState<C, S & T>>;
} & StateProps<S> & { [key: string]: unknown };

export class UIComponent<Tag extends string = string, S extends object = {}> extends Component {
  private _tag: Tag;
  private _stateStore: Record<string, unknown> = {};
  private _stylesStore: CSSProperties = {};
  private _attrsStore: Record<string, unknown> = {};
  private _stateProxy?: StateFacade<UIComponent<Tag, S>, S>;
  private _children: Array<string | UIComponent<any, any> | ValueOrFn<string, any>> = [];
  private _events: Record<string, Array<(ctx: any, ev?: Event) => unknown>> = {};
  private _parent?: UIComponent<any, any>;
  private _root?: UIComponent<any, any>;

  constructor(tag: Tag) {
    super();
    this._tag = tag;
  }

  // identity & structure
  public get tag() { return this._tag; }
  public get parent() { return this._parent; }
  public set parent(p: UIComponent<any, any> | undefined) { this._parent = p; }
  public get root() { return this._root; }
  public set root(r: UIComponent<any, any> | undefined) { this._root = r; }
  public get children() { return this._children; }

  // Context-aware reactive state facade: callable for init, property get/set for reactive access
  public get state(): StateFacade<UIComponent<Tag, S>, S> {
    if (!this._stateProxy) {
      this._stateProxy = this.createStateFacade();
    }
    return this._stateProxy as StateFacade<UIComponent<Tag, S>, S>;
  }
  public get styles() { return this._stylesStore; }
  public get attributes() { return this._attrsStore; }

  // Helpers
  private uiCtx(): UIContext<this, S> {
    return {
      self: this,
      parent: this._parent,
      root: this._root,
      state: this.state as unknown as import("./context").StateCtx<S>,
      styles: this._stylesStore as this["styles"],
      attributes: this._attrsStore as this["attributes"],
    };
  }

  // Composition
  public append(
    ...kids: Array<
      | string
      | UIComponent<any, any>
      | ValueOrFn<string, { self: UIComponent<any, any>; parent?: UIComponent<any, any> }>
    >
  ): this {
    for (const k of kids) {
      const real = unwrap(k);
      if (real instanceof UIComponent) {
        // cast through unknown to avoid generic variance issues on `state`
        real.parent = this as unknown as UIComponent<any, any>;
        const root = this._root ?? this.findRoot();
        real.root = root as unknown as UIComponent<any, any> | undefined;
        this._children.push(real);
      } else {
        this._children.push(k);
      }
    }
    return this;
  }

  public nth(i: number): UIComponent<any, any> | undefined {
    const k = this._children[i];
    return k instanceof UIComponent ? k : undefined;
  }

  /**
   * Initialize multiple state keys with strong typing and refine this component's state shape.
   * Example: ui("div").stateInit({ count: 0 }) => ctx.state.count inferred as number
   */
  public stateInit<T extends object>(obj: T): WithCallable<UIComponent<Tag, S & T>> {
    Object.assign(this._stateStore, obj);
    for (const k in obj) trigger((this as any)._stateStore, k);
    return (this as any).__hipst_callable__ as any;
  }

  /**
   * Refine this component's state type without mutating runtime state. Useful for declaring shape.
   */
  public typed<T extends Record<string, any>>(): WithCallable<UIComponent<Tag, S & T>> {
    return (this as any).__hipst_callable__ as any;
  }

  /**
   * Hint the expected parent type for children value functions. This helps TypeScript
   * infer `parent.state` shape inside child lambdas, e.g.:
   * ui("button").parentTyped<{ count: number }>()(({ parent }) => parent!.state.count.toFixed(0))
   */
  public parentTyped<PS extends object>(): WithCallable<UIComponent<Tag, S>, UIComponent<any, PS>> {
    return (this as any).__hipst_callable__ as any;
  }

  // State / Attributes / Styles
  public attr<T = unknown>(key: string, value: ValueOrFn<T, UIContext<this, S>>): this {
    this._attrsStore[key] = value as any;
    return this;
  }

  public style<K extends keyof CSSProperties>(key: K, value: ValueOrFn<NonNullable<CSSProperties[K]>, UIContext<this, S>>): this;
  public style(obj: Partial<CSSProperties>): this;
  public style(arg1: keyof CSSProperties | Partial<CSSProperties>, arg2?: ValueOrFn<unknown, UIContext<this, S>>): this {
    if (typeof arg1 === "object") {
      Object.assign(this._stylesStore, arg1);
    } else {
      (this._stylesStore as any)[arg1] = arg2 as any;
    }
    return this;
  }

  // Common shorthands
  public id(v: ValueOrFn<string, UIContext<this, S>>): this { return this.attr("id", v); }
  public className(v: ValueOrFn<string, UIContext<this, S>>): this { return this.attr("class", v); }
  // Simple attribute helpers (no conditional restrictions to avoid deep generic instantiation)
  public htmlFor(v: ValueOrFn<string, UIContext<this, S>>): this { return this.attr("for", v as any); }
  public type(v: ValueOrFn<string, UIContext<this, S>>): this { return this.attr("type", v as any); }
  public checked(v: ValueOrFn<boolean, UIContext<this, S>>): this { return this.attr("checked", v as any); }
  public value(v: ValueOrFn<string | number, UIContext<this, S>>): this { return this.attr("value", v as any); }

  public display(v: ValueOrFn<CSSProperties["display"], UIContext<this, S>>): this { return this.style("display", v as any); }
  public flexDirection(v: ValueOrFn<CSSProperties["flexDirection"], UIContext<this, S>>): this { return this.style("flexDirection", v as any); }
  public flexCol(): this { return this.display("flex").flexDirection("column"); }
  public flexRow(): this { return this.display("flex").flexDirection("row"); }
  public p(v: ValueOrFn<string | number, UIContext<this, S>>): this;
  public p(px: string | number | ValueOrFn<string | number, UIContext<this, S>>): this {
    if (typeof px === "function") {
      return this.style("padding", (ctx: UIContext<this, S>) => {
        const out = (px as (c: UIContext<this, S>) => string | number)(ctx);
        return typeof out === "number" ? `${out}px` : out;
      });
    }
    return this.style({ padding: typeof px === "number" ? `${px}px` : px });
  }
  public m(px: string | number): this { return this.style({ margin: typeof px === "number" ? `${px}px` : px }); }
  public textCenter(): this { return this.style({ textAlign: "center" }); }

  // Events (stored only)
  public onClick(fn: (ctx: UIContext<this, S>, ev?: MouseEvent) => unknown): this {
    // Store with a widened context type to avoid variance issues across components
    (this._events["click"] ||= []).push(fn as unknown as (ctx: UIContext<UIComponent<any, any>, any>, ev?: Event) => unknown);
    return this;
  }

  // Define a custom chainable method (fluent interface) using UIContext
  // Overloads to infer optional argument if handler's value parameter is optional
  public prop<K extends string, T = unknown>(
    name: K,
    fn: (ctx: UIContext<this, S>, value: T) => this
  ): this & { [P in K]: (value: T) => this };
  public prop<K extends string, T = unknown>(
    name: K,
    fn: (ctx: UIContext<this, S>, value?: T) => this
  ): this & { [P in K]: (value?: T) => this };
  public prop<K extends string, T = unknown>(
    name: K,
    fn: (ctx: UIContext<this, S>, value: T | undefined) => this
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

  private findRoot(): this | undefined {
    let p: this | undefined = this;
    while (p && p.parent) p = p.parent as this;
    return p;
  }

  private createStateFacade() {
    const self = this as UIComponent<Tag, S>;
    // callable initializer
    const init = function (this: unknown, keyOrObj: unknown, value?: unknown) {
      if (keyOrObj && typeof keyOrObj === "object" && !Array.isArray(keyOrObj)) {
        const obj = keyOrObj as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
          (self as any)._stateStore[k] = obj[k];
          trigger((self as any)._stateStore, k);
        }
      } else {
        const k = String(keyOrObj as any);
        (self as any)._stateStore[k] = value;
        trigger((self as any)._stateStore, k);
      }
      // return the component instance for chaining; Component proxy will map to receiver
      return self as any;
    } as unknown as StateFacade<UIComponent<Tag, S>, S>;
    // wrap with proxy to support property get/set reactivity
    const proxy: any = new Proxy(init, {
      get(_t, prop: any, _r) {
        // Preserve function properties (name, length, bind, etc.)
        const fnVal = Reflect.get(init as any, prop, _r);
        if (fnVal !== undefined) return fnVal;
        if (typeof prop === "string") {
          track((self as any)._stateStore, prop);
          const raw = (self as any)._stateStore[prop];
          const ctx: UIContext<UIComponent<Tag, S>, S> = {
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
        // allow calling as function: state(key, value) OR state({ ...obj })
        const [arg1, arg2] = args as [any, any];
        if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
          for (const k of Object.keys(arg1)) {
            (self as any)._stateStore[k] = arg1[k];
            trigger((self as any)._stateStore, k);
          }
        } else {
          (self as any)._stateStore[arg1] = arg2;
          trigger((self as any)._stateStore, arg1);
        }
        return (self as any).__hipst_callable__ ?? (self as any);
      },
    });
    // prevent higher-level wrapping (Component/toCallable) from overriding proxy behavior
    proxy.__hipst_no_wrap__ = true;
    return proxy;
  }
}
