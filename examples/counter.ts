import { server } from "../index.ts";
import { myApi } from "./counter.api.ts";
import { App } from "./counter.app.ts";

server()
  .route(App)
  .route(myApi)
  .listen(3000);