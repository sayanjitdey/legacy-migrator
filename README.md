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
node packages/server/dist/scripts/run-classifier.js
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

`packages/server/src/core/codemod.ts` takes a `MECHANICAL`-tier class component and generates its
hooks equivalent — no LLM call involved. Verified against
`01-simple-counter.tsx`.

### Try it

```bash
npm install
npm run build
node packages/server/dist/scripts/run-codemod.js
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

`packages/server/src/core/validator.ts` runs generated code through the **real TypeScript
compiler** (via a fresh `ts-morph` `Project` loaded with the repo's actual
`tsconfig.json`) and reports `getPreEmitDiagnostics()` — the same check
`tsc --noEmit` performs. This catches both syntax errors and type errors,
in one pass, for any code the codemod or (later) the LLM produces.

```bash
node packages/server/dist/scripts/run-validator.js
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

- `packages/server/src/llm/llm-types.ts` — a `MigrationLLM` interface. The retry loop only
  depends on this shape (`(request) => Promise<string>`), never on the
  Anthropic SDK directly — that's what makes the loop testable without
  hitting the network.
- `packages/server/src/llm/llm-client-anthropic.ts` — the real client, using tool-calling to
  force structured output (a `return_migrated_component` tool call rather
  than parsing free-form text). Requires `ANTHROPIC_API_KEY` in your
  environment to actually run — not exercised in this sandbox, but ready
  to use once you drop in a key.
- `packages/server/src/llm/retry-loop.ts` — `migrateWithRetry()`: the agent loop. Calls the
  LLM, validates the result, and on failure feeds the validator's
  diagnostics back into the next attempt's prompt. Gives up after
  `maxAttempts` (default 3) and returns `needs_human` with the last
  diagnostics attached, rather than retrying forever.

### Try it

```bash
node packages/server/dist/scripts/run-retry-loop.js
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

### Enriched retry feedback (fixes the "close but 3-attempt failure" case)

The `SearchBoxProps`-undefined bug from real testing took all 3 attempts
to fail instead of 1 attempt to fix — the raw compiler message ("Cannot
find name 'SearchBoxProps'") is precise about *what's* wrong but silent on
*what to do*, which seemed to matter more for a smaller local model than
for a frontier one.

`packages/server/src/core/error-feedback.ts` adds `enrichDiagnostics()`: a small, explicit set
of pattern → actionable-guidance rules (missing Props interface, leftover
`this` references, implicit-any) appended to the raw diagnostics before
they're fed back into the next attempt. `retry-loop.ts` now calls this
instead of passing raw diagnostics through directly.

Verified with a stub reproducing the exact real bug: the loop converged in
2 attempts instead of exhausting all 3, and the enriched guidance text was
confirmed to actually reach the second attempt's prompt (not just
theoretically wired up).

This is deliberately a small, growing list, not a general "explain any TS
error" system — add a new rule whenever a new recurring failure pattern
shows up in real runs (which is exactly how `run-eval.ts` earns its keep:
it's what surfaces which patterns are actually common enough to be worth
a rule).

### Eval harness (added after real-model testing surfaced non-determinism)

Testing against a real local model (Ollama, `qwen2.5-coder:7b`) surfaced
something the stub tests couldn't: **the same fixture produced different
outputs on different runs** — one run silently dropped the debounce logic
entirely (compiled fine, `tsc` has no way to know the behavior was wrong),
another run preserved it correctly but added an over-broad `useEffect`
dependency. `validateGeneratedCode` only proves code *compiles* — it can't
catch a behaviorally-wrong-but-syntactically-valid transform.

`packages/server/src/pipeline/eval-harness.ts` + `packages/server/src/scripts/run-eval.ts` run the same fixture N times
against a real `MigrationLLM` and tally, in addition to compile success:
whether `setTimeout` survived at all, whether the old timer gets cleared,
and whether the dependency array stayed minimal (heuristic text-pattern
checks, explicitly **not** real behavioral verification — see the comment
in `eval-harness.ts` for why that distinction matters and what a more
rigorous version would look like).

```bash
EVAL_TRIALS=10 node packages/server/dist/scripts/run-eval.js
```

This is the mechanism for turning "I ran it once and it looked fine" into
an actual pass-rate number — see the GenAI interview-prep notes, Section
11 (Evaluation Methodology), on why single-run testing of a non-
deterministic system is close to meaningless.

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

## Status: Week 5 — BullMQ Job Queue ✅

Three new pieces:

- `packages/server/src/queue/queue.ts` — the `migrations` BullMQ queue and shared Redis
  connection config.
- `packages/server/src/pipeline/process-file.ts` — **queue-agnostic** per-file dispatch logic:
  classify, then route to the mechanical codemod, the LLM retry loop, or
  a hard-stop skip, depending on tier. Deliberately knows nothing about
  BullMQ — this is what a Worker calls, but it's independently testable
  without Redis running at all.
- `packages/server/src/queue/worker.ts` — a thin `Worker` wrapping `processFile`. `concurrency:
  1` is deliberate (see limitations below, and the open concurrency
  question from Week 3/4).

### Try it

Requires a running Redis instance (`redis-server`, default port 6379).

```bash
node packages/server/dist/scripts/run-queue-demo.js
```

Enqueues all three fixtures as **real jobs on a real Redis-backed queue**
(verified with `redis-cli keys "bull:migrations:*"` — actual job records
exist in Redis, not just in-process state) and watches all three tiers
get correctly routed: `Counter` → mechanical codemod → done. `SearchBox`
→ LLM retry loop → done. `Modal` → `NEEDS_HUMAN` → skipped without any
transform attempt, exactly as the classifier's hard-stop design intends.

### Known limitations (v1, honest list — Week 5 specific)

- **`concurrency: 1` sidesteps rather than solves the Week 3/4 concurrency
  question.** Two workers sharing the same `validateGeneratedCode`
  temp-file-per-call pattern is a real race condition once concurrency
  goes above 1 — solving that (either per-worker `Project` instances, or
  serializing validation calls) is a prerequisite before raising this.
- **No retry/backoff configured at the BullMQ job level.** If a job
  throws (e.g. a malformed source file crashes the AST parse), BullMQ's
  own job-retry mechanism isn't configured yet — right now a thrown error
  just marks the job `failed` and stops there.
- **The `demoLLM` stub in `run-queue-demo.ts` is hardcoded to always
  return a working `SearchBox` migration**, regardless of which file is
  actually being processed — fine for demonstrating queue mechanics with
  a small, known fixture set, but not a stand-in for testing the LLM path
  itself (see Week 4's `run-eval.ts` for that).
- **No persistence of results beyond BullMQ's own job history.** Job
  results live in Redis via BullMQ's completed-job records, but nothing
  writes them to Postgres yet (the architecture's stated storage layer,
  from the overview diagram) — needed before Week 6's dashboard can show
  status that survives a Redis flush.

## Status: Week 6 — WebSocket Progress Streaming + React Diff UI ✅

Three new pieces:

- `packages/server/src/server.ts` — an Express + `WebSocketServer` attached
  to the **same** `http.Server` instance (see the Week 6 known limitation
  below for why that specific detail matters), broadcasting every message
  to all connected clients.
- `packages/server/src/queue/queue-events.ts` — `setupQueueEventBroadcasting()`
  subscribes to BullMQ's Redis-backed `QueueEvents` (`active`, `completed`,
  `failed`) and turns each into a `job_active` / `job_completed` /
  `job_failed` WebSocket message. This is real pub/sub over Redis, not an
  in-process callback — it fires correctly even if the worker emitting the
  event is a different OS process than the server broadcasting it.
- `packages/ui/` — a Vite + React app. `useJobSocket.ts` opens the
  WebSocket, keeps a `jobs` map keyed by file+class, and shows an
  "Analyzing…" placeholder row the moment a job goes active, replacing it
  with real per-class results on completion. `DiffView.tsx` renders the
  original vs. generated code as a live Monaco `DiffEditor` side-by-side
  diff (`@monaco-editor/react`), with Approve/Reject actions on any
  `NEEDS_LLM` or `MECHANICAL` result that reached `status: "done"`.

### Try it

Requires three things running at once — Redis, the worker, and the
server — plus the UI dev server:

```bash
# Terminal 1 — Redis (default port 6379)
redis-server

# Terminal 2 — from packages/server, after `npx tsc`
node dist/scripts/run-worker.js

# Terminal 3 — from packages/server
node dist/server.js

# Terminal 4 — from the repo root
npm run dev:ui
```

Open the URL Vite prints (default `http://localhost:5173`). Trigger a run
from any client (see Week 7's `Try it` below for the real curl example)
and watch job rows appear live in the sidebar, streamed over the
WebSocket as each file is classified and migrated — no polling, no page
refresh.

### Known limitations (v1, honest list — Week 6 specific)

- **Approve/Reject in the UI only updates local component state.**
  `useJobSocket.ts`'s `setReviewDecision()` flips `job.reviewDecision` in
  the browser and nothing else — it does not call the server's
  `/api/jobs/approve` or `/api/jobs/reject` endpoints (see Week 7 below).
  Those endpoints exist and work — verified directly against a real git
  repo this session — but clicking Approve in the browser right now does
  not yet trigger them. The code says this honestly in-line
  (`DiffView.tsx`: "not yet wired to git (Week 7)").
- **The WebSocketServer must be attached to the same listening
  `http.Server` as the Express app, not a second one.** This bit
  concretely: a refactor once introduced a second `http.Server` that
  `WebSocketServer` was bound to while a separate `app.listen()` kept the
  REST API working — the API looked fine, only the socket silently never
  connected. Worth knowing if this code is ever restructured again.
- **No reconnect/backoff on the client.** If the WebSocket drops (server
  restart, network blip), `useJobSocket.ts` sets `connected: false` and
  does not attempt to reconnect — a full page reload is currently required.

## Status: Week 7 — Git Branch Workflow + Whole-Repo Ingestion ✅

Three new pieces:

- `packages/server/src/git/git-service.ts` — `ensureMigrationBranch()`
  always checks out (or creates) a `legacy-migrator/run-<timestamp>`
  branch before any write; `commitApprovedMigration()` writes the
  generated file and commits only that one file to that branch, never
  `main`. Writes are also guarded by `assertPathWithinRepo()` — the target
  file path is resolved and checked against the repo root before
  `fs.writeFileSync` ever runs, rejecting any path that would escape it.
- `cloneRepo()` (same file) — clones an arbitrary public repo into a temp
  directory for classification. The URL is checked against an allowlist
  (only `https://` or `git@` remote URLs — no local paths, no `file://`)
  before cloning. Since a cloned repo is never `npm install`ed, its
  `node_modules` is deliberately linked (junction on Windows, symlink
  elsewhere) back to this project's own, so `react`/`react-dom` type
  resolution works during validation without needing the target repo's
  own dependencies installed.
- `POST /api/migrate-repo` (`server.ts`) — the actual whole-repo entry
  point: clones the given repo, classifies every `.tsx`/`.jsx`/`.js` class
  component in it (excluding `node_modules`), and enqueues one job per
  file with at least one classified component.

### Try it

With the server running (see Week 6's `Try it` above):

```bash
curl -X POST http://localhost:3001/api/migrate-repo \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/gothinkster/react-redux-realworld-example-app.git"}'
```

Validated against this exact repo: 12 class components classified across
the codebase (`Header`, `ListErrors` → `MECHANICAL`; `SettingsForm` →
`NEEDS_LLM`; the remaining 9 — `App`, `Editor`, `Login`, `Profile`,
`Register`, `Settings`, `CommentInput`, `Article`, `Home` — correctly
routed to `NEEDS_HUMAN` as Redux `connect()`-wrapped HOCs), 11 jobs
enqueued, and the two `MECHANICAL`-tier files (`Header.js`,
`ListErrors.js`) migrated end-to-end with `status: "done"` and zero
diagnostics.

Also validated against a second, structurally different repo:

```bash
curl -X POST http://localhost:3001/api/migrate-repo \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/RowanCarmichael/react-functional-components-example.git"}'
```

This one has no `MECHANICAL`-tier components at all — both classified
components (`ProfileFormContainer`, `ProfileForm`) correctly routed to
`NEEDS_LLM` for multi-key `setState` calls the deterministic codemod
can't safely rewrite. Run through the real local Ollama path
(`qwen2.5-coder:14b`), both reached `status: "done"` with zero
diagnostics after the retry loop self-corrected on real compiler
feedback (see `error-feedback.ts`'s `useRef(null)`-typing guidance rule,
added specifically because this repo's real code hit that exact pattern).

This is also the real-world stress test `DESIGN_DECISIONS.md` §1
describes: it's what surfaced the classifier's `ProfileForm.js`-shaped
blind spot (state declared as a class field, no constructor) and, later
in the same session, the LLM-path import-hallucination and CSS-module
type-resolution gaps — each fixed at the root cause, not patched for the
one file that exposed it.

### Known limitations (v1, honest list — Week 7 specific)

- **Not wired to the UI's Approve/Reject buttons yet** — see Week 6 above.
  `/api/jobs/approve` and `/api/jobs/reject` work correctly when called
  directly (verified this session, including a deliberate path-traversal
  attempt correctly rejected), but nothing in the browser calls them yet.
- **`/api/migrate-repo` only accepts a remote git URL, not a local folder
  or an uploaded zip** — the "Upload/ingestion path" item under
  Public-repo readiness (below) is about exactly this gap.
- **No cleanup of cloned temp directories.** Each `cloneRepo()` call
  leaves its clone sitting in the OS temp directory indefinitely — fine
  for a demo/dev session, not fine left running unattended.
- **History rewrite is out of scope even for a real leaked secret.** If a
  real credential were ever found committed (see the Secrets scan in
  `CLEANUP_CHECKLIST.md`), this tool does not attempt to purge git
  history — that's a manual, explicitly-confirmed operation
  (`git filter-repo` / BFG + force-push), never automatic.

## Roadmap

- [x] Week 1 — AST classifier
- [x] Week 2 — Mechanical codemod (MECHANICAL tier → hooks, no LLM)
- [x] Week 3 — Validation loop (re-parse, `tsc --noEmit`, run test suite)
- [x] Week 4 — LLM path + retry-on-validation-failure loop for `NEEDS_LLM` tier
- [x] Week 5 — BullMQ job queue, one job per file
- [x] Week 6 — WebSocket progress streaming + React diff UI (Monaco)
- [x] Week 7 — Git branch workflow + stress test against a real messy repo
- [ ] Week 8 — Polish, docs, demo
- [ ] Weeks 9-10 (optional) — RAG layer: retrieve already-approved migrations
      from the same codebase as few-shot grounding for the LLM step

### Public-repo readiness (target: Week 7, before any public release)

Real progress landed here during Week 7's stress test — some items below
are done, some are genuinely still open. Kept split out per item rather
than marking the whole section done at once, since that's exactly the
kind of all-or-nothing checkbox that caused the Week 4/5 duplication bug
this section itself used to have.

- [x] **Multi-extension support.** `classifyProject`'s glob now matches
      `**/*.{tsx,jsx,js}` (excluding `node_modules`), so plain-JS class
      components aren't silently skipped. Verified against real `.js`
      repos in Week 7's `Try it` above.
- [ ] **`allowJs`-style handling — functionally works, but not honestly
      surfaced yet.** `ts-morph`'s default `Project` already parses JSX in
      plain `.js` files correctly with no extra config (verified directly
      before wiring this in). What's still missing: the validator doesn't
      tell the user that type-checking a JS-origin file is inherently
      weaker (no real prop types, no compile-time guarantees beyond
      syntax) — it silently validates JS-origin and TS-origin code the
      same way.
- [ ] **Load the target repo's own `tsconfig.json`**, not this project's
      hardcoded one, in `validator.ts`. Real repos have their own path
      aliases, compiler options, and dependency types; validating against
      the wrong config would produce misleading diagnostics. (Partially
      compensated for, not solved: `cloneRepo()` now links this project's
      own `node_modules` into the cloned repo so `react` at least resolves
      — see Week 7 above — but that's a workaround for one specific
      missing piece, not the target repo's real config.)
- [x] **Codemod robustness beyond the three fixtures — meaningfully
      advanced, not "complete."** Fixed for real against components pulled
      from an actual open-source repo (`Header.js`, `ListErrors.js`):
      sibling top-level declarations (other components, helpers, types) in
      the same file are now preserved instead of silently dropped, and the
      generated export style now matches however the original was
      exported instead of risking a duplicate-export error. Multi-key
      `setState` and functional updates are still correctly routed to
      `NEEDS_LLM` rather than attempted by the codemod — that boundary
      hasn't changed, and doesn't need to.
- [x] **Upload/ingestion path — a real entry point exists, narrower than
      originally scoped.** `POST /api/migrate-repo` accepts a `repoUrl`
      and clones it — this is the "point this at a real codebase" case,
      validated against two independent public repos (Week 7 above). What
      it does *not* do yet: accept a local folder path or an uploaded zip
      — only a remote git URL.

## Why hybrid AST + LLM, not just "ask the LLM to rewrite the file"

A pure LLM rewrite is non-deterministic and can silently drop edge-case
logic with no structural guarantee the output is even correct until you
compile it. A pure codemod is deterministic but brittle — it only handles
patterns explicitly coded for, and real legacy code is never that clean.
This tool uses AST analysis to do what's mechanically safe, and reserves
LLM judgment for the genuinely ambiguous remainder — with every LLM-produced
change gated behind a validation step before it's ever shown as "done."
