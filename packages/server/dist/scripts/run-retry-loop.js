"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const path_1 = __importDefault(require("path"));
const classifier_1 = require("../core/classifier");
const retry_loop_1 = require("../llm/retry-loop");
const project = new ts_morph_1.Project();
const searchBoxPath = path_1.default.join(__dirname, "..", "..", "src", "fixtures", "02-search-box.tsx");
const sourceFile = project.addSourceFileAtPath(searchBoxPath);
const cls = sourceFile.getClasses()[0];
const report = (0, classifier_1.classifyFile)(sourceFile)[0]; // SearchBox -> NEEDS_LLM
const classSourceText = cls.getText();
// --- Scenario 1: fails once (leaves `this.debounceTimer` in a plain
// function, a realistic mistake), then self-corrects on the second
// attempt using the validator's error as feedback. ---
async function scenarioSucceedsOnRetry() {
    let callCount = 0;
    const stubLLM = async () => {
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
    const outcome = await (0, retry_loop_1.migrateWithRetry)(searchBoxPath, classSourceText, report, stubLLM, "");
    console.log("=== Scenario 1: succeeds on retry ===");
    console.log(`status: ${outcome.status}, attempts: ${outcome.attempts}`);
    console.log("");
}
// --- Scenario 2: the stub never produces valid code. Confirms the loop
// gives up after maxAttempts rather than retrying forever. ---
async function scenarioNeverSucceeds() {
    const alwaysBrokenLLM = async () => {
        return `function SearchBox(props) { return this.nonsense; }`;
    };
    const outcome = await (0, retry_loop_1.migrateWithRetry)(searchBoxPath, classSourceText, report, alwaysBrokenLLM, "", 2 // maxAttempts, lowered just for this demo
    );
    console.log("=== Scenario 2: never succeeds, escalates ===");
    console.log(`status: ${outcome.status}, attempts: ${outcome.attempts}`);
    console.log("final diagnostics:", outcome.finalDiagnostics);
}
(async () => {
    await scenarioSucceedsOnRetry();
    await scenarioNeverSucceeds();
})();
