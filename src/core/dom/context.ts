import { Context } from "../context";
import type { UIComponent } from "./ui";

export type UIContext<S extends UIComponent<any>> =
  Omit<Context, "self"> & { self: S };