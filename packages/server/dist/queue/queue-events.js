"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupQueueEventBroadcasting = setupQueueEventBroadcasting;
const bullmq_1 = require("bullmq");
const queue_1 = require("./queue");
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
function setupQueueEventBroadcasting(broadcast) {
    const queueEvents = new bullmq_1.QueueEvents(queue_1.MIGRATION_QUEUE_NAME, { connection: queue_1.connection });
    queueEvents.on("active", async ({ jobId }) => {
        const job = await bullmq_1.Job.fromId(queue_1.migrationQueue, jobId);
        broadcast({ type: "job_active", jobId, filePath: job?.data.filePath });
    });
    queueEvents.on("completed", async ({ jobId, returnvalue }) => {
        const job = await bullmq_1.Job.fromId(queue_1.migrationQueue, jobId);
        let results = returnvalue;
        try {
            results = JSON.parse(returnvalue);
        }
        catch {
            // returnvalue wasn't JSON — pass it through as-is rather than crash.
        }
        broadcast({ type: "job_completed", jobId, filePath: job?.data.filePath, results });
    });
    queueEvents.on("failed", async ({ jobId, failedReason }) => {
        const job = await bullmq_1.Job.fromId(queue_1.migrationQueue, jobId);
        broadcast({ type: "job_failed", jobId, filePath: job?.data.filePath, reason: failedReason });
    });
    return queueEvents;
}
