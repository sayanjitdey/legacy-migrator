import express,{Request, Response} from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { migrationQueue } from "./queue/queue";
import { setupQueueEventBroadcasting } from "./queue/queue-events";
import { commitApprovedMigration, logRejection, cloneRepo } from "./git/git-service";
import { classifyFile, ClassComponentReport } from "./core/classifier";
import { Project } from "ts-morph";

const TARGET_REPO_ROOT = process.env.TARGET_REPO_ROOT ?? path.join(__dirname, "..");

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

app.post("/api/jobs/approve", async (req, res) => {
  const { filePath, className, generatedCode } = req.body as {
    filePath?: string;
    className?: string;
    generatedCode?: string;
  };

  if (!filePath || !className || !generatedCode) {
    res.status(400).json({ error: "filePath, className, and generatedCode are required" });
    return;
  }

  try {
    const result = await commitApprovedMigration(
      TARGET_REPO_ROOT,
      filePath,
      className,
      generatedCode
    );
    console.log(`[approved] ${className} committed to ${result.branch} (${result.commitHash})`);
    res.json(result);
  } catch (err) {
    console.error("[approve] failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/jobs/reject", (req, res) => {
  const { filePath, className, reason } = req.body as {
    filePath?: string;
    className?: string;
    reason?: string;
  };
  logRejection(filePath ?? "unknown", className ?? "unknown", reason);
  res.json({ status: "rejected" });
});

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

app.post("/api/migrate-repo", async (req: Request, res: Response) => {
  const { repoUrl } = req.body as { repoUrl?: string };
  if (!repoUrl) {
    res.status(400).json({ error: "repoUrl is required" });
    return;
  }

  let repoPath: string;
  try {
    repoPath = await cloneRepo(repoUrl);
  } catch (err) {
    console.error("[migrate-repo] clone failed:", err);
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const project = new Project();
  project.addSourceFilesAtPaths([
    `${repoPath}/**/*.{tsx,jsx,js}`,
    `!${repoPath}/**/node_modules/**`,
  ]);

  const reports: ClassComponentReport[] = [];
  const filePaths: string[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    const fileReports = classifyFile(sourceFile);
    if (fileReports.length === 0) continue;
    reports.push(...fileReports);
    filePaths.push(sourceFile.getFilePath());
  }

  if (filePaths.length === 0) {
    res.json({ repoPath, classified: reports, jobIds: [] });
    return;
  }

  const jobs = await Promise.all(
    filePaths.map((filePath) => migrationQueue.add("migrate-file", { filePath }))
  );

  res.json({
    repoPath,
    classified: reports,
    jobIds: jobs.map((j: { id?: string }) => j.id),
  });
});

const PORT = Number(process.env.PORT ?? 3001);
server.listen(PORT, () => {
  console.log(`Server + WebSocket listening on http://localhost:${PORT}`);
});
