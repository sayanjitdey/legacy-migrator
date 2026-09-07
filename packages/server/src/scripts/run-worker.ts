import { Job } from "bullmq";
import { createMigrationWorker } from "../queue/worker";
import { MigrationJobData } from "../queue/queue";
import { ComponentJobResult } from "../pipeline/process-file";
import { ollamaMigrationLLM } from "../llm/llm-client-ollama";

const worker = createMigrationWorker(ollamaMigrationLLM);
console.log("Worker started, waiting for jobs...");

worker.on("completed", (job: Job<MigrationJobData, ComponentJobResult[]>) => {
  console.log(`[worker] completed job ${job.id} (${job.data.filePath})`);
});
worker.on("failed", (job: Job<MigrationJobData, ComponentJobResult[]> | undefined, err: Error) => {
  console.error(`[worker] failed job ${job?.id}:`, err.message);
});
