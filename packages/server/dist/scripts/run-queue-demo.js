"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const queue_1 = require("../queue/queue");
const worker_1 = require("../queue/worker");
const fixturesDir = path_1.default.join(__dirname, "..", "..", "src", "fixtures");
const files = ["01-simple-counter.tsx", "02-search-box.tsx", "03-modal-with-ref.tsx"];
/**
 * Demo-only stub. In a real run, swap this for anthropicMigrationLLM or
 * ollamaMigrationLLM — the worker doesn't know or care which, same as
 * every other place MigrationLLM has been used so far. Returns a known-
 * good SearchBox migration so this demo's outcome is deterministic and
 * doesn't depend on network access or an API key existing.
 */
const demoLLM = async () => `import React, { useState, useEffect, useRef } from "react";
function SearchBox(props: any) {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = async (query: string) => {
    setLoading(true);
    const r = query ? [\`\${query}-result-1\`] : [];
    setResults(r);
    setLoading(false);
    props.onResultsChange(r);
  };
  useEffect(() => { runSearch(props.query); }, []);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(props.query), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [props.query]);
  return (
    <div>{loading ? <span>Loading...</span> : null}<ul>{results.map((r) => <li key={r}>{r}</li>)}</ul></div>
  );
}
export default SearchBox;`;
async function main() {
    // Clear any leftover jobs from a previous run of this demo so results
    // are always exactly the three files below, nothing stale from before.
    await queue_1.migrationQueue.obliterate({ force: true });
    const worker = (0, worker_1.createMigrationWorker)(demoLLM);
    const collected = [];
    worker.on("completed", (job) => {
        const returnValue = job.returnvalue;
        console.log(`\n[completed] job ${job.id} — ${job.data.filePath}`);
        for (const r of returnValue) {
            console.log(`  ${r.className}: tier=${r.tier} status=${r.status} attempts=${r.attempts}`);
        }
        collected.push({ file: job.data.filePath, results: returnValue });
        if (collected.length === files.length) {
            finish(worker);
        }
    });
    worker.on("failed", (job, err) => {
        console.error(`[failed] job ${job?.id}:`, err.message);
    });
    console.log(`Enqueuing ${files.length} jobs...`);
    for (const file of files) {
        const job = await queue_1.migrationQueue.add("migrate-file", {
            filePath: path_1.default.join(fixturesDir, file),
        });
        console.log(`  enqueued job ${job.id} for ${file}`);
    }
}
async function finish(worker) {
    console.log("\nAll jobs completed. Shutting down.");
    await worker.close();
    await queue_1.migrationQueue.close();
    process.exit(0);
}
main();
