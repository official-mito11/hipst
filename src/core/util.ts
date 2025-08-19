import type { OptionalParam } from "../types";
import type { Component } from "./comp";
import type { HandleFn } from "./context";

export type MethodType<S extends Component, T> = OptionalParam<T> extends true
  ? <U extends S>(this: U, value?: T) => U
  : <U extends S>(this: U, value: T) => U;

export function attachMethod<S extends Component, K extends string, T>(
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

// Turn an object and a call-implementation into a callable proxy that preserves
// method chaining semantics. Any method returning the original target will
// return the proxy instead, enabling fluent APIs.
export function toCallable<T extends object, A extends any[], R = T>(
  target: T,
  callImpl: (thisObj: T, ...args: A) => R | T
): T & ((...args: A) => R) {
  const callable = function (this: any, ...args: A) {
    const res = callImpl(target, ...args);
    return (res === target ? proxy : res) as any;
  } as unknown as T & ((...args: A) => R);

  const handler: ProxyHandler<any> = {
    get(_t, prop, receiver) {
      // Allow unwrapping original target from the callable proxy
      if (prop === "__hipst_target__") {
        return target as any;
      }
      const v = (target as any)[prop];
      if (typeof v === "function") {
        return (...args: unknown[]) => {
          const out = v.apply(target, args);
          return out === target ? receiver : out;
        };
      }
      return v;
    },
    set(_t, prop, value) {
      (target as any)[prop] = value;
      return true;
    },
    has(_t, prop) {
      return prop in target;
    },
    ownKeys() {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_t, prop) {
      return Object.getOwnPropertyDescriptor(target, prop);
    },
  };

  const proxy = new Proxy(callable, handler);
  return proxy as any;
}

// Unwrap a callable proxy created by toCallable back to its original target
export function unwrap<T = any>(v: any): T {
  if (v && (typeof v === "object" || typeof v === "function") && (v as any).__hipst_target__) {
    return (v as any).__hipst_target__ as T;
  }
  return v as T;
}
