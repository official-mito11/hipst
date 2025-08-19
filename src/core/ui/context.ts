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

/**
 * UIContext represents the context in which a UIComponent is rendered.
 * It provides access to the component itself, its parent, root, state, styles, and attributes.
 */
export interface UIContext<C extends UIComponent<any, any>, S extends object = C extends UIComponent<any, infer SS> ? SS : {}> {

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
   * The styles of the component.
   */
  styles: C["styles"];

  /**
   * The attributes of the component.
   */
  attributes: C["attributes"];
}