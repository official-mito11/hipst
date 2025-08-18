import type { HandleFn } from "./context";

type OptionalParam<T> = undefined extends T ? true : [T] extends [void] ? true : false;
type MethodType<S extends Component, T> = OptionalParam<T> extends true
  ? <U extends S>(this: U, value?: T) => U
  : <U extends S>(this: U, value: T) => U;

function attachMethod<S extends Component, K extends string, T>(
  obj: S,
  name: K,
  fn: HandleFn<T, S>
): asserts obj is S & {
  [P in K]: MethodType<S, T>;
} {
  if (name in obj) {
    throw new Error(`Method ${name} already exists`);
  }
  Object.defineProperty(obj, name, {
    value: (value: T) => fn({ self: obj }, value),
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

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
