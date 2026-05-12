# Quality Gate

This folder contains the deterministic quality gate configuration and baseline
used by the `quality-gate` skill.

## Files

- `quality-gate.config.cjs` — policy: thresholds, ratchet rules, file include/exclude.
- `baseline.json` — accepted state of the main branch. Versioned in git.

## Commands

```
npm run quality:report     # collect + write JSON/MD reports, never fails
npm run quality:check      # collect + compare vs baseline, exits 1 on blocking regression
npm run quality:baseline   # overwrite baseline.json with current metrics (use on main only)
npm run quality:validate   # validate config and required package scripts
npm run audit:report       # write reports/audit/npm-audit.json
npm run complexity:ci      # write reports/complexity/eslint-complexity.json
npm run test:coverage:ci   # run tests with coverage thresholds
```

## Policy

The project may not be perfect today, but new PRs should not make it worse.

This gate uses **ratchet rules**:

- coverage must not decrease versus baseline;
- coverage must meet configured minimums when present;
- duplication must not increase versus baseline;
- lint violations must not increase versus baseline;
- complexity violations must not increase versus baseline;
- oversized files must not grow;
- critical vulnerabilities block immediately (no baseline needed).

Improvements are always free. Only regressions block.

## Baseline

`baseline.json` represents the accepted state of the main branch.

**Do not update the baseline in a PR just to make checks pass.** That hides regressions.

Update the baseline on `main` after human approval, ideally in a dedicated commit so it
shows up in `git blame`. The `quality:baseline` command warns when run from a non-main
branch.

A fresh baseline starts with all `null` values. The gate treats `null` baseline metrics
as "no expectation yet" — they produce warnings instead of blocking. Run
`npm run quality:baseline` once on `main` to lock in the current state.

## AI policy

AI agents (Claude Code, Codex, others) may:

- explain why a gate failed;
- propose minimal fixes;
- suggest missing tests;
- help split oversized files.

AI agents may **not**:

- update the baseline to hide regressions;
- weaken thresholds in `quality-gate.config.cjs` to make a PR pass;
- silence failing checks;
- approve or merge PRs.

The human reviewer remains responsible for the merge decision.
