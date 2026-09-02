# Legacy Migrator

An AI-assisted tool for migrating React class components to hooks — built as a
**hybrid AST + LLM pipeline**, not a raw "prompt the LLM with the whole file"
tool. Deterministic AST analysis handles what's structurally unambiguous;
the LLM is only invoked for genuinely ambiguous judgment calls, and nothing
is auto-applied without passing a validation gate (type-check + tests).

## Status: Week 1 — AST Classifier ✅

The classifier walks a `.tsx` file's AST (via `ts-morph`) and sorts every
React class component into one of three tiers:

- **`MECHANICAL`** — safe for a deterministic codemod, no LLM call needed.
- **`NEEDS_LLM`** — has ambiguous logic (conditional lifecycle branching,
  `shouldComponentUpdate`, prop-diff patterns) that needs model judgment.
- **`NEEDS_HUMAN`** — has patterns that shouldn't be auto-migrated at all
  (HOC wrapping, imperative ref-based APIs exposed to parents).

No LLM calls happen in this step. Everything downstream (the codemod, the
LLM path, the validation loop) depends on this classification being
trustworthy, so it's built and tested in isolation first.

### Try it

```bash
npm install
npx tsc
node dist/run-classifier.js
```

This runs the classifier against three fixtures under `src/fixtures/`,
deliberately spanning the difficulty range:

| Fixture | Expected tier | Why |
|---|---|---|
| `01-simple-counter.tsx` | `MECHANICAL` | Trivial `componentDidMount`, no branching |
| `02-search-box.tsx` | `NEEDS_LLM` | `componentDidUpdate` prop-diff logic + conditional cleanup |
| `03-modal-with-ref.tsx` | `NEEDS_HUMAN` | HOC-wrapped + imperative ref API |

## Known limitations (v1, honest list)

- **Imperative-exposure detection is a heuristic**, not real cross-file
  analysis. It currently relies on a comment hint in the source rather than
  actually finding where a parent calls `someRef.current.method()` elsewhere
  in the codebase. A real v2 needs a project-wide reference search (ts-morph
  can do this via `findReferences()`) rather than single-file heuristics.
- **Conditional-branching detection is intentionally blunt.** Any `if`
  statement inside a lifecycle method currently escalates it to `NEEDS_LLM`,
  even very safe/common patterns like a null-guard before a single cleanup
  call (`if (this.timer) clearTimeout(this.timer)`). This is a deliberate
  choice — over-escalating to the LLM/human tier is safer than
  under-escalating and silently shipping a subtly wrong mechanical
  transform — but it means the classifier is more conservative than it
  needs to be. Worth revisiting once the LLM/validation path exists and we
  can measure how often the "conservative" cases actually turn out fine.
- **HOC detection only catches same-file wrapping** (`export default
  withX(Component)`). HOCs applied in a different file aren't caught yet.
- **No support yet for**: `getDerivedStateFromProps`, class components using
  legacy context API, or components with more than one class in a file
  sharing state.

## Roadmap

- [x] Week 1 — AST classifier
- [ ] Week 2 — Mechanical codemod (MECHANICAL tier → hooks, no LLM)
- [ ] Week 3 — Validation loop (re-parse, `tsc --noEmit`, run test suite)
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
