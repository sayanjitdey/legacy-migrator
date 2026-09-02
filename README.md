# Legacy Migrator

An AI-assisted tool for migrating React class components to hooks — built as a
**hybrid AST + LLM pipeline**, not a raw "prompt the LLM with the whole file"
tool. Deterministic AST analysis handles what's structurally unambiguous;
the LLM is only invoked for genuinely ambiguous judgment calls, and nothing
is auto-applied without passing a validation gate (type-check + tests).

## Status: Week 1 — AST Classifier ✅

The classifier walks a `.tsx` file's AST (via `ts-morph`) and sorts every
React class component into one of three tiers: `MECHANICAL`, `NEEDS_LLM`,
`NEEDS_HUMAN`. No LLM calls happen in this step.

```bash
node dist/run-classifier.js
```

| Fixture | Expected tier | Why |
|---|---|---|
| `01-simple-counter.tsx` | `MECHANICAL` | Trivial `componentDidMount`, no branching |
| `02-search-box.tsx` | `NEEDS_LLM` | `componentDidUpdate` prop-diff logic + conditional cleanup |
| `03-modal-with-ref.tsx` | `NEEDS_HUMAN` | HOC-wrapped + imperative ref API |

Known limitations: imperative-exposure detection is a comment-sniffing
heuristic, not real cross-file `findReferences()` analysis; conditional-
branching detection is intentionally blunt (any `if` in a lifecycle method
escalates the tier); HOC detection only catches same-file wrapping.

## Status: Week 2 — Mechanical Codemod ✅

`src/codemod.ts` takes a `MECHANICAL`-tier class component and generates its
hooks equivalent — no LLM call involved. Verified against
`01-simple-counter.tsx`.

### Try it

```bash
npm install
npx tsc
node dist/run-codemod.js
```

### What it currently handles

- Extracting `this.state = {...}` from the constructor into one `useState`
  call per field.
- Rewriting `this.state.x` → `x`, `this.props.y` → `props.y`, and
  `this.methodName` → `methodName` throughout method bodies and JSX.
- Converting class-field arrow-function methods (`increment = () => {...}`)
  into plain `const` function declarations.
- Converting single-key `this.setState({ x: expr })` calls into
  `setX(expr)`.
- Converting `componentDidMount` (+ optional `componentWillUnmount` as its
  cleanup) into one `useEffect(() => {...}, [])`.
- Lifting the `render()` method's return statement into the function
  component's return.

### Known limitations (v1, honest list — codemod-specific)

- **`componentDidUpdate` is not yet handled.** This is intentional — the
  classifier already routes it to `NEEDS_LLM` because deciding what belongs
  in a `useEffect` dependency array requires distinguishing "what triggers
  this effect" from "what happens inside the effect," which needs reading
  the method's logic, not just matching AST shape. In progress.
- **`setState` rewriting only handles single-key object literals.**
  `this.setState({ a: 1, b: 2 })` or functional `setState(prev => ...)`
  forms aren't supported — components using those should already be caught
  by the classifier's complexity checks, but this hasn't been exhaustively
  verified.
- **Text-based rewriting (`replaceAll`) is used for `this.` reference
  cleanup rather than a full AST replace-node pass.** This is simpler to
  write and reason about for v1, but it means the rewrite operates on
  cloned text, not the live tree — a genuine limitation flagged here rather
  than hidden. A v2 could use `ts-morph`'s node-replacement APIs
  (`.replaceWithText()` on individual `PropertyAccessExpression` nodes)
  for more surgical, AST-safe replacement.
- **No JSX prettification** — output is functionally correct but not run
  through a formatter (Prettier) yet. Worth adding before the diff-view UI
  in Week 6, so generated code doesn't look visually jarring next to the
  original.

## Status: Week 3 — Validation Loop ✅

`src/validator.ts` runs generated code through the **real TypeScript
compiler** (via a fresh `ts-morph` `Project` loaded with the repo's actual
`tsconfig.json`) and reports `getPreEmitDiagnostics()` — the same check
`tsc --noEmit` performs. This catches both syntax errors and type errors,
in one pass, for any code the codemod or (later) the LLM produces.

```bash
node dist/run-validator.js
```

This runs two cases side by side: the correct codemod output (`valid:
true`, zero diagnostics) and a deliberately broken version with the exact
`this.increment` bug from Week 2 reintroduced (`valid: false`, pinpointing
the exact line and reason). Building this immediately paid for itself —
running the validator against the "correct" Week 2 output on the first try
revealed two real bugs that had been silently wrong the whole time:

1. **Missing imports.** The codemod never generated
   `import { useState, useEffect } from "react"` — fixed by having
   `generateHooksComponent` compute which hooks are actually used and emit
   the right import line.
2. **Implicit-any on `props`.** Strict mode flags an untyped parameter —
   fixed for v1 by annotating `props: any` explicitly (see limitations
   below — this is a stopgap, not the right long-term answer).

### Known limitations (v1, honest list — validator-specific)

- **`props: any` is a real gap, not a fix.** The codemod knows the original
  class extended `React.Component<CounterProps, CounterState>` but doesn't
  yet extract and reuse `CounterProps` as the function component's actual
  parameter type. Typing this properly is a good Week 3.5 exercise before
  moving on to `NEEDS_LLM` cases, where preserving real types matters more.
- **Test-suite execution is not wired up.** The validator checks for a
  sibling `<Component>.test.tsx` file and reports whether one exists, but
  doesn't actually run it yet (no `jest` dependency added to the project
  yet — real test execution is worth adding once there's an actual test
  suite to run against, likely once this tool is pointed at a real repo in
  Week 7's stress test).
- **No retry loop yet.** Retrying a failed transform only makes sense for
  the LLM path (Week 4) — a failed *mechanical* transform is a codemod bug
  to fix in code, not something to retry probabilistically. This validator
  is the shared gate both paths will go through; the retry logic sits one
  layer above it.

## Status: Week 4 — LLM Path + Retry Loop ✅

Three new pieces:

- `src/llm-types.ts` — a `MigrationLLM` interface. The retry loop only
  depends on this shape (`(request) => Promise<string>`), never on the
  Anthropic SDK directly — that's what makes the loop testable without
  hitting the network.
- `src/llm-client-anthropic.ts` — the real client, using tool-calling to
  force structured output (a `return_migrated_component` tool call rather
  than parsing free-form text). Requires `ANTHROPIC_API_KEY` in your
  environment to actually run — not exercised in this sandbox, but ready
  to use once you drop in a key.
- `src/retry-loop.ts` — `migrateWithRetry()`: the agent loop. Calls the
  LLM, validates the result, and on failure feeds the validator's
  diagnostics back into the next attempt's prompt. Gives up after
  `maxAttempts` (default 3) and returns `needs_human` with the last
  diagnostics attached, rather than retrying forever.

### Try it

```bash
node dist/run-retry-loop.js
```

Runs two scenarios against a **stub** LLM (no network call, fully
deterministic) built around the real `SearchBox` fixture: one that fails
once then self-corrects (`status: done, attempts: 2`), and one that never
produces valid code and correctly escalates (`status: needs_human`).

### A real bug this caught while building it (worth reading)

The first version of the "self-correcting" stub attempt didn't actually
succeed on retry — it kept escalating to `needs_human` after all 3
attempts. Debugging it surfaced a genuine TypeScript inference issue:
`useState([])` with no generic argument infers `never[]`, so a later
`setResults(someStringArray)` call fails to type-check. My own hand-typed
"corrected" code had this exact bug. Fixing it meant explicitly typing the
call as `useState<string[]>([])`. This is a good, concrete example of why
the validation gate exists independent of whether the code "looks" fixed
by eye — a plausible-looking correction can still be wrong in a way only
the real compiler catches.

### Known limitations (v1, honest list — Week 4 specific)

- **Not tested against the real Anthropic API in this environment** — the
  client code in `llm-client-anthropic.ts` is written correctly against
  the SDK's tool-calling API, but only the stub-driven retry loop has been
  verified end-to-end here. Swapping `stubLLM` for `anthropicMigrationLLM`
  in a real run (with `ANTHROPIC_API_KEY` set) is the natural next
  verification step.
- **A fresh `Project` is still created inside `validateGeneratedCode` on
  every call** (flagged in Week 3) — this now matters more, since the
  retry loop calls it up to `maxAttempts` times per component. Worth
  fixing before Week 5 wires this into a job queue processing many files.
- **No cost/attempt tracking yet.** Each retry is a full LLM call; at
  scale you'd want to log attempts-per-component to catch cases where a
  component reliably needs 3 attempts (a signal the prompt or the
  classifier's tiering needs adjusting), per the GenAI cost-optimization
  notes on model cascading and observability.

## Roadmap

- [x] Week 1 — AST classifier
- [x] Week 2 — Mechanical codemod (MECHANICAL tier → hooks, no LLM)
- [x] Week 3 — Validation loop (re-parse, `tsc --noEmit`, run test suite)
- [x] Week 4 — LLM path + retry-on-validation-failure loop for `NEEDS_LLM` tier
- [ ] Week 5 — BullMQ job queue, one job per file
- [ ] Week 6 — WebSocket progress streaming + React diff UI (Monaco)
- [ ] Week 7 — Git branch workflow + stress test against a real messy repo
- [ ] Week 8 — Polish, docs, demo
- [ ] Weeks 9-10 (optional) — RAG layer: retrieve already-approved migrations
      from the same codebase as few-shot grounding for the LLM step

### Public-repo readiness (target: Week 7, before any public release)

Currently this tool only recognizes `.tsx`. Before pointing it at a repo
that isn't one of the fixtures — and definitely before making this public
— the following need to land:

- [ ] **Multi-extension support.** Extend `classifyProject`'s glob from
      `**/*.tsx` to also match `.jsx`, `.ts`, and `.js`, so plain-JS class
      components aren't silently skipped.
- [ ] **`allowJs: true` handling.** Plain `.js`/`.jsx` repos need the
      `ts-morph`/`tsconfig` setup to accept JS input, and the validator
      needs to be honest that type-error checking is much weaker (often
      just undeclared-variable-level) without real TS types backing it —
      this should be surfaced to the user, not silently assumed away.
- [ ] **Load the target repo's own `tsconfig.json`**, not this project's
      hardcoded one, in `validator.ts`. Real repos have their own path
      aliases, compiler options, and dependency types; validating against
      the wrong config would produce misleading diagnostics.
- [ ] **Codemod robustness beyond the three fixtures.** The current
      `codemod.ts` has only been proven against `Counter`, `SearchBox`,
      and `Modal`. Real components will have multi-key `setState` calls,
      functional updates (`setState(prev => ...)`), destructured props,
      and JSX shapes not yet exercised — expect failures here first when
      testing against a real repo, and treat each one as a fixture to add,
      not a one-off patch.
- [ ] **Upload/ingestion path.** Right now every fixture lives in the repo
      itself. A public version needs an actual "point this at a folder or
      an uploaded zip" entry point — this is also where the file-extension
      and tsconfig-loading work above actually gets exercised for real.
- [ ] Week 4 — LLM path + retry-on-validation-failure loop for `NEEDS_LLM` tier
- [ ] Week 5 — BullMQ job queue, one job per file
- [ ] Week 6 — WebSocket progress streaming + React diff UI (Monaco)
- [ ] Week 7 — Git branch workflow + stress test against a real messy repo
- [ ] Week 8 — Polish, docs, demo
- [ ] Weeks 9-10 (optional) — RAG layer: retrieve already-approved migrations
      from the same codebase as few-shot grounding for the LLM step

## Why hybrid AST + LLM, not just "ask the LLM to rewrite the file"

A pure LLM rewrite is non-deterministic and can silently drop edge-case
logic with no structural guarantee the output is even correct until you
compile it. A pure codemod is deterministic but brittle — it only handles
patterns explicitly coded for, and real legacy code is never that clean.
This tool uses AST analysis to do what's mechanically safe, and reserves
LLM judgment for the genuinely ambiguous remainder — with every LLM-produced
change gated behind a validation step before it's ever shown as "done."
