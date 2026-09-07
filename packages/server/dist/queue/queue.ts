import { Queue } from "bullmq";

// A bare host/port object, not a live connection — BullMQ opens its own
// ioredis connections from this config wherever it's passed (Queue,
// Worker, QueueEvents). Sharing the config object (not a connection
// instance) is the documented BullMQ pattern.
export const connection = { host: "127.0.0.1", port: 6379 };

export const MIGRATION_QUEUE_NAME = "migrations";

export const migrationQueue = new Queue(MIGRATION_QUEUE_NAME, { connection });

export interface MigrationJobData {
  filePath: string;
}
