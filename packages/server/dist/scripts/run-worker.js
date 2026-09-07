"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_1 = require("../queue/worker");
const llm_client_ollama_1 = require("../llm/llm-client-ollama");
const worker = (0, worker_1.createMigrationWorker)(llm_client_ollama_1.ollamaMigrationLLM);
console.log("Worker started, waiting for jobs...");
worker.on("completed", (job) => {
    console.log(`[worker] completed job ${job.id} (${job.data.filePath})`);
});
worker.on("failed", (job, err) => {
    console.error(`[worker] failed job ${job?.id}:`, err.message);
});
