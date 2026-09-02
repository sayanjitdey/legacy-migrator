import { validateGeneratedCode } from "./validator";
import { MigrationLLM } from "./llm-types";
import { ClassComponentReport } from "./classifier";

export interface MigrationOutcome {
  status: "done" | "needs_human";
  code: string;
  attempts: number;
  finalDiagnostics: string[];
}

/**
 * The agent loop for NEEDS_LLM-tier components. Structurally this is the
 * same loop shape from the GenAI agent notes: propose -> validate (the
 * "tool call" here is the validator, not an LLM-visible tool) -> if it
 * fails, feed the failure back as context -> retry, capped -> escalate.
 *
 * Deliberately does NOT retry forever, and deliberately does NOT touch
 * git or mark anything as "done" for a human — it only returns a result;
 * Week 5's job queue decides what happens with a needs_human outcome.
 */
export async function migrateWithRetry(
  originalFilePath: string,
  classSourceText: string,
  report: ClassComponentReport,
  llm: MigrationLLM,
  maxAttempts = 3
): Promise<MigrationOutcome> {
  let previousAttemptError: string | undefined;
  let lastCode = "";
  let lastDiagnostics: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = await llm({
      classSourceText,
      reasonsForLLMTier: report.reasons,
      previousAttemptError,
    });

    const result = validateGeneratedCode(originalFilePath, code);
    lastCode = code;
    lastDiagnostics = result.diagnostics;

    if (result.valid) {
      return { status: "done", code, attempts: attempt, finalDiagnostics: [] };
    }

    // Feed the failure back as context for the next attempt — this is
    // the entire "agent" behavior: the loop doesn't know how to fix
    // anything itself, it just gives the model its own mistake back.
    previousAttemptError = result.diagnostics.join("\n");
  }

  return {
    status: "needs_human",
    code: lastCode,
    attempts: maxAttempts,
    finalDiagnostics: lastDiagnostics,
  };
}
