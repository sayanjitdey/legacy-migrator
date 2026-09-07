import express, { Request, Response } from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { migrationQueue } from "./queue/queue";
import { setupQueueEventBroadcasting } from "./queue/queue-events";

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set<WebSocket>();

wss.on("connection", (ws: WebSocket) => {
  clients.add(ws);
  console.log(`[ws] client connected (${clients.size} total)`);
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });
});

function broadcast(message: unknown) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

setupQueueEventBroadcasting(broadcast);

app.post("/api/migrate", async (req: Request, res: Response) => {
  const { files } = req.body as { files?: string[] };
  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "files must be a non-empty array of file paths" });
    return;
  }

  const jobs = await Promise.all(
    files.map((filePath) => migrationQueue.add("migrate-file", { filePath }))
  );
  res.json({ jobIds: jobs.map((j: { id?: string }) => j.id) });
});

const PORT = Number(process.env.PORT ?? 3001);
server.listen(PORT, () => {
  console.log(`Server + WebSocket listening on http://localhost:${PORT}`);
});
