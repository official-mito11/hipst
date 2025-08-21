import { toCallable } from "../util";
import { trigger } from "./reactive";
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

// Overloads leverage lib.dom.d.ts so tag names are inferred and validated
export function ui<K extends keyof HTMLElementTagNameMap>(tag: K): WithCallable<UIComponent<K>>;
export function ui<K extends keyof SVGElementTagNameMap>(tag: K): WithCallable<UIComponent<K>>;
export function ui<Tag extends string>(tag: Tag): WithCallable<UIComponent<Tag>>;
export function ui(tag: string): WithCallable<UIComponent<string>> {
  const base = new UIComponent<string>(tag as string);
  const callable = toCallable<UIComponent<string>, any[], UIComponent<string>>(base, (self, ...children: any[]) => {
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

/**
 * Create a single-call factory component from a builder or a ui() blueprint.
 * Usage:
 *  const Text1 = component(() => ui('span').class('txt'));
 *  const Text2 = component(ui('span').class('txt'));
 *  html()(Text1('hello'), Text2())
 */
export function component<F extends WithCallable<UIComponent<any, any, any>> & Record<string, any>>(
  builder: () => F
): F;

// Overload: component(ui('div')) – simpler blueprint-based factory
export function component<F extends WithCallable<UIComponent<any, any, any>> & Record<string, any>>(
  template: F
): F;

// Implementation union
export function component<F extends WithCallable<UIComponent<any, any, any>> & Record<string, any>>(
  arg: any
): F {
  type ApplyFn = (instCallable: F) => F;

  const isTemplate = arg && typeof arg === "function" && (arg as any).__hipst_target__ instanceof UIComponent;
  const templateCallable: F | null = isTemplate ? (arg as F) : null;
  const builder: (() => F) | null = isTemplate ? null : (arg as () => F);

  // Get a sample callable to introspect available methods for Proxy forwarding
  const sampleCallable: F = templateCallable ?? (builder!() as F);
  const sampleTarget = (sampleCallable as any).__hipst_target__ as UIComponent<any, any, any>;

  const cloneFromTemplate = (): F => {
    const tmpl = templateCallable ? ((templateCallable as any).__hipst_target__ as UIComponent<any, any, any>) : sampleTarget;
    const base = new UIComponent<string>(tmpl.tag as string) as UIComponent<any, any, any>;

    // Copy runtime stores (shallow) – state, props (raw), styles, attributes, events
    Object.assign((base as any)._stateStore, (tmpl as any)._stateStore);
    Object.assign((base as any)._propsStore, (tmpl as any)._propsStore);
    Object.assign((base as any)._stylesStore, (tmpl as any)._stylesStore);
    Object.assign((base as any)._attrsStore, (tmpl as any)._attrsStore);
    const evs = (tmpl as any)._events || {};
    for (const k of Object.keys(evs)) {
      (base as any)._events[k] = [...(evs[k] as any[])];
    }

    // Rebuild custom prop methods from definitions to bind to the new instance
    const defs = (tmpl as any).__hipst_prop_defs__ as Record<string, Function> | undefined;
    if (defs) {
      for (const [name, fn] of Object.entries(defs)) {
        (base as any).prop(name, fn as any);
      }
    }

    // Preserve define() call-time semantics if any (rewrapping: args are exposed via ctx.children)
    const inv = (tmpl as any).__hipst_invoker__ as ((ctx: UIContext<any, any, any>) => any) | undefined;
    const callable = inv
      ? toCallable(base, (s: UIComponent<any, any, any>, ...args: any[]) => {
          // Rewrapping define: capture args for ctx.children and invoke user invoker.
          const kids = flatten(args);
          (s as any)._callArgs = kids;
          // signal reactive consumers of ctx.children
          trigger((s as any), "__call_args__");
          const ctx = (s as any).uiCtx();
          (inv as any)(ctx);
          return s;
        })
      : toCallable(base, (self: UIComponent<any, any, any>, ...children: any[]) => {
          const kids = flatten(children);
          (self as UIComponent<any>).append(...kids as any);
          return self;
        });
    (base as any).__hipst_callable__ = callable;
    return callable as F;
  };

  const createInst = (): F => {
    return templateCallable ? cloneFromTemplate() : (builder!() as F);
  };

  const makeFactory = (applies: ApplyFn[]): F => {
    const callableFactory = ((...children: any[]) => {
      let inst = createInst();
      for (const apply of applies) inst = apply(inst);
      return (inst as any)(...children) as F;
    }) as unknown as F;

    // mark as factory so append() ignores plain references
    (callableFactory as any).__hipst_factory__ = true;

    // Proxy to forward method calls into queued apply functions, returning a new factory each time
    const proxy = new Proxy(callableFactory as any, {
      get(target, prop, receiver) {
        if (prop === "__hipst_factory__") return true;
        const v = (sampleTarget as any)[prop];
        if (typeof v === "function") {
          return (...args: any[]) => makeFactory([...applies, (instCallable: F) => {
            const t = (instCallable as any).__hipst_target__ as UIComponent<any, any, any>;
            const out = (t as any)[prop](...args);
            // If method returns a callable (e.g., define), switch to it; else keep current callable
            return typeof out === "function" ? (out as F) : instCallable;
          }]);
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    return proxy as F;
  };

  return makeFactory([]);
}
