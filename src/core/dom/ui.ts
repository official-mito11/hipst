import { Component } from "../component";
import { UIContext } from "./context";

type Child = UIComponent<any> | string;

type Augment<S, K extends string, V> = S & { [P in K]: (value?: V) => S };
type UIHandler<V, S> = (ctx: { self: S; value: V }) => S;

export class UIComponent<CustomProps = {}> extends Component {
  private tagname: string;
  private _styles: any[];
  private _attributes: Record<string, string>;
  private _handlers: Record<string, any>;
  private _events: any[];

  constructor(tagname?: string) {
    super();
    this.tagname = tagname || "";
    this._events = [];
  }

  style(key:string, value:string) {
    this._styles.push({ key, value });
    return this;
  }

  handle<K extends string, V = boolean>(
    name: K,
    handler: UIHandler<V, this>
  ): Augment<this, K, V> {
    // Register the handler
    this._handlers[name] = handler;
  
    // Attach instance method
    const fn = ((value?: V) => {
      const finalValue = (value === undefined ? (true as unknown as V) : value) as V;
      handler({ self: this, value: finalValue });
      return this;
    }) as (value?: V) => this;
  
    // Avoid collisions and keep method non-enumerable
    if ((this as any)[name] && process?.env?.NODE_ENV !== "production") {
      console.warn(`UIComponent: overriding existing method '${String(name)}'`);
    }
    Object.defineProperty(this as any, name, {
      value: fn,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  
    return this as any;
  }

  withProps<P extends Record<string, any>>(props: P): this {
    for (const [k, v] of Object.entries(props)) {
      if (typeof (this as any)[k] === "function") {
        (this as any)[k](v);
      } else if (this._handlers[k]) {
        this._handlers[k]({ self: this, value: v });
      } else {
        // fallback: treat as attribute
        (this._attributes as any)[k] = String(v);
      }
    }
    return this;
  }

  render(children?: Child[] | Child) {
    return this;
  }
}

export function ui(tagname?: string) {
  return new UIComponent(tagname);
}

const VStack = ui('div')
  .style('display', 'flex')
  .handle<boolean | undefined>('row', ({ self, value }) =>
    self.style('flex-direction', value ? 'row' : '')
  )
  .handle<boolean | undefined>('col', ({ self, value }) =>
    self.style('flex-direction', value ? 'column' : '')
  );

// boolean shorthand:
VStack.row(true).render([
  VStack.col().render([
    Text.render("hi")
  ])
]);

// or from parsed XML props:
VStack.withProps({ row: true, col: false });