import { Component } from "../comp";

export class Server extends Component {
  private _server: Bun.Server;

  constructor() {
    super();
  }

  listen(port: number) {
    this._server = Bun.serve({
      port: port,
      fetch(req) {
        return new Response("Hello World!")
      }
    })
  }
}