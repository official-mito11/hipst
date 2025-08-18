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
