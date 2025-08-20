import type { UIComponent } from "./comp";

// Lightweight state view used inside UIContext to avoid circular type instantiation with UIComponent.state
export type StateCtx<S extends object = {}> = {
  [K in keyof S]: S[K];
} & {
  // callable initializer forms; returns unknown to keep it lightweight
  (obj: Record<string, unknown>): unknown;
  <K extends keyof S & string>(key: K, value: S[K]): unknown;
  <K extends string, V>(key: K, value: V): unknown;
};

// Lightweight props view used inside UIContext so handlers can read other prop values.
// Values are resolved (ValueOrFn applied with current UIContext) on access.
export type PropsCtx<P extends object = {}> = {
  [K in keyof P]: P[K];
} & { [key: string]: unknown };

/**
 * UIContext represents the context in which a UIComponent is rendered.
 * It provides access to the component itself, its parent, root, state, styles, and attributes.
 */
export interface UIContext<
  C extends UIComponent<any, any, any>,
  S extends object = C extends UIComponent<any, infer SS, any> ? SS : {},
  P extends object = C extends UIComponent<any, any, infer PP> ? PP : {}
> {

  /**
   * The component itself.
   */
  self: C;
  /**
   * The parent component, if any.
   */
  parent?: UIComponent<any, any>;

  /**
   * The root component of the UI tree, if any.
   */
  root?: UIComponent<any, any>;

  /**
   * The state of the component.
   */
  state: StateCtx<S>;

  /**
   * Dynamic prop bag set via UIComponent.prop(). Values are stored raw (ValueOrFn) and
   * resolved on access; can be referenced from other prop handlers.
   */
  props: PropsCtx<P>;

  /**
   * The styles of the component.
   */
  styles: C["styles"];

  /**
   * The attributes of the component.
   */
  attributes: C["attributes"];
}