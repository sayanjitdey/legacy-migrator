"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const queue_1 = require("./queue/queue");
const queue_events_1 = require("./queue/queue-events");
const git_service_1 = require("./git/git-service");
const TARGET_REPO_ROOT = process.env.TARGET_REPO_ROOT ?? path_1.default.join(__dirname, "..");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
const clients = new Set();
wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[ws] client connected (${clients.size} total)`);
    ws.on("close", () => {
        clients.delete(ws);
        console.log(`[ws] client disconnected (${clients.size} total)`);
    });
});
function broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of clients) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(payload);
        }
    }
}
(0, queue_events_1.setupQueueEventBroadcasting)(broadcast);
app.post("/api/jobs/approve", async (req, res) => {
    const { filePath, className, generatedCode } = req.body;
    if (!filePath || !className || !generatedCode) {
        res.status(400).json({ error: "filePath, className, and generatedCode are required" });
        return;
    }
    try {
        const result = await (0, git_service_1.commitApprovedMigration)(TARGET_REPO_ROOT, filePath, className, generatedCode);
        console.log(`[approved] ${className} committed to ${result.branch} (${result.commitHash})`);
        res.json(result);
    }
    catch (err) {
        console.error("[approve] failed:", err);
        res.status(500).json({ error: err.message });
    }
});
app.post("/api/jobs/reject", (req, res) => {
    const { filePath, className, reason } = req.body;
    (0, git_service_1.logRejection)(filePath ?? "unknown", className ?? "unknown", reason);
    res.json({ status: "rejected" });
});
app.post("/api/migrate", async (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: "files must be a non-empty array of file paths" });
        return;
    }
    const jobs = await Promise.all(files.map((filePath) => queue_1.migrationQueue.add("migrate-file", { filePath })));
    res.json({ jobIds: jobs.map((j) => j.id) });
});
const PORT = Number(process.env.PORT ?? 3001);
server.listen(PORT, () => {
    console.log(`Server + WebSocket listening on http://localhost:${PORT}`);
});
