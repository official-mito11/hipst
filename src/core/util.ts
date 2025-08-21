import type { OptionalParam } from "../types";
import type { Component } from "./comp";
import { resolveValue, type Context, type HandleFn, type ValueOrFn } from "./context";

export type MethodType<S extends Component, T> = OptionalParam<T> extends true
  ? <U extends S>(this: U, value?: ValueOrFn<T, Context<U>>) => U
  : <U extends S>(this: U, value: ValueOrFn<T, Context<U>>) => U;

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
    value: (value?: ValueOrFn<T, Context<S>>) => {
      const ctx = { self: obj } as Context<S>;
      const resolved = resolveValue(ctx, value as any);
      return fn(ctx, resolved as T);
    },
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
      // Ensure built-in function machinery works on the callable proxy itself
      // so accessing .apply/.call/.bind (or function metadata) does not forward to the target object.
      if (
        prop === "apply" ||
        prop === "call" ||
        prop === "bind" ||
        prop === "length" ||
        prop === "name" ||
        prop === "toString"
      ) {
        // Reflect off the underlying callable function, not the target object
        return Reflect.get(callable as any, prop, receiver);
      }
      const v = (target as any)[prop];
      if (typeof v === "function") {
        // Respect opt-out for wrapping (e.g., state facade proxy)
        if ((v as any)?.__hipst_no_wrap__) return v;
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
