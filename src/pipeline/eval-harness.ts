import { Project } from "ts-morph";
import path from "path";
import { classifyFile } from "./classifier";
import { migrateWithRetry } from "./retry-loop";
import { MigrationLLM } from "./llm-types";

export interface TrialResult {
  trial: number;
  status: "done" | "needs_human";
  attempts: number;
  hasDebounceTimer: boolean;
  clearsTimerBeforeSettingNew: boolean;
  dependencyArrayIsMinimal: boolean;
}

/**
 * IMPORTANT: these heuristic checks are text-pattern-based, not real
 * behavioral verification. They exist because `validateGeneratedCode`
 * only proves the code COMPILES, not that it's behaviorally correct — see
 * the debounce-dropping bug from the previous run. A real eval would run
 * the component and assert on actual behavior (e.g. with React Testing
 * Library and fake timers). This is a cheap, fast proxy for that, and it
 * WILL have false positives/negatives — treat the pass rate as a signal
 * worth investigating, not ground truth.
 */
function runHeuristicChecks(code: string): Omit<TrialResult, "trial" | "status" | "attempts"> {
  const hasDebounceTimer = /setTimeout/.test(code);
  const clearsTimerBeforeSettingNew =
    /clearTimeout/.test(code) && hasDebounceTimer;

  // Extract the useEffect dependency array that contains "query" and
  // check whether it ALSO contains "onResultsChange" — the over-broad
  // deps bug from the second run. This is a narrow, fixture-specific
  // check, not a general-purpose one.
  const depArrayMatch = code.match(/\},\s*\[([^\]]*)\]\s*\)/);
  const depArrayText = depArrayMatch?.[1] ?? "";
  const dependencyArrayIsMinimal =
    depArrayText.includes("query") && !depArrayText.includes("onResultsChange");

  return { hasDebounceTimer, clearsTimerBeforeSettingNew, dependencyArrayIsMinimal };
}

export async function runEvalTrials(
  fixturePath: string,
  llm: MigrationLLM,
  numTrials: number
): Promise<TrialResult[]> {
  const results: TrialResult[] = [];

  for (let trial = 1; trial <= numTrials; trial++) {
    // Fresh Project + fresh classification each trial, matching exactly
    // what a real single migration run would do — no shared state
    // leaking between trials that could bias the result.
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(fixturePath);
    const cls = sourceFile.getClasses()[0];
    const report = classifyFile(sourceFile)[0];
    const classSourceText = cls.getText();

    const outcome = await migrateWithRetry(fixturePath, classSourceText, report, llm);
    const heuristics = runHeuristicChecks(outcome.code);

    results.push({
      trial,
      status: outcome.status,
      attempts: outcome.attempts,
      ...heuristics,
    });

    console.log(
      `Trial ${trial}: status=${outcome.status} attempts=${outcome.attempts} ` +
        `debounce=${heuristics.hasDebounceTimer} clearsOldTimer=${heuristics.clearsTimerBeforeSettingNew} ` +
        `minimalDeps=${heuristics.dependencyArrayIsMinimal}`
    );
  }

  return results;
}

export function printSummary(results: TrialResult[]) {
  const n = results.length;
  const pct = (count: number) => `${count}/${n} (${Math.round((count / n) * 100)}%)`;

  const compiled = results.filter((r) => r.status === "done").length;
  const hasDebounce = results.filter((r) => r.hasDebounceTimer).length;
  const clearsOldTimer = results.filter((r) => r.clearsTimerBeforeSettingNew).length;
  const minimalDeps = results.filter((r) => r.dependencyArrayIsMinimal).length;
  const avgAttempts = (results.reduce((sum, r) => sum + r.attempts, 0) / n).toFixed(1);

  console.log("\n=== Summary ===");
  console.log(`Compiled successfully:        ${pct(compiled)}`);
  console.log(`Preserved debounce timer:     ${pct(hasDebounce)}`);
  console.log(`Cleared old timer correctly:  ${pct(clearsOldTimer)}`);
  console.log(`Minimal dependency array:     ${pct(minimalDeps)}`);
  console.log(`Average attempts per trial:   ${avgAttempts}`);
}
