import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { createRpgServerTransport } from "@rpgjs/server/node";
import RpgServer from "./server";

const port = Number.parseInt(process.env.RPGJS_PORT || "8001", 10);
const host = process.env.RPGJS_HOST || "0.0.0.0";
const transport = createRpgServerTransport(RpgServer, {
  tiledBasePaths: ["dist/client/map", "src/tiled"],
});
const websocketServer = new WebSocketServer({ noServer: true });

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "rpgjs-world" }));
    return;
  }
  void transport.handleNodeRequest(request, response, () => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
});

server.on("upgrade", (request, socket, head) => {
  void transport.handleUpgrade(websocketServer, request, socket, head).then((handled) => {
    if (!handled) socket.destroy();
  });
});

server.listen(port, host, () => {
  console.log(`RPGJS world authority listening on http://${host}:${port}`);
});

function shutdown() {
  websocketServer.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
