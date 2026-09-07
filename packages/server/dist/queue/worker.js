"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMigrationWorker = createMigrationWorker;
const bullmq_1 = require("bullmq");
const queue_1 = require("./queue");
const process_file_1 = require("../pipeline/process-file");
/**
 * concurrency: 1 for now — process one file at a time. This is the
 * correct default given the open concurrency question from Week 3/4:
 * validateGeneratedCode's temp-file handling isn't yet safe for two
 * workers touching the same Project simultaneously. Raising concurrency
 * safely is future work, not a default to reach for casually.
 */
function createMigrationWorker(llm) {
    return new bullmq_1.Worker(queue_1.MIGRATION_QUEUE_NAME, async (job) => {
        return (0, process_file_1.processFile)(job.data.filePath, llm);
    }, { connection: queue_1.connection, concurrency: 1 });
}
