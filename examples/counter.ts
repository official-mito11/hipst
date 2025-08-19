import { server } from "../index.ts";
import { myApi } from "./counter.api.ts";
import { App } from "./counter.app.ts";

server()
.csr("examples/counter.client.ts")
.route(App)
.route(myApi)
.listen(3000, () => {
  console.log("Counter example: http://localhost:3000");
});