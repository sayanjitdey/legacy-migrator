import { Worker, Job } from "bullmq";
import { connection, MIGRATION_QUEUE_NAME, MigrationJobData } from "./queue";
import { processFile, ComponentJobResult } from "../pipeline/process-file";
import { MigrationLLM } from "../llm/llm-types";

/**
 * concurrency: 1 for now — process one file at a time. This is the
 * correct default given the open concurrency question from Week 3/4:
 * validateGeneratedCode's temp-file handling isn't yet safe for two
 * workers touching the same Project simultaneously. Raising concurrency
 * safely is future work, not a default to reach for casually.
 */
export function createMigrationWorker(llm: MigrationLLM): Worker {
  return new Worker<MigrationJobData, ComponentJobResult[]>(
    MIGRATION_QUEUE_NAME,
    async (job: Job<MigrationJobData>) => {
      return processFile(job.data.filePath, llm);
    },
    { connection, concurrency: 1 }
  );
}
