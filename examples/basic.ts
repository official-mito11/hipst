import { api, server, html, ui } from "../index.ts";

// API: GET /api/hello?q=123 -> { ok: true, q: { q: "123" } }
import { hello } from "./basic.api.ts";
import { App } from "./basic.app.ts";

// UI: simple page
 
 
server().route(hello).route(App).listen(3000, () => console.log("http://localhost:3000"));