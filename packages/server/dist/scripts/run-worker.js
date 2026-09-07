"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_1 = require("../queue/worker");
// Demo stub, same one used in Week 5's demo — swap for
// anthropicMigrationLLM or ollamaMigrationLLM in a real run.
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
const worker = (0, worker_1.createMigrationWorker)(demoLLM);
console.log("Worker started, waiting for jobs...");
worker.on("completed", (job) => {
    console.log(`[worker] completed job ${job.id} (${job.data.filePath})`);
});
worker.on("failed", (job, err) => {
    console.error(`[worker] failed job ${job?.id}:`, err.message);
});
