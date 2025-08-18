import { Component } from "../component";
import { UIContext } from "./context";

export class UIComponent<CustomProps = {}, State = {}> extends Component {
  private _element: string = "";
  state: State = {} as State;

  constructor(tagname?: string) {
    super();
    this._element = tagname || "";
    this._handles = new Map();

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        const propName = String(prop);

        if (target._handles.has(propName)) {
          const method = target._handles.get(propName)!;
          return (ctx: UIContext<typeof this>) => {
            const result = method(ctx);
            return result === target ? receiver : result;
          };
        }

        const originalValue = Reflect.get(target, prop, receiver);
        if (typeof originalValue === 'function') {
          return (...args: any[]) => {
            const result = originalValue.apply(target, args);
            return result === target ? receiver : result;
          };
        }
        
        return originalValue;
      }
    });

  }
  prop(name, fn){}

}

export function ui(tagname?: string) {
  return new UIComponent(tagname);
}

ui('div')
.style('display', 'flex')
(
  ui('span')("Text here!")
  ui('button')("Click me!")
)

