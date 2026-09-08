# Demo Script — Legacy Migrator

Target length: 4-6 minutes. Structure: show the problem, show the pipeline working, show one real bug the system caught, close on the architecture decision. Don't try to show every week's feature — depth on 2-3 things beats a shallow tour of all 8.

Record your screen with the terminal and browser both visible (split screen or fast alt-tabbing). Narrate live rather than adding voiceover after — it reads as more authentic and is easier for you to actually do.

---

## Segment 1 — The problem (30 seconds, talking head or slide, no screen share yet)

**Say something like:**
> "Migrating React class components to hooks is exactly the kind of work teams put off forever — tedious, error-prone, and low-glory. I built a tool that automates the mechanical parts and only asks an LLM for judgment where judgment is actually needed — and validates every single change before it's ever shown as done."

Don't over-explain the architecture yet — that comes later, earned by showing it work first.

---

## Segment 2 — Live classification (45 seconds)

Screen: terminal, `packages/server` folder.

```bash
node dist/scripts/run-classifier.js
```

**While it runs, say:**
> "This walks the AST of three real components and sorts each into a tier — no LLM involved yet. This one's mechanical, safe for a pure codemod. This one needs judgment — it has a debounced search with conditional cleanup logic. And this one's a hard stop — it's wrapped in a higher-order component, so touching it automatically would be unsafe."

Point at the actual colored terminal output as you say each tier name.

---

## Segment 3 — The whole pipeline, live (90 seconds)

Screen: three terminals (redis, worker, server) already running from before recording starts — don't waste time on setup live. Browser open to the UI.

```bash
curl -X POST http://localhost:3001/api/migrate-repo \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/some-org/some-real-repo.git"}'
```

**Say:**
> "This points the tool at an entire real codebase — not my test fixtures — clones it, discovers every class component across the repo, and enqueues one job per file."

Switch to the browser. Jobs should appear live in the sidebar as they complete.

**Say:**
> "This is streaming live over WebSocket as a background worker processes each file — classify, then either a deterministic codemod or an LLM call, then validation, before anything is marked done."

Click into one `NEEDS_LLM` result. Show the Monaco diff — original class component on the left, generated hooks version on the right.

**Say:**
> "Nothing gets written to disk or committed until a human clicks Approve here."

---

## Segment 4 — The real bug (60-90 seconds — this is the most important part of the whole demo)

This is where you differentiate from every other "I built an AI code tool" demo. Don't skip it for time.

**Say:**
> "Here's something that actually happened while building this, not a scripted example. My classifier said this component was safe for the deterministic path — no LLM needed. I ran the codemod on it anyway and validated the output."

Show the terminal output of the 44 validation diagnostics from the `ProfileForm.js` stress test (or re-run it live if you kept the stress-test repo around).

**Say:**
> "Forty-four compiler errors. My classifier had a blind spot — this component declared its state as a class field instead of in a constructor, a pattern I'd never tested against. I fixed the actual detection logic, not just this one file, and confirmed the fix by testing it against a second real file with the same pattern, plus a full regression check that my original test cases still worked."

If you can show a quick before/after of the classifier output (`MECHANICAL` → `NEEDS_LLM` for the same file), that's an extremely strong 10 seconds — a visible, undeniable proof point.

---

## Segment 5 — Close (20-30 seconds)

**Say something like:**
> "The whole project is built around one idea: don't trust that generated code is correct just because it looks right — validate it, and when validation isn't enough, like a subtle behavioral bug that still compiles fine, catch it with a human review step. Every real bug in this build got caught because I tested against real behavior instead of assuming the code was done once it ran once."

End on the GitHub link or repo URL on screen.

---

## What NOT to do

- Don't narrate the whole architecture up front before showing anything work — show, then explain.
- Don't apologize for or rush past the bug segment — it's the strongest material you have, not a flaw to hide.
- Don't try to cram in Weeks 1-8 individually. Pick the classifier, the live pipeline, and the ProfileForm bug. That's the whole story.
- Don't read this script verbatim on camera — know the beats, say it in your own words. A demo that sounds memorized reads worse than one with a few "let me just—" moments.

## Optional stretch segment (only if under time and confident)

Show the git side: after clicking Approve, switch to a terminal and run `git log --oneline --all --graph` in the target repo, showing the migration branch with the new commit and confirming `main` is untouched. This is a good 20-second addition if Segment 4 went smoothly and you have room — skip it if you're already near 6 minutes.
