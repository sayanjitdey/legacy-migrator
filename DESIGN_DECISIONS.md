# Design Decisions — Legacy Migrator

This document exists for one reason: **the interesting part of this project isn't the code, it's the sequence of times the code was wrong and why.** A hybrid AST+LLM migration pipeline is a reasonable architecture to describe in an interview. Being able to say *"I built a validator, ran it against my own 'correct' output, and it immediately found two real bugs"* is a much stronger signal — it's proof of process, not just a claim about design.

Read this alongside the README (which documents what each week built) — this document is about *why* each decision was made and what it cost to learn that.

---

## 1. Why hybrid AST + LLM, not "just ask the LLM to migrate the file"

**The decision**: use deterministic AST analysis (`ts-morph`) to classify every class component into a tier — `MECHANICAL` (safe for a pure codemod), `NEEDS_LLM` (genuine judgment required), `NEEDS_HUMAN` (never auto-migrate) — and only invoke an LLM for the middle tier.

**Why it matters**: a pure LLM rewrite is non-deterministic and can silently drop edge-case logic with no structural guarantee the output is even correct. A pure codemod is deterministic but brittle — it only handles patterns explicitly coded for. The tiering exists to put deterministic guarantees where they're achievable and reserve model judgment for where it's actually needed.

**What proved this was the right call, not just a nice idea**: Week 7's stress test found a class component (`ProfileForm.js`, from a real open-source repo) that the classifier incorrectly tiered `MECHANICAL` — state declared as a class field with no constructor, a pattern the classifier had never been tested against. Running the actual codemod against it produced completely broken output: `this.state`, `this.setState`, and `this.methodName` left untouched throughout the "migrated" function component, because the codemod's extraction logic depended entirely on finding a constructor that didn't exist. Fed through the validator: **44 diagnostics.**

This is the most important bug in the whole project, and it's important for a specific reason: every other bug happened in the `NEEDS_LLM` path, which already has a retry loop and validation gate — the system was designed to expect and catch mistakes there. This bug was in the tier explicitly defined as *"safe, no LLM needed."* The classifier's core safety promise failed on its first real-world test. Fixing it (`hasExtractableStateDeclaration()`, `hasUnsupportedSetStatePattern()`) also retroactively caught a real gap that had been sitting undetected in the project's own fixtures the whole time — proof the fix generalized rather than patching one file's exact shape.

**Interview-ready version**: *"My classifier had a blind spot in the tier I'd defined as maximally safe. I found it by testing against a real repo instead of just my own fixtures, confirmed the failure with the actual validator output — 44 real compiler errors — then fixed the root cause and verified the fix against two independent real files plus a full regression check on my original fixtures."*

---

## 2. Why validation is a separate step from generation, not a quality check bolted on after

**The decision**: every migrated component — mechanical or LLM-generated — passes through the exact same validator (`getPreEmitDiagnostics()`, the same check `tsc --noEmit` performs) before it's ever marked `done`.

**What proved this was necessary**: the very first time the validator ran against "correct" Week 2 codemod output, it found two real bugs that had been invisible by eye: missing `import { useState, useEffect } from "react"`, and an implicit-`any` on the `props` parameter under strict mode. Code that looked finished and had been manually reviewed still failed real compilation.

**The deeper lesson, made concrete twice**: validation proves code *compiles*, not that it's *behaviorally correct*. Week 4's `useState` vs `useRef` debounce bug is the clearest example — a real Ollama-generated migration passed validation cleanly (`status: done`) while containing a genuine stale-closure bug that would cause a debounced search to fire on stale input under rapid typing. The bug was invisible to `tsc` because both `useState` and `useRef` are valid TypeScript; only reading the actual runtime behavior revealed the problem. This is documented explicitly in the eval harness's limitations section: the heuristic pass/fail checks built to automate this detection would have reported that exact trial as a full pass.

**Interview-ready version**: *"Validation is necessary but not sufficient. I have a specific, real example of code that compiled cleanly and was subtly wrong, which is why my architecture requires human review before any migration is committed — that's not a formality, it's covering a gap I proved exists."*

---

## 3. Why the retry loop feeds back *enriched* diagnostics, not raw compiler errors

**The decision**: `error-feedback.ts`'s `enrichDiagnostics()` appends actionable guidance to known error patterns (missing Props interface, leftover `this` references, implicit-any) before feeding a failed attempt's error back to the LLM for retry.

**What proved raw diagnostics weren't enough**: a real Ollama-generated migration referenced `SearchBoxProps` without ever defining it — `Cannot find name 'SearchBoxProps'`. Fed back raw, the model failed to fix it across all 3 retry attempts, exhausting the budget on what turned out to be a one-line fix. The raw message is precise about *what* is wrong but silent on *what to do* — for a smaller local model, that ambiguity mattered more than expected. After adding a targeted guidance rule for this exact pattern, verified with a stub that reproduced the bug: the loop converged in 2 attempts instead of 3.

**Interview-ready version**: *"I found that raw compiler errors weren't actionable enough for a 7B local model to reliably act on. I built a small, explicit pattern-matching layer that translates 'what's wrong' into 'what to do about it,' verified the fix actually changes model behavior — not just that the code compiles — by confirming the enriched text reached the second attempt's prompt and that the loop converged faster."*

---

## 4. Why the queue and WebSocket layers never import each other's dependencies

**The decision**: `process-file.ts` knows nothing about BullMQ. `queue-events.ts` knows nothing about `ws`. Each layer receives a callback (`broadcast()`, an `LLM` function) rather than importing the concrete implementation of the layer above or below it.

**What this bought later, concretely**: when Week 6's WebSocket connection silently failed (browser console: `WebSocket connection to 'ws://localhost:3001/' failed`), the actual bug was a classic one — the `WebSocketServer` was attached to an `http.Server` instance that a refactor had stopped calling `.listen()` on, while a separate `app.listen()` call kept the Express API working fine. Because the layers were decoupled, this was debuggable in isolation: confirm the HTTP API works (it did), confirm something is bound to the port (`netstat`), then check specifically whether the WebSocketServer and the listening server were the *same object*. A tightly coupled implementation would have made this failure much harder to localize.

**Interview-ready version**: *"When my WebSocket connections started failing after a restructure, I could debug it in isolation because the WebSocket layer, the queue layer, and the transform logic never imported each other directly — I could confirm each piece worked independently and narrow down to the actual mismatch: two different `http.Server` instances, only one of which was listening."*

---

## 5. Why the queue's job data is now generically typed, not `any`

**The decision**: `migrationQueue` is `Queue<MigrationJobData>`, not an untyped `Queue`.

**What proved this mattered**: while adding whole-repo ingestion, a job was enqueued in a demo script without the newly-required `repoRoot` field. Because the queue wasn't generically typed, this compiled cleanly and would have failed silently at runtime — `commitApprovedMigration` would have received `undefined` as a repo root. Typing the queue generically turned this into a compile-time error, verified directly: the mistake was deliberately reintroduced, confirmed `tsc` correctly rejected it (`Property 'repoRoot' is missing`), then the fix was restored.

**Interview-ready version**: *"I found a class of bug — untyped job payloads — that TypeScript should have been catching and wasn't. I fixed the actual cause, not just the one call site, and verified the fix by deliberately breaking it again and confirming the compiler caught it."*

---

## 6. Why git commits happen on a dedicated branch, never `main`, verified independently

**The decision**: `git-service.ts` always checks out (or creates) a `legacy-migrator/run-<timestamp>` branch before any write, and only ever commits the one approved file.

**How this was verified, not just asserted**: rather than trusting the function's return value, `main` and the migration branch were independently inspected with plain `git log`, `git branch`, and `git checkout` — confirming the migration branch had the hooks version and `main` still had the untouched original class component. A second test confirmed what actually happens if the function is called while checked out on `main`: `ensureMigrationBranch()` automatically switches off `main` before any write occurs. The explicit main/master safety check inside `commitApprovedMigration` is consequently unreachable in the current call path — documented honestly as defense-in-depth against a future change to `ensureMigrationBranch`, not as an active protection today.

**Interview-ready version**: *"I don't just trust that my safety guarantees hold — I test them directly, including testing what happens when I try to defeat them on purpose. I found that my explicit safety check was actually unreachable given how the rest of the function works, and I documented that honestly rather than overstating what the code protects against."*

---

## 7. Why the LLM only ever saw isolated class text — and why that turned out to be the bug, not a simplification

**The decision**: `migrateWithRetry()` originally passed the LLM only `classSourceText` — the migrating class's own text, nothing else from the file it came from.

**What proved this was wrong, not just minimal**: running the LLM path against real files pulled from an actual open-source repo (`ProfileForm.js`, `ProfileFormContainer.js`) surfaced hallucination, not a judgment failure. The migration logic itself was fine — the imports weren't: an invented relative path (`./Api` instead of the real `../../Api`), a fabricated package name (`'your-ui-library'` in place of the real `react-toolbox`), a guessed filename (`./ProfileForm.module.css` instead of the real `./ProfileForm.css`). The model wasn't reasoning about React incorrectly — it was reasoning about a file it had never actually seen, filling in plausible-looking paths for imports it could tell were needed from JSX usage but had no way to know the real value of.

**The fix, and how it was verified, not just applied**: `MigrationRequest` gained an `existingImports` field — the original file's real `import` declarations, verbatim — threaded through `migrateWithRetry()` and into both LLM client prompts with an explicit "reuse these exact paths, don't invent" instruction. Re-run against the same two real files: every import path came back correct — `../../Api`, `./ProfileForm.css`, `react-toolbox/lib/input` — matching the actual source exactly, not a plausible guess. This is the same underlying shape as a bug found the same session in the deterministic codemod path: a migration step given a code fragment stripped of its file context will confidently invent what belongs there instead of reusing what's actually there — true whether that step is a hand-written codemod or an LLM.

**A second, compounding discovery from the same real-world run**: fixing the import problem surfaced two further structural gaps underneath it, fixed the same way — verify against real behavior, find the actual cause, fix it generally rather than patch the one file:

- TypeScript has no built-in notion of a CSS Modules import (`import styles from './Foo.css'`) — every real repo using CSS Modules would fail validation on that alone, regardless of whether the migration itself was correct. Fixed with an ambient `declare module "*.css"` shim added to the validation project's types, not a special case for this one file.
- `useRef(null)` with no generic type argument infers `never`, so `.current.someMethod()` fails type-checking even behind a truthy guard — a common, real React+TypeScript gotcha the model kept reproducing. Added as a new rule to `error-feedback.ts`'s `enrichDiagnostics()` (the same enrichment mechanism from decision #3 above) rather than accepted as an unfixable model limitation: re-run against the same two real files, both converged to `status: done` within the retry budget instead of exhausting all 3 attempts.

**Interview-ready version**: *"I found that giving the LLM only the isolated code fragment being migrated wasn't a simplification — it was the actual bug. It produced confident, plausible-looking hallucinated imports because the model had no way to know the real file structure. I fixed it by threading the original file's real imports into the prompt, verified against the exact real files that exposed the bug that import paths now come back correct, and found two more structural gaps in the same session — a missing CSS Modules type shim, a common useRef typing pattern — each fixed at the level of 'what's true for any repo with this pattern,' not patched for the one file that happened to expose it."*

## The throughline across all seven

Every one of these is the same shape: **build something, verify it against real behavior rather than trusting that it looks correct, find that it wasn't quite right, fix the root cause, and verify the fix the same way.** That loop — not any single clever piece of code — is the actual skill this project demonstrates, and it's the answer to give when asked "walk me through something that didn't work the way you expected."
