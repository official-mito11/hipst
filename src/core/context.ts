import type { Component } from "./comp";

export interface Context<C extends Component> {
  self: C;
}

// A value that can be a static literal or a function of a context
export type ValueOrFn<T, Ctx> = T | ((ctx: Ctx) => T);

export function resolveValue<T, Ctx>(ctx: Ctx, v: ValueOrFn<T, Ctx>): T {
  return typeof v === "function" ? (v as (c: Ctx) => T)(ctx) : v;
}

export type HandleFn<T, C extends Component> = (
  ctx: Context<C>,
  value: T
) => C;