"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ollamaMigrationLLM = void 0;
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b";
const ollamaMigrationLLM = async (request) => {
    const feedbackBlock = request.previousAttemptError
        ? `\n\nYour previous attempt failed validation with this error:\n${request.previousAttemptError}\n\nFix this specific issue.`
        : "";
    const importsBlock = request.existingImports
        ? `\n\nThe original file imports these exact modules — reuse these exact\nimport paths verbatim for anything you still reference (sibling\ncomponents, helpers, styles, etc.). Do NOT invent, guess, or alter any of\nthese paths, and do NOT drop one that's still used just because it wasn't\nshown to you elsewhere:\n\`\`\`\n${request.existingImports}\n\`\`\``
        : "";
    const prompt = `Migrate this React class component to a function component using hooks.

This component was flagged as needing careful judgment for these reasons:
${request.reasonsForLLMTier.map((r) => `- ${r}`).join("\n")}

Pay particular attention to translating lifecycle-method comparison logic
(e.g. componentDidUpdate prop diffs) into correct useEffect dependency
arrays.
${importsBlock}

Respond with ONLY a JSON object of this exact shape, nothing else, no
markdown fences, no explanation:
{"code": "<the complete migrated component source as a single string, including imports>"}

Original component:
\`\`\`tsx
${request.classSourceText}
\`\`\`
${feedbackBlock}`;
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [{ role: "user", content: prompt }],
            format: "json",
            stream: false,
        }),
    });
    if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    const raw = data.message?.content ?? "";
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`Ollama did not return valid JSON:\n${raw}`);
    }
    if (!parsed.code) {
        throw new Error(`Ollama JSON response missing "code" field:\n${raw}`);
    }
    return parsed.code;
};
exports.ollamaMigrationLLM = ollamaMigrationLLM;
