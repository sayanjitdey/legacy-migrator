import { QueueEvents, Job } from "bullmq";
import { connection, migrationQueue, MIGRATION_QUEUE_NAME } from "./queue";

export type BroadcastFn = (message: unknown) => void;

/**
 * QueueEvents is BullMQ's pub/sub-based event stream — it's fed by Redis
 * itself (via keyspace notifications under the hood), so it fires even if
 * the event originated from a worker running in a totally different
 * process. That's exactly the real deployment shape: the Worker (Week 5)
 * and this server can run as two separate processes, and this still
 * works correctly, because neither one is calling the other directly —
 * they're both just reacting to what Redis says happened.
 *
 * This function takes a `broadcast` callback rather than importing `ws`
 * directly — same reason process-file.ts doesn't import bullmq: this
 * logic (what a job-completed event MEANS) shouldn't need to change if
 * the transport (WebSocket, SSE, anything) changes later.
 */
export function setupQueueEventBroadcasting(broadcast: BroadcastFn): QueueEvents {
  const queueEvents = new QueueEvents(MIGRATION_QUEUE_NAME, { connection });

  queueEvents.on("active", async ({ jobId }) => {
    const job = await Job.fromId(migrationQueue, jobId);
    broadcast({ type: "job_active", jobId, filePath: job?.data.filePath });
  });

  queueEvents.on("completed", async ({ jobId, returnvalue }) => {
    const job = await Job.fromId(migrationQueue, jobId);
    let results: unknown = returnvalue;
    try {
      results = JSON.parse(returnvalue);
    } catch {
      // returnvalue wasn't JSON — pass it through as-is rather than crash.
    }
    broadcast({ type: "job_completed", jobId, filePath: job?.data.filePath, results });
  });

  queueEvents.on("failed", async ({ jobId, failedReason }) => {
    const job = await Job.fromId(migrationQueue, jobId);
    broadcast({ type: "job_failed", jobId, filePath: job?.data.filePath, reason: failedReason });
  });

  return queueEvents;
}
