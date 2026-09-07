"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichDiagnostics = enrichDiagnostics;
const FEEDBACK_RULES = [
    {
        pattern: /Cannot find name '(\w*Props)'/,
        guidance: "The props interface is missing. Either define the interface directly in this file (copy it from the original class component's source), or skip the named interface entirely and inline the prop types directly in the function signature, e.g. `({ query, onResultsChange }: { query: string; onResultsChange: (r: string[]) => void })`.",
    },
    {
        pattern: /Cannot find name '(\w*State)'/,
        guidance: "A State interface is being referenced but doesn't exist in a function component — function components don't need a State type at all. Remove the reference and represent each state field with its own useState call instead.",
    },
    {
        pattern: /'this' implicitly has type 'any'/,
        guidance: "The code still contains a `this` reference, which doesn't exist in a function component. Every `this.propName` should become `propName` (destructured from props), and every `this.methodName` should become a direct call to the local function of that name.",
    },
    {
        pattern: /implicitly has an 'any' type/,
        guidance: "A parameter or variable is missing an explicit type. Add an explicit type annotation rather than leaving it to inference.",
    },
];
function enrichDiagnostics(rawDiagnostics) {
    const matchedGuidance = FEEDBACK_RULES.filter((rule) => rule.pattern.test(rawDiagnostics)).map((rule) => rule.guidance);
    if (matchedGuidance.length === 0) {
        return rawDiagnostics;
    }
    return `${rawDiagnostics}\n\nSpecific guidance:\n${matchedGuidance
        .map((g) => `- ${g}`)
        .join("\n")}`;
}
