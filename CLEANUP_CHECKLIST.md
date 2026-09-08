# Pre-portfolio cleanup checklist

Run through this before linking the repo anywhere public. Each item is
something that's easy to forget mid-build but obvious to a reviewer.

## Secrets and credentials

- [ ] `.env` is in `.gitignore` and was NEVER committed — check with
      `git log --all --full-history -- .env`. If it shows up, the key in
      it is compromised; rotate it in the Anthropic console regardless of
      whether you remove the file from history.
- [ ] No API keys, tokens, or credentials hardcoded anywhere in source
      files (`grep -r "sk-ant" src/` and `grep -r "sk-ant" packages/` as a
      quick check).
- [ ] `workspace/` (whole-repo ingestion's clone destination) is
      gitignored — it can contain full clones of other repos.

## Dead code and debug artifacts

- [ ] No leftover `console.log` debugging lines that were meant to be
      temporary (search for recently-added `console.log` calls you added
      while chasing a specific bug and forgot to remove).
- [ ] No commented-out blocks of old code left "just in case."
- [ ] No test/verification scripts left in `src/` that were only ever
      meant to confirm something once (e.g., anything named
      `test-*.ts` or `verify-*.ts` that isn't part of the actual eval
      harness).

## Documentation consistency

- [ ] `README.md`'s roadmap checklist actually matches what's built —
      don't leave a week marked incomplete that's actually done, or vice
      versa.
- [ ] Every "known limitation" you wrote down is still actually true —
      some may have been fixed by later weeks without the earlier
      limitation note being removed.
- [ ] Setup instructions (`npm install`, `npx tsc`, run commands) still
      match your actual current folder structure — if you reorganized
      into a monorepo partway through, double check every code block in
      the README reflects real paths, not the pre-reorg ones.

## Verify it still runs from scratch

This is the one that matters most — don't trust that it works because it
worked at some point during the build.

```bash
# Delete everything that could be masking a missing dependency or file
rm -rf node_modules dist packages/*/node_modules packages/*/dist

# Reinstall and rebuild from nothing
npm install    # or per-package install if using workspaces
npx tsc

# Run the core verification: does classification still produce the
# expected tier split on your fixtures?
node dist/scripts/run-classifier.js   # adjust path to your structure
```

If this doesn't work cleanly, a reviewer's first experience with your
project will be a broken `npm install` — worth catching before anyone
else does.

## The one thing worth doing even if you skip everything else above

Actually re-read `DESIGN_DECISIONS.md` once, out loud, as if explaining it
to an interviewer. If any sentence doesn't sound like something you could
say confidently and specifically if asked a follow-up question about it,
that's worth fixing before you rely on it in an actual interview.
