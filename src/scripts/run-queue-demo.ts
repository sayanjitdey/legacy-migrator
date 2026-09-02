import path from "path";
import { migrationQueue } from "../queue/queue";
import { createMigrationWorker } from "../queue/worker";
import { MigrationLLM } from "../llm/llm-types";
import { ComponentJobResult } from "../pipeline/process-file";

const fixturesDir = path.join(__dirname, "..", "..", "src", "fixtures");
const files = ["01-simple-counter.tsx", "02-search-box.tsx", "03-modal-with-ref.tsx"];

/**
 * Demo-only stub. In a real run, swap this for anthropicMigrationLLM or
 * ollamaMigrationLLM — the worker doesn't know or care which, same as
 * every other place MigrationLLM has been used so far. Returns a known-
 * good SearchBox migration so this demo's outcome is deterministic and
 * doesn't depend on network access or an API key existing.
 */
const demoLLM: MigrationLLM = async () => `import React, { useState, useEffect, useRef } from "react";
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
  await migrationQueue.obliterate({ force: true });

  const worker = createMigrationWorker(demoLLM);
  const collected: { file: string; results: ComponentJobResult[] }[] = [];

  worker.on("completed", (job) => {
    const returnValue = job.returnvalue as ComponentJobResult[];
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
    const job = await migrationQueue.add("migrate-file", {
      filePath: path.join(fixturesDir, file),
    });
    console.log(`  enqueued job ${job.id} for ${file}`);
  }
}

async function finish(worker: import("bullmq").Worker) {
  console.log("\nAll jobs completed. Shutting down.");
  await worker.close();
  await migrationQueue.close();
  process.exit(0);
}

main();
