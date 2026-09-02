import { Project } from "ts-morph";
import { classifyFile } from "../core/classifier";
import { generateHooksComponent } from "../core/codemod";
import { validateGeneratedCode } from "../core/validator";
import { migrateWithRetry } from "../llm/retry-loop";
import { MigrationLLM } from "../llm/llm-types";

export interface ComponentJobResult {
  filePath: string;
  className: string;
  tier: string;
  status: "done" | "needs_human" | "skipped_hard_stop";
  attempts: number;
  diagnostics: string[];
}

/**
 * This function is deliberately queue-agnostic — it knows nothing about
 * BullMQ. That's what makes it testable directly (see run-queue-demo.ts
 * calling it indirectly through the worker) without needing Redis running
 * just to check the dispatch logic is correct. The Worker in worker.ts is
 * a thin wrapper that only adds "how do I get called" on top of this.
 */
export async function processFile(
  filePath: string,
  llm: MigrationLLM
): Promise<ComponentJobResult[]> {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(filePath);
  const reports = classifyFile(sourceFile);
  const results: ComponentJobResult[] = [];

  for (const report of reports) {
    const cls = sourceFile.getClasses().find((c) => c.getName() === report.className);
    if (!cls) continue;

    if (report.tier === "NEEDS_HUMAN") {
      // Never attempt a transform for hard-stop cases — this tier exists
      // specifically to prevent automated changes to HOC-wrapped or
      // imperative-ref components. The queue's job is to route this to a
      // human review queue (Week 6 UI), not to skip it silently.
      results.push({
        filePath,
        className: report.className,
        tier: report.tier,
        status: "skipped_hard_stop",
        attempts: 0,
        diagnostics: report.reasons,
      });
      continue;
    }

    if (report.tier === "MECHANICAL") {
      const code = generateHooksComponent(cls);
      const validation = validateGeneratedCode(filePath, code);
      results.push({
        filePath,
        className: report.className,
        tier: report.tier,
        status: validation.valid ? "done" : "needs_human",
        attempts: 1,
        diagnostics: validation.diagnostics,
      });
      continue;
    }

    // NEEDS_LLM
    const outcome = await migrateWithRetry(filePath, cls.getText(), report, llm);
    results.push({
      filePath,
      className: report.className,
      tier: report.tier,
      status: outcome.status,
      attempts: outcome.attempts,
      diagnostics: outcome.finalDiagnostics,
    });
  }

  return results;
}
