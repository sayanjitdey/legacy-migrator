"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicMigrationLLM = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const client = new sdk_1.default(); // reads ANTHROPIC_API_KEY from env
/**
 * Uses tool-calling to force a structured response — we ask for a
 * `return_migrated_component` tool call rather than parsing free-form
 * text, because forcing the schema is far more reliable than hoping the
 * model wraps code in the right markdown fence (see the GenAI prep doc,
 * Section 8: structured output).
 */
const anthropicMigrationLLM = async (request) => {
    const feedbackBlock = request.previousAttemptError
        ? `\n\nYour previous attempt failed validation with this error:\n${request.previousAttemptError}\n\nFix this specific issue.`
        : "";
    const importsBlock = request.existingImports
        ? `\n\nThe original file imports these exact modules — reuse these exact\nimport paths verbatim for anything you still reference (sibling\ncomponents, helpers, styles, etc.). Do NOT invent, guess, or alter any of\nthese paths, and do NOT drop one that's still used just because it wasn't\nshown to you elsewhere:\n\`\`\`\n${request.existingImports}\n\`\`\``
        : "";
    const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        tools: [
            {
                name: "return_migrated_component",
                description: "Return the migrated React function component using hooks.",
                input_schema: {
                    type: "object",
                    properties: {
                        code: {
                            type: "string",
                            description: "The complete migrated component source, including imports.",
                        },
                    },
                    required: ["code"],
                },
            },
        ],
        tool_choice: { type: "tool", name: "return_migrated_component" },
        messages: [
            {
                role: "user",
                content: `Migrate this React class component to a function component using hooks.

This component was flagged as needing careful judgment for these reasons:
${request.reasonsForLLMTier.map((r) => `- ${r}`).join("\n")}

Pay particular attention to translating lifecycle-method comparison logic
(e.g. componentDidUpdate prop diffs) into correct useEffect dependency
arrays — the goal is behavioral equivalence, not just syntactic similarity.
${importsBlock}

Original component:
\`\`\`tsx
${request.classSourceText}
\`\`\`
${feedbackBlock}`,
            },
        ],
    });
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Model did not return the expected tool call.");
    }
    return toolUse.input.code;
};
exports.anthropicMigrationLLM = anthropicMigrationLLM;
