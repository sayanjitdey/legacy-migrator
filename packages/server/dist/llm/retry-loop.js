"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateWithRetry = migrateWithRetry;
const validator_1 = require("../core/validator");
const error_feedback_1 = require("../core/error-feedback");
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
async function migrateWithRetry(originalFilePath, classSourceText, report, llm, existingImports = "", maxAttempts = 3) {
    let previousAttemptError;
    let lastCode = "";
    let lastDiagnostics = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const code = await llm({
            classSourceText,
            reasonsForLLMTier: report.reasons,
            previousAttemptError,
            existingImports,
        });
        const result = (0, validator_1.validateGeneratedCode)(originalFilePath, code);
        lastCode = code;
        lastDiagnostics = result.diagnostics;
        if (result.valid) {
            return { status: "done", code, attempts: attempt, finalDiagnostics: [] };
        }
        // Feed the failure back as context for the next attempt — this is
        // the entire "agent" behavior: the loop doesn't know how to fix
        // anything itself, it just gives the model its own mistake back.
        // enrichDiagnostics adds actionable guidance for known error
        // patterns, since raw tsc messages are precise about WHAT is wrong
        // but silent on WHAT TO DO about it.
        previousAttemptError = (0, error_feedback_1.enrichDiagnostics)(result.diagnostics.join("\n"));
    }
    return {
        status: "needs_human",
        code: lastCode,
        attempts: maxAttempts,
        finalDiagnostics: lastDiagnostics,
    };
}
