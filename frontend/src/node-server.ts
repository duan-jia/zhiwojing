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
  void (async () => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const token = url.searchParams.get("token") || "";
    if (process.env.AUTH_REQUIRED === "1") {
      if (!token) return socket.destroy();
      const apiUrl = process.env.AVATAR_API_URL || "http://127.0.0.1:8000";
      try {
        const verification = await fetch(`${apiUrl}/api/me`, { headers: { authorization: `Bearer ${token}` } });
        if (!verification.ok) return socket.destroy();
        const user = await verification.json() as { id?: number };
        if (!Number.isInteger(user.id)) return socket.destroy();
        url.searchParams.set("avatar_id", String(user.id));
        request.url = `${url.pathname}${url.search}`;
      } catch {
        return socket.destroy();
      }
    }
    const handled = await transport.handleUpgrade(websocketServer, request, socket, head);
    if (!handled) socket.destroy();
  })();
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
