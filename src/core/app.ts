export class App {
  private _server: Bun.Server;
  listen(port: number) {
    this._server = Bun.serve({
      port: port,
      fetch(req) {
        return new Response("Hello World!")
      }
    })
  }
}