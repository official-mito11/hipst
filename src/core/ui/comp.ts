import type { Properties as CSSProps } from "csstype";
import { Component } from "../comp";
import type { ValueOrFn } from "../context";
import { resolveValue } from "../context";
import { unwrap, toCallable } from "../util";
import type { UIContext, PropsCtx } from "./context";
import { track, trigger } from "./reactive";
import type { MethodType } from "../util";

type CSSProperties = CSSProps<string | number>;

// A callable component where children value functions receive the full UIContext.
// The parent in the context is refined to the provided generic `P` for better type inference via parentTyped().
export type WithCallable<C extends UIComponent<any, any, any>, P = UIComponent<any, any, any>> = C & ((
  ...children: Array<
    | string
    | UIComponent<any, any, any>
    | ValueOrFn<string, UIContext<C, StateOf<C>, PropsOf<C>> & { parent?: P }>
  >
) => C);

type StateProps<S extends object> = { [K in keyof S]: S[K] };
type WithState<C extends UIComponent<any, any, any>, NS extends object> = C extends UIComponent<infer TG, any, infer PP>
  ? UIComponent<TG, NS, PP>
  : UIComponent<any, NS, any>;
type WithProps<C extends UIComponent<any, any, any>, NP extends object> = C extends UIComponent<infer TG, infer SS, any>
  ? UIComponent<TG, SS, NP>
  : UIComponent<any, any, NP>;
// Map current prop keys to chainable methods so all previously defined props remain available on the type
// Only materialize prop methods for literal keys. If P is wide (e.g., Record<string, unknown>), produce none.
type PropKeySet<P extends object> = string extends keyof P ? never : keyof P & string;
type PropMethods<Tag extends string, S extends object, P extends object> = {
  [K in PropKeySet<P>]: (
    value?: ValueOrFn<P[K], UIContext<UIComponent<Tag, S, P>, S, P>>
  ) => WithCallable<UIComponent<Tag, S, P>> & PropMethods<Tag, S, P>
};

// Helpers to extract generics from a UIComponent type
type TagOf<C extends UIComponent<any, any, any>> = C extends UIComponent<infer TG, any, any> ? TG : string;
type StateOf<C extends UIComponent<any, any, any>> = C extends UIComponent<any, infer SS, any> ? SS : {};
type PropsOf<C extends UIComponent<any, any, any>> = C extends UIComponent<any, any, infer PP> ? PP : {};

// Derive DOM element and event map from Tag using lib.dom.d.ts
export type ElementFromTag<T extends string> =
  T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] :
  T extends keyof SVGElementTagNameMap ? SVGElementTagNameMap[T] : Element;

type EventMapFor<T extends string> =
  T extends keyof HTMLElementTagNameMap ? HTMLElementEventMap :
  T extends keyof SVGElementTagNameMap ? SVGElementEventMap : GlobalEventHandlersEventMap;
// Typed, non-recursive state facade: callable + key accessors, refined return type for chaining
export type StateFacade<C extends UIComponent<any, any, any>, S extends object> = {
  <K extends keyof S & string>(key: K, value: S[K]): WithCallable<C> & PropMethods<TagOf<C>, StateOf<C>, PropsOf<C>>;
  <K extends string, V>(key: K, value: V): WithCallable<WithState<C, S & { [P in K]: V }>> & PropMethods<TagOf<C>, S & { [P in K]: V }, PropsOf<C>>;
  <T extends Record<string, any>>(obj: T): WithCallable<WithState<C, S & T>> & PropMethods<TagOf<C>, S & T, PropsOf<C>>;
} & StateProps<S> & { [key: string]: unknown };

export class UIComponent<Tag extends string = string, S extends object = {}, P extends object = {}> extends Component {
  private _tag: Tag;
  private _stateStore: Record<string, unknown> = {};
  private _propsStore: Record<string, unknown> = {};
  private _stylesStore: CSSProperties = {};
  private _attrsStore: Record<string, unknown> = {};
  private _stateProxy?: StateFacade<UIComponent<Tag, S, P>, S>;
  private _propsProxy?: PropsCtx<P>;
  private _children: Array<string | UIComponent<any, any, any> | ValueOrFn<string, any>> = [];
  private _callArgs?: unknown[];
  private _effects?: Array<(ctx: UIContext<UIComponent<Tag, S, P>, S, P>) => void>;
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
  public get state(): StateFacade<UIComponent<Tag, S, P>, S> {
    if (!this._stateProxy) {
      this._stateProxy = this.createStateFacade();
    }
    return this._stateProxy as StateFacade<UIComponent<Tag, S, P>, S>;
  }
  public get props(): PropsCtx<P> {
    if (!this._propsProxy) {
      this._propsProxy = this.createPropsFacade();
    }
    return this._propsProxy as PropsCtx<P>;
  }
  public get styles() { return this._stylesStore; }
  public get attributes() { return this._attrsStore; }

  // Helpers
  private uiCtx(): UIContext<this, S, P> {
    return {
      self: this,
      parent: this._parent,
      root: this._root,
      element: undefined,
      state: this.state as unknown as import("./context").StateCtx<S>,
      props: this.props as any,
      styles: this._stylesStore as this["styles"],
      attributes: this._attrsStore as this["attributes"],
      children: (this as any)._callArgs ?? [],
    };
  }

  // Composition
  public append(
    ...kids: Array<
      | string
      | UIComponent<any, any, any>
      | ValueOrFn<string, UIContext<this, S, P>>
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
        // Ignore uninvoked factories so they don't render as text ValueOrFn
        if (typeof k === "function" && (k as any).__hipst_factory__) {
          continue;
        }
        this._children.push(k);
      }
    }
    // reactive children list
    trigger((this as any)._children, "__list__");
    return this;
  }

  public nth(i: number): UIComponent<any, any, any> | undefined {
    const k = this._children[i];
    return k instanceof UIComponent ? k : undefined;
  }

  /**
   * Initialize multiple state keys with strong typing and refine this component's state shape.
   * Example: ui("div").stateInit({ count: 0 }) => ctx.state.count inferred as number
   */
  public stateInit<T extends object>(obj: T): WithCallable<UIComponent<Tag, S & T>> & PropMethods<Tag, S & T, P> {
    Object.assign(this._stateStore, obj);
    for (const k in obj) trigger((this as any)._stateStore, k);
    return (this as any).__hipst_callable__ as any;
  }

  /**
   * Refine this component's state type without mutating runtime state. Useful for declaring shape.
   */
  public typed<T extends Record<string, any>>(): WithCallable<UIComponent<Tag, S & T>> & PropMethods<Tag, S & T, P> {
    return (this as any).__hipst_callable__ as any;
  }

  /**
   * Hint the expected parent type for children value functions. This helps TypeScript
   * infer `parent.state` shape inside child lambdas, e.g.:
   * ui("button").parentTyped<{ count: number }>()(({ parent }) => parent!.state.count.toFixed(0))
   */
  public parentTyped<PS extends object>(): WithCallable<UIComponent<Tag, S>, UIComponent<any, PS>> & PropMethods<Tag, S, P> {
    return (this as any).__hipst_callable__ as any;
  }

  // State / Attributes / Styles
  public attr<T = unknown>(key: string, value: ValueOrFn<T, UIContext<this, S, P>>): this {
    this._attrsStore[key] = value as any;
    trigger(this._attrsStore, "__keys__");
    trigger(this._attrsStore, key);
    return this;
  }

  public style<K extends keyof CSSProperties>(key: K, value: ValueOrFn<NonNullable<CSSProperties[K]>, UIContext<this, S, P>>): this;
  public style(obj: Partial<CSSProperties>): this;
  public style(arg1: keyof CSSProperties | Partial<CSSProperties>, arg2?: ValueOrFn<unknown, UIContext<this, S, P>>): this {
    if (typeof arg1 === "object") {
      Object.assign(this._stylesStore, arg1);
      for (const k of Object.keys(arg1)) trigger(this._stylesStore, k);
      trigger(this._stylesStore, "__keys__");
    } else {
      (this._stylesStore as any)[arg1] = arg2 as any;
      trigger(this._stylesStore, arg1);
      // Also notify key observers so runtime effects can pick up newly added keys
      trigger(this._stylesStore, "__keys__");
    }
    return this;
  }

  // Common shorthands
  public id(v: ValueOrFn<string, UIContext<this, S, P>>): this { return this.attr("id", v); }
  public className(v: ValueOrFn<string, UIContext<this, S, P>>): this { return this.attr("class", v); }
  /**
   * Alias for setting class attribute. Prefer using classes()/class() for class-first styling.
   */
  public class(v: ValueOrFn<string, UIContext<this, S, P>>): this { return this.attr("class", v); }
  /**
   * Apply classes from string | string[] | Record<string, boolean>.
   * Example:
   *  .classes(["btn", ({state})=> state.on && "on"]) or .classes({ btn: true, on: ({state})=> state.on })
   */
  public classes(v: ValueOrFn<string | string[] | Record<string, any>, UIContext<this, S, P>>): this {
    return this.attr("class", (ctx: UIContext<this, S, P>) => {
      const raw = typeof v === "function" ? (v as any)(ctx) : v;
      if (Array.isArray(raw)) return raw.filter(Boolean).map(String).join(" ");
      if (raw && typeof raw === "object") {
        const out: string[] = [];
        for (const [k, val] of Object.entries(raw)) {
          const vv = typeof val === "function" ? (val as any)(ctx) : val;
          if (vv) out.push(k);
        }
        return out.join(" ");
      }
      return String(raw ?? "");
    });
  }
  // Simple attribute helpers (no conditional restrictions to avoid deep generic instantiation)
  public htmlFor(v: ValueOrFn<string, UIContext<this, S, P>>): this { return this.attr("for", v as any); }
  public type(v: ValueOrFn<string, UIContext<this, S, P>>): this { return this.attr("type", v as any); }
  public checked(v: ValueOrFn<boolean, UIContext<this, S, P>>): this { return this.attr("checked", v as any); }
  public value(v: ValueOrFn<string | number, UIContext<this, S, P>>): this { return this.attr("value", v as any); }

  public display(v: ValueOrFn<CSSProperties["display"], UIContext<this, S, P>>): this { return this.style("display", v as any); }
  public flexDirection(v: ValueOrFn<CSSProperties["flexDirection"], UIContext<this, S, P>>): this { return this.style("flexDirection", v as any); }
  public flexCol(): this { return this.display("flex").flexDirection("column"); }
  public flexRow(): this { return this.display("flex").flexDirection("row"); }
  public p(v: ValueOrFn<string | number, UIContext<this, S, P>>): this;
  public p(px: string | number | ValueOrFn<string | number, UIContext<this, S, P>>): this {
    if (typeof px === "function") {
      return this.style("padding", (ctx: UIContext<this, S, P>) => {
        const out = (px as (c: UIContext<this, S, P>) => string | number)(ctx);
        return typeof out === "number" ? `${out}px` : out;
      });
    }
    return this.style({ padding: typeof px === "number" ? `${px}px` : px });
  }
  public m(v: ValueOrFn<string | number, UIContext<this, S, P>>): this {
    if (typeof v === "function") {
      return this.style("margin", (ctx: UIContext<this, S, P>) => {
        const out = (v as (c: UIContext<this, S, P>) => string | number)(ctx);
        return typeof out === "number" ? `${out}px` : out;
      });
    }
    return this.style({ margin: typeof v === "number" ? `${v}px` : v });
  }
  public textCenter(): this { return this.style({ textAlign: "center" }); }

  // Events (stored only) – typed per Tag using standard DOM event maps
  public on<K extends keyof EventMapFor<Tag>>(type: K, fn: (ctx: UIContext<this, S, P>, ev: EventMapFor<Tag>[K]) => unknown): this;
  public on(type: string, fn: (ctx: UIContext<this, S, P>, ev: Event) => unknown): this {
    (this._events[type] ||= []).push(fn as unknown as (ctx: UIContext<UIComponent<any, any, any>, any, any>, ev?: Event) => unknown);
    return this;
  }

  public onClick(fn: (ctx: UIContext<this, S, P>, ev: MouseEvent) => unknown): this {
    return this.on("click", fn as (c: UIContext<this, S, P>, e: MouseEvent) => unknown);
  }

  /**
   * Register a reactive side-effect that runs with UIContext. It returns void and is cleaned up on unmount.
   */
  public effect(fn: (ctx: UIContext<this, S, P>) => void): this {
    (this as any)._effects ||= [];
    (this as any)._effects.push(fn as any);
    return this;
  }

  /**
   * Define a custom call handler for this component while preserving children-call syntax.
   * Example:
   *  const Checkbox = ui('input').type('checkbox').define(({ self }, checked?: boolean) => self.attr('checked', !!checked))
   *  Checkbox(true) // -> sets checked
   *  Checkbox(ui('span')("label")) // -> appends children
   */
  public define(
    invoker: (ctx: UIContext<this, S, P>) => this
  ): (WithCallable<UIComponent<Tag, S, P>> & PropMethods<Tag, S, P>) & ((...args: any[]) => WithCallable<UIComponent<Tag, S, P>> & PropMethods<Tag, S, P>) {
    const self = this as UIComponent<Tag, S, P>;
    // Expose invoker on instance so blueprint-based cloning can preserve call-time behavior
    (self as any).__hipst_invoker__ = invoker as any;
    const flatten = (arr: any[]): any[] => {
      const out: any[] = [];
      for (const a of arr) {
        if (Array.isArray(a)) out.push(...flatten(a)); else out.push(a);
      }
      return out;
    };
    const callable = toCallable<UIComponent<Tag, S, P>, any[], UIComponent<Tag, S, P>>(self, (s, ...args: any[]) => {
      // Rewrapping semantics: capture call-time args as ctx.children and invoke user invoker.
      (s as any)._callArgs = flatten(args);
      trigger((s as any), "__call_args__");
      const ctx = (s as any).uiCtx() as UIContext<UIComponent<Tag, S, P>, S, P>;
      (invoker as any)(ctx);
      return s;
    });
    // Ensure other helpers (e.g., state facade) return the new callable
    (self as any).__hipst_callable__ = callable;
    return callable as unknown as (WithCallable<UIComponent<Tag, S, P>> & PropMethods<Tag, S, P>) & ((...args: any[]) => WithCallable<UIComponent<Tag, S, P>> & PropMethods<Tag, S, P>);
  }

  // Define a custom chainable method (fluent interface) using UIContext
  // Overloads to infer optional argument if handler's value parameter is optional
  public prop<K extends string, T = unknown>(
    name: K,
    fn: (ctx: UIContext<this, S, P>, value?: T) => this
  ): WithCallable<UIComponent<Tag, S, P & Record<K, T>>> & PropMethods<Tag, S, P & Record<K, T>>;
  public prop<K extends string, T = unknown>(
    name: K,
    fn: (ctx: UIContext<this, S, P>, value: T) => this
  ): WithCallable<UIComponent<Tag, S, P & Record<K, T>>> & PropMethods<Tag, S, P & Record<K, T>>;
  public prop<K extends string, T = unknown>(
    name: K,
    fn: (ctx: UIContext<this, S, P>, value: T | undefined) => this
  ): WithCallable<UIComponent<Tag, S, P & Record<K, T>>> & PropMethods<Tag, S, P & Record<K, T>> {
    if ((this as any)[name]) {
      throw new Error(`Method ${String(name)} already exists`);
    }
    // Persist handler definition so blueprint clones can reattach methods bound to the new instance
    const defs = ((this as any).__hipst_prop_defs__ ||= {});
    defs[String(name)] = fn;
    Object.defineProperty(this, name, {
      // Accept optional value at runtime; compile-time optionality comes from overloads/MethodType
      value: (value?: ValueOrFn<T, UIContext<this, S, P>>) => {
        // Persist raw prop value for cross-prop referencing via ctx.props
        (this as any)._propsStore[String(name)] = value as unknown;
        trigger((this as any)._propsStore, String(name));
        const ctx = this.uiCtx();
        const resolved = resolveValue(ctx, value as any);
        return fn(ctx, resolved as T);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
    return (this as any).__hipst_callable__ as any;
  }

  private findRoot(): this | undefined {
    let p: this | undefined = this;
    while (p && p.parent) p = p.parent as this;
    return p;
  }

  private createStateFacade() {
    const self = this as UIComponent<Tag, S, P>;
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
    } as unknown as StateFacade<UIComponent<Tag, S, P>, S>;
    // wrap with proxy to support property get/set reactivity
    const proxy: any = new Proxy(init, {
      get(_t, prop: any, _r) {
        // Preserve function properties (name, length, bind, etc.)
        const fnVal = Reflect.get(init as any, prop, _r);
        if (fnVal !== undefined) return fnVal;
        if (typeof prop === "string") {
          track((self as any)._stateStore, prop);
          const raw = (self as any)._stateStore[prop];
          const ctx: UIContext<UIComponent<Tag, S, P>, S, P> = {
            self,
            parent: self.parent,
            root: self.root,
            element: undefined,
            state: proxy as any,
            props: self.props as any,
            styles: (self as any)._stylesStore as any,
            attributes: (self as any)._attrsStore as any,
            children: ((self as any)._callArgs ?? []) as unknown[],
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

  private createPropsFacade() {
    const self = this as UIComponent<Tag, S, P>;
    const proxy: any = new Proxy({}, {
      get(_t, prop: any, _r) {
        if (typeof prop !== "string") return undefined as any;
        track((self as any)._propsStore, prop);
        const raw = (self as any)._propsStore[prop];
        const ctx: UIContext<UIComponent<Tag, S, P>, S, P> = {
          self,
          parent: self.parent,
          root: self.root,
          element: undefined,
          state: self.state as any,
          props: proxy as any,
          styles: (self as any)._stylesStore as any,
          attributes: (self as any)._attrsStore as any,
          children: ((self as any)._callArgs ?? []) as unknown[],
        } as any;
        return resolveValue(ctx, raw as any);
      },
      set(_t, prop: any, value: any) {
        if (typeof prop !== "string") return Reflect.set({}, prop, value);
        const old = (self as any)._propsStore[prop];
        (self as any)._propsStore[prop] = value;
        if (old !== value) trigger((self as any)._propsStore, prop);
        return true;
      },
      deleteProperty(_t, prop: any) {
        if (typeof prop !== "string") return false;
        const ok = delete (self as any)._propsStore[prop];
        trigger((self as any)._propsStore, prop);
        return ok;
      },
    });
    // prevent higher-level wrapping
    proxy.__hipst_no_wrap__ = true;
    return proxy as PropsCtx<P>;
  }
}
