# Changelog

## Unreleased

### Changed

- AI explainer workflows (`codex-quality-explainer.yml`,
  `claude-quality-assistant.yml`) now generate deterministic quality
  context locally in each run via `npm run quality:explainer-context`
  instead of relying on `actions/download-artifact@v4` to fetch the
  `quality-gate-report` artifact from a sibling run. This makes the
  explainers reliable when triggered by labels, comments, or manual
  dispatch — events that do not share a run with `quality-gate.yml`.
- Coverage absolute minimums are now **opt-in**. The default policy is
  ratchet-first and legacy-friendly. Existing repositories that want the
  prior strict behavior must set `coverage.minimums.enabled: true` and
  `coverage.minimums.severity: "blocking"` in
  `quality/quality-gate.config.cjs`.
- Both AI explainer workflows now resolve PR context uniformly across
  `pull_request`, `issue_comment`, `pull_request_review_comment`, and
  `workflow_dispatch` events, and check out the correct PR head SHA.

### Added

- `coverage.minimums.enabled` and `coverage.minimums.severity`
  configuration. `severity` accepts `"warning"` (advisory) or
  `"blocking"` (strict).
- `npm run quality:explainer-context` and
  `scripts/quality/run-explainer-context.js` — a Node helper that runs
  the deterministic toolchain best-effort and records each command's
  exit code in `reports/explainer/commands.ndjson`. Always exits 0.
- `workflow_dispatch` `pr_number` input for both AI explainer workflows.
- `workflow_dispatch` `run_quality_context` toggle to skip the
  deterministic generation step when only inspecting prompt behavior.
- Tests covering `minimums.enabled` off / warning / blocking, the
  ratchet remaining active when minimums are off, and the legacy config
  shape (no `enabled` flag) being treated as off.

### Security

- AI explainers continue to skip fork PRs entirely, so the
  `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` secrets are never exposed to
  code from an untrusted fork.

## 1.0.0 - Public Release

Quality Gate v1.0 is the first public release of the deterministic CI/CD quality
gate template for AI-assisted codebases.

### Added

- Deterministic quality gate scripts for audit, lint, coverage, duplication,
  file size, and complexity.
- ESLint AST complexity reporting with heuristic fallback only when the real
  report is missing.
- npm audit report collection with critical vulnerabilities as blocking
  findings and high/moderate vulnerabilities as warnings.
- Coverage thresholds for this template: 80% lines, statements, and functions;
  70% branches.
- CI matrix for Node 18.18, 20, and 22.
- Dependabot configuration for npm and GitHub Actions.
- Versioned schemas for `quality/baseline.json` and
  `reports/quality-gate.json`.
- Claude Code, Claude Desktop, Codex, and Google Antigravity project
  configuration under the neutral **Quality Gate** name.

### Changed

- Renamed the public skill and package identity to `quality-gate`.
- Replaced placeholder scripts with real deterministic commands.
- Replaced Node test globs with a portable test runner so CI works consistently
  across Node 18.18, 20, and 22.
- Made CI coverage artifacts unique per matrix entry.
- Expanded `.gitignore` for generated reports, coverage, local AI tool state,
  caches, logs, temporary files, and secrets.

### Security

- Added fork guards around workflows that can access AI provider secrets.
- Kept deterministic workflows secret-free.
- Preserved minimal GitHub Actions permissions and advisory-only AI policy.
