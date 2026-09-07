/**
 * Raw tsc diagnostics are precise about WHAT is wrong but silent on WHAT
 * TO DO about it — "Cannot find name 'X'" doesn't say whether to define,
 * import, or remove X. Smaller models especially seem to need that made
 * explicit rather than inferred (see README: the SearchBoxProps case took
 * 3 attempts to fail instead of 1 attempt to fix).
 *
 * This is intentionally a small, explicit set of known patterns — not a
 * general "explain any TS error" system. Treat it as a growing list you
 * add to whenever a new recurring failure pattern shows up in real runs,
 * not a one-time complete solution.
 */
interface FeedbackRule {
  pattern: RegExp;
  guidance: string;
}

const FEEDBACK_RULES: FeedbackRule[] = [
  {
    pattern: /Cannot find name '(\w*Props)'/,
    guidance:
      "The props interface is missing. Either define the interface directly in this file (copy it from the original class component's source), or skip the named interface entirely and inline the prop types directly in the function signature, e.g. `({ query, onResultsChange }: { query: string; onResultsChange: (r: string[]) => void })`.",
  },
  {
    pattern: /Cannot find name '(\w*State)'/,
    guidance:
      "A State interface is being referenced but doesn't exist in a function component — function components don't need a State type at all. Remove the reference and represent each state field with its own useState call instead.",
  },
  {
    pattern: /'this' implicitly has type 'any'/,
    guidance:
      "The code still contains a `this` reference, which doesn't exist in a function component. Every `this.propName` should become `propName` (destructured from props), and every `this.methodName` should become a direct call to the local function of that name.",
  },
  {
    pattern: /implicitly has an 'any' type/,
    guidance:
      "A parameter or variable is missing an explicit type. Add an explicit type annotation rather than leaving it to inference.",
  },
  {
    pattern: /does not exist on type 'never'/,
    guidance:
      "A `useRef(null)` call is missing its generic type argument, so TypeScript infers the ref's type as `null`/`never` instead of the actual element type — accessing `.current.someMethod()` then fails even behind a truthy check. Add an explicit generic matching what's actually assigned to `.current`, e.g. `useRef<HTMLInputElement>(null)`.",
  },
];

export function enrichDiagnostics(rawDiagnostics: string): string {
  const matchedGuidance = FEEDBACK_RULES.filter((rule) => rule.pattern.test(rawDiagnostics)).map(
    (rule) => rule.guidance
  );

  if (matchedGuidance.length === 0) {
    return rawDiagnostics;
  }

  return `${rawDiagnostics}\n\nSpecific guidance:\n${matchedGuidance
    .map((g) => `- ${g}`)
    .join("\n")}`;
}
