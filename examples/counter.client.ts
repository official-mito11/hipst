import { mount } from "../index.ts";
import { App } from "./counter.app.ts";
import "./counter.css";

const container = document.getElementById("__hipst_app__");
if (container) {
  mount(App, container);
}
