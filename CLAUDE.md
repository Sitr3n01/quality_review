# Claude Project Instructions

This repository is the canonical template for the **quality-gate** skill.
It is also a working installation: the skill files are present in
`.claude/skills/quality-gate/` and the deterministic gate is configured in
`quality/` and `scripts/quality/`.

The public product name is **Quality Gate**.

## Quality Gate

When asked to work on CI/CD, PR quality, code-review automation, coverage,
duplication, oversized files, or AI-generated code quality, use the skill:

```
/quality-gate
```

The skill is also auto-discovered when the user describes a task that matches
its description.

## Rules in this repository

- Do not remove existing functionality.
- Do not bypass quality gates.
- Do not update `quality/baseline.json` casually; see `quality/README.md`.
- Do not hardcode secrets in workflows, prompts, or code.
- Do not make broad refactors unless explicitly requested.
- Prefer small, testable changes.
- Always explain quality tradeoffs.
- Run `npm run test:quality` after modifying any file under `scripts/quality/`.
- If `quality:check` fails, explain the exact regression and propose the smallest safe fix.
- When in doubt, consult:
  - `.claude/skills/quality-gate/SKILL.md` for the skill entry point
  - `.claude/skills/quality-gate/references/philosophy.md` for the why
  - `.claude/skills/quality-gate/references/quality-rules.md` for the how
  - `.claude/skills/quality-gate/references/ai-review-policy.md` for limits on AI authority

## Useful commands

```
npm run quality:report             # collect + write reports (never fails)
npm run quality:check              # collect + compare vs baseline (exits 1 on blocking regression)
npm run quality:baseline           # rewrite baseline.json (use on main only)
npm run quality:comment            # render the PR comment file
npm run quality:validate           # validate gate config and required scripts
npm run quality:explainer-context  # local deterministic context for AI explainers
npm run audit:report               # write npm audit JSON report
npm run complexity:ci              # write ESLint complexity JSON report
npm run test:quality               # unit tests for the quality scripts
npm run test:integration           # integration tests for repo wiring
npm run test:coverage:ci           # tests plus coverage thresholds
```

## AI explainer workflows

The Codex and Claude explainer workflows must generate fresh
deterministic quality reports in their own run before invoking AI. Do
not rely on artifacts from another workflow run unless using a
deliberate `workflow_run` implementation. The shipped workflows call
`npm run quality:explainer-context`, which writes
`reports/explainer/commands.ndjson` plus the standard reports.

## Coverage policy

The default quality gate is **ratchet-first and legacy-friendly**.
Absolute coverage minimums are opt-in through
`coverage.minimums.enabled` with `severity: "warning"` (advisory) or
`severity: "blocking"` (strict). Ratchet (`allowDecrease: false`) still
applies in every mode — coverage must not drop against
`quality/baseline.json`.

## Mirroring with the Codex skill

The same skill content lives at `.agents/skills/quality-gate/`. After
editing one side, sync the other:

```
bash .claude/skills/quality-gate/scripts/install-or-sync.sh
```

The script reports divergent files; pass `--force` to apply.

## Claude Desktop

The project-scoped skill lives at `.claude/skills/quality-gate/`, which keeps
the same name and activation metadata for Claude Code and Claude Desktop skill
workflows.

## Memory-style notes

- This repository's gate is configured for Node/TS/JS by default and uses
  ESLint/JSCPD/c8 as dev-time tooling for the canonical template.
- The gate's own tests use the built-in `node:test` runner.
- Collectors still handle missing reports for downstream projects, but this
  canonical repo should generate audit, lint, coverage, duplication, and
  complexity reports before `quality:check`.
