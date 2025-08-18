import { Context } from "../context";
import type { UIComponent } from "./component";

export type UIContext<C extends UIComponent> = {
  self: C;
  state: C['state'];
}