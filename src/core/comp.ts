import type { Context, HandleFn } from "./context";
import { attachMethod, type MethodType } from "./util";

export class Component {
  constructor() {
    const handler: ProxyHandler<Component> = {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver);
        if (typeof original === "function") {
          return (...args: unknown[]) => {
            const result = original.apply(target, args);
            return result === target ? receiver : result;
          };
        }
        return original;
      },
    };
    return new Proxy(this, handler);
  }

  handle<T, K extends string, S extends Component>(
    this: S,
    name: K,
    fn: HandleFn<T, S>
  ): S & { [P in K]: MethodType<S, T> } {
    attachMethod(this, name, fn);
    return this;
  }
}
