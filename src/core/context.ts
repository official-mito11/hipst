import type { Component } from "./component";

export interface Context<C extends Component> {
    self: C;
}

export type HandleFn<T, C extends Component> = (ctx: Context<C>, value: T) => C;