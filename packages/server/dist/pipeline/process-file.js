"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processFile = processFile;
const ts_morph_1 = require("ts-morph");
const classifier_1 = require("../core/classifier");
const codemod_1 = require("../core/codemod");
const validator_1 = require("../core/validator");
const retry_loop_1 = require("../llm/retry-loop");
/**
 * This function is deliberately queue-agnostic — it knows nothing about
 * BullMQ. That's what makes it testable directly (see run-queue-demo.ts
 * calling it indirectly through the worker) without needing Redis running
 * just to check the dispatch logic is correct. The Worker in worker.ts is
 * a thin wrapper that only adds "how do I get called" on top of this.
 */
async function processFile(filePath, llm) {
    const project = new ts_morph_1.Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    const reports = (0, classifier_1.classifyFile)(sourceFile);
    const results = [];
    for (const report of reports) {
        const cls = sourceFile.getClasses().find((c) => c.getName() === report.className);
        if (!cls)
            continue;
        const originalCode = cls.getText();
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
                originalCode,
                generatedCode: null,
            });
            continue;
        }
        if (report.tier === "MECHANICAL") {
            const code = (0, codemod_1.generateHooksComponent)(cls);
            const validation = (0, validator_1.validateGeneratedCode)(filePath, code);
            results.push({
                filePath,
                className: report.className,
                tier: report.tier,
                status: validation.valid ? "done" : "needs_human",
                attempts: 1,
                diagnostics: validation.diagnostics,
                originalCode,
                generatedCode: code,
            });
            continue;
        }
        // NEEDS_LLM
        const outcome = await (0, retry_loop_1.migrateWithRetry)(filePath, originalCode, report, llm);
        results.push({
            filePath,
            className: report.className,
            tier: report.tier,
            status: outcome.status,
            attempts: outcome.attempts,
            diagnostics: outcome.finalDiagnostics,
            originalCode,
            generatedCode: outcome.code || null,
        });
    }
    return results;
}
