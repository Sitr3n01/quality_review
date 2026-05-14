---
name: baseline
description: Initialize or update quality/baseline.json with current metrics from `main`. Use ONLY when explicitly asked to "seed the baseline", "update baseline on main", or "establish quality baseline for this repo". Strict guardrails — refuses to run on feature branches.
disable-model-invocation: true
---

# Quality Gate — Baseline (Mode D)

Initialize or refresh `quality/baseline.json` from the current `main` branch's deterministic metrics. **This is a manually-invoked workflow** — Claude will not run it automatically.

## Runtime detection (do this first)

```
bash -lc 'echo "CLAUDECODE=${CLAUDECODE:-unset} BASE_URL=${ANTHROPIC_BASE_URL:-unset}"'
```

Custom-provider terminal → work sequentially. See
`.claude/skills/quality-gate/references/runtime-detection.md`.

## Pre-flight checks (block if any fails)

1. Run `git branch --show-current`. If the output is **not** `main`, `master`, or `develop`, **stop** and warn:
   > "Baseline updates should normally happen on `main`. Updating on a feature branch hides regressions. Switch to main first with `git switch main`, or pass `--force` to override (not recommended)."
2. Run `git status --short`. If the working tree is **not clean**, stop and ask the user to commit or stash first.
3. Confirm with the user: "About to overwrite `quality/baseline.json` with the current metrics from `<branch>`. This is intentional and should land as a dedicated commit. Proceed?"

## Workflow (only after pre-flight passes)

1. Generate fresh reports:
   ```
   npm run quality:report
   ```
2. Rewrite the baseline:
   ```
   npm run quality:baseline
   ```
3. Show the user the diff:
   ```
   git diff quality/baseline.json
   ```
4. Instruct the user to **commit it as a dedicated commit** (do not bundle with other changes):
   ```
   git add quality/baseline.json
   git commit -m "chore(quality): refresh baseline from main"
   ```

## Hard rules

- **Never** update the baseline to make a failing PR pass — this defeats the gate.
- **Never** run on a feature branch without explicit override.
- **Never** commit the baseline change bundled with other unrelated changes.
- **Always** explain the diff before committing.
- See `.claude/skills/quality-gate/references/ai-review-policy.md` for AI-specific constraints around baselines.

## Common mistake to avoid

A failing PR is **never** a reason to bump the baseline. The baseline reflects the agreed-upon "current state of `main`" — it is the **denominator** of every ratchet check. Bumping it to mask a regression hides the regression from every subsequent PR.
