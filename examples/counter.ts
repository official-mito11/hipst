import { server } from "../index.ts";
import { myApi } from "./counter.api.ts";
import { App } from "./counter.app.ts";

// Export a Server instance; do not call .listen() here. The CLI (hipst serve) will call listen().
export default server()
  .route(App)
  .route(myApi);