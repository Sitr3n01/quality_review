---
name: install
description: Install the deterministic quality gate into the current repository (creates scripts/quality/, quality-gate.config.cjs, baseline stub, GitHub Actions workflow). Use when the user asks "set up quality gate", "install CI quality check", or starts a new repo and wants ratchet-based regression detection.
---

# Quality Gate — Install (Mode A)

Set up the deterministic quality gate from scratch in the current repository.

## Runtime detection (do this first)

```
bash -lc 'echo "CLAUDECODE=${CLAUDECODE:-unset} BASE_URL=${ANTHROPIC_BASE_URL:-unset}"'
```

Custom-provider terminal → work sequentially, no `Task`/`Agent`. See
`.claude/skills/quality-gate/references/runtime-detection.md`.

## Workflow

1. **Inspect the repository** to detect the stack:
   - package manager (`pnpm-lock.yaml` / `yarn.lock` / `package-lock.json`)
   - test runner (`jest`, `vitest`, `node:test`, or none)
   - existing lint config (ESLint?)
   - existing coverage output paths
   - existing GitHub Actions
   - whether `quality/baseline.json` already exists (if yes, **preserve it**)

2. **Confirm with the user** before writing anything: list exactly which files you will create, which will be modified, and which will be preserved.

3. **Create or update** (preserve existing files; never overwrite policy or baseline):

   ```
   scripts/quality/*.js                    (deterministic logic)
   quality/quality-gate.config.cjs         (policy, only if absent)
   quality/baseline.json                   (stub with nulls, only if absent)
   reports/.gitkeep
   .github/workflows/quality-gate.yml      (add jobs if ci.yml exists)
   .github/prompts/codex-quality-explainer.md
   .github/prompts/claude-quality-explainer.md
   AGENTS.md / CLAUDE.md sections          (append, never overwrite)
   package.json scripts                    (quality:report, :check, :baseline, producer scripts)
   ```

   Producer scripts must be real project commands: `test:coverage:ci` should
   match the target test runner and write `coverage/coverage-summary.json` or
   `coverage/coverage-final.json`; do not blindly pass coverage flags through
   `npm run test` when `test` wraps Turbo or another task runner. Ensure
   `jscpd` is present in devDependencies before using `duplication:ci`.

4. **Seed the baseline** on `main`:
   ```
   git switch main
   npm run quality:baseline
   git commit quality/baseline.json -m "chore(quality): seed baseline"
   ```

5. **Smoke test**:
   ```
   npm run quality:validate
   npm run quality:preflight
   npm run quality:report
   npm run quality:check
   ```

## Hard rules

- **Preserve existing files.** If `.github/workflows/ci.yml` exists, add jobs or create a separate workflow.
- **Never hardcode secrets** in workflows, prompts, or code.
- **Never set `continue-on-error: true`** on the final blocking quality check step.
- **Never use `danger-full-access`** unless the user explicitly requests it.
- See `.claude/skills/quality-gate/references/ai-review-policy.md` for AI-specific constraints.

## Source-of-truth references

- `.claude/skills/quality-gate/SKILL.md` — full skill (monolithic master)
- `.claude/skills/quality-gate/references/quality-rules.md` — thresholds
- `.claude/skills/quality-gate/references/github-actions.md` — workflow guidance
