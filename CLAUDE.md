# Claude Project Instructions

This repository is the canonical template for the **lucas-quality-gate** skill.
It is also a working installation: the skill files are present in
`.claude/skills/lucas-quality-gate/` and the deterministic gate is configured in
`quality/` and `scripts/quality/`.

## Lucas Quality Gate

When asked to work on CI/CD, PR quality, code-review automation, coverage,
duplication, oversized files, or AI-generated code quality, use the skill:

```
/lucas-quality-gate
```

The skill is also auto-discovered when the user describes a task that matches
its description.

## Rules in this repository

- Do not remove existing functionality.
- Do not bypass quality gates.
- Do not update `quality/baseline.json` casually — see `quality/README.md`.
- Do not hardcode secrets in workflows, prompts, or code.
- Do not make broad refactors unless explicitly requested.
- Prefer small, testable changes.
- Always explain quality tradeoffs.
- Run `npm run test:quality` after modifying any file under `scripts/quality/`.
- If `quality:check` fails, explain the exact regression and propose the smallest safe fix.
- When in doubt, consult:
  - `.claude/skills/lucas-quality-gate/SKILL.md` for the skill entry point
  - `.claude/skills/lucas-quality-gate/references/philosophy.md` for the why
  - `.claude/skills/lucas-quality-gate/references/quality-rules.md` for the how
  - `.claude/skills/lucas-quality-gate/references/ai-review-policy.md` for limits on AI authority

## Useful commands

```
npm run quality:report     # collect + write reports (never fails)
npm run quality:check      # collect + compare vs baseline (exits 1 on blocking regression)
npm run quality:baseline   # rewrite baseline.json (use on main only)
npm run quality:comment    # render the PR comment file
npm run test:quality       # unit tests for the quality scripts
```

## Mirroring with the Codex skill

The same skill content lives at `.agents/skills/lucas-quality-gate/`. After
editing one side, sync the other:

```
bash .claude/skills/lucas-quality-gate/scripts/install-or-sync.sh
```

The script reports divergent files; pass `--force` to apply.

## Memory-style notes

- This repository's gate is configured for Node/TS/JS by default. For Unity or
  Python projects, the gate still runs but only the universal collectors
  (file size, complexity heuristic, audit) produce signal.
- The repo intentionally has no test framework dependency in `package.json` —
  the gate's own tests use the built-in `node:test` runner.
- When asked to add Jest, Vitest, ESLint, or JSCPD, do not change the gate
  scripts to require them. The collectors already handle missing reports.
