import { Project } from "ts-morph";
import path from "path";
import { classifyFile } from "../core/classifier";
import { migrateWithRetry } from "../llm/retry-loop";
import { MigrationLLM } from "../llm/llm-types";

const project = new Project();
const searchBoxPath = path.join(__dirname, "..", "..", "src", "fixtures", "02-search-box.tsx");
const sourceFile = project.addSourceFileAtPath(searchBoxPath);
const cls = sourceFile.getClasses()[0];
const report = classifyFile(sourceFile)[0]; // SearchBox -> NEEDS_LLM
const classSourceText = cls.getText();

// --- Scenario 1: fails once (leaves `this.debounceTimer` in a plain
// function, a realistic mistake), then self-corrects on the second
// attempt using the validator's error as feedback. ---
async function scenarioSucceedsOnRetry() {
  let callCount = 0;
  const stubLLM: MigrationLLM = async () => {
    callCount++;
    if (callCount === 1) {
      return `import React, { useState, useEffect } from "react";

function SearchBox(props: any) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async (query: string) => {
    setLoading(true);
    const r = query ? [\`\${query}-result-1\`, \`\${query}-result-2\`] : [];
    setResults(r);
    setLoading(false);
    props.onResultsChange(r);
  };

  useEffect(() => {
    runSearch(props.query);
  }, []);

  useEffect(() => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => runSearch(props.query), 300);
    return () => { if (this.debounceTimer) clearTimeout(this.debounceTimer); };
  }, [props.query]);

  return (
    <div>{loading ? <span>Loading...</span> : null}<ul>{results.map((r) => <li key={r}>{r}</li>)}</ul></div>
  );
}
export default SearchBox;`;
    }
    return `import React, { useState, useEffect, useRef } from "react";

function SearchBox(props: any) {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async (query: string) => {
    setLoading(true);
    const r = query ? [\`\${query}-result-1\`, \`\${query}-result-2\`] : [];
    setResults(r);
    setLoading(false);
    props.onResultsChange(r);
  };

  useEffect(() => {
    runSearch(props.query);
  }, []);

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
  };

  const outcome = await migrateWithRetry(searchBoxPath, classSourceText, report, stubLLM, "");
  console.log("=== Scenario 1: succeeds on retry ===");
  console.log(`status: ${outcome.status}, attempts: ${outcome.attempts}`);
  console.log("");
}

// --- Scenario 2: the stub never produces valid code. Confirms the loop
// gives up after maxAttempts rather than retrying forever. ---
async function scenarioNeverSucceeds() {
  const alwaysBrokenLLM: MigrationLLM = async () => {
    return `function SearchBox(props) { return this.nonsense; }`;
  };

  const outcome = await migrateWithRetry(
    searchBoxPath,
    classSourceText,
    report,
    alwaysBrokenLLM,
    "",
    2 // maxAttempts, lowered just for this demo
  );
  console.log("=== Scenario 2: never succeeds, escalates ===");
  console.log(`status: ${outcome.status}, attempts: ${outcome.attempts}`);
  console.log("final diagnostics:", outcome.finalDiagnostics);
}

(async () => {
  await scenarioSucceedsOnRetry();
  await scenarioNeverSucceeds();
})();
