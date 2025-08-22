// auto wrapper (fe-build)
import { mount } from "./runtime.mjs";
import * as Mod from "./app.entry.mjs";
const Root = Mod["App"];
const el = document.getElementById("__hipst_app__");
if (el && Root) mount(Root, el);
