import type { UIComponent } from "./comp";

export interface UIContext<C extends UIComponent> {
  self: C;
  parent: C;
  state: C['state'];
  styles: C['styles'];
  attributes: C['attributes'];
}