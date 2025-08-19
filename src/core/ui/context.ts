import type { UIComponent } from "./comp";

/**
 * UIContext represents the context in which a UIComponent is rendered.
 * It provides access to the component itself, its parent, root, state, styles, and attributes.
 */
export interface UIContext<C extends UIComponent<any>> {

  /**
   * The component itself.
   */
  self: C;
  /**
   * The parent component, if any.
   */
  parent?: UIComponent<any>;

  /**
   * The root component of the UI tree, if any.
   */
  root?: UIComponent<any>;

  /**
   * The state of the component.
   */
  state: C["state"];

  /**
   * The styles of the component.
   */
  styles: C["styles"];

  /**
   * The attributes of the component.
   */
  attributes: C["attributes"];
}