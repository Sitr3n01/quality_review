# Changelog

## Unreleased

### Changed

- **Acceptance policy is now uniformly legacy-friendly.** The guiding
  rule across every category is:
  *Absolute thresholds are opt-in. Baseline regressions block by
  default.*
  Ratchets continue to block by default; absolute floors and ceilings
  (coverage minimums, duplication ceiling, lint warning ratchet) are
  configurable as warning or blocking.
- Duplication acceptance is now expressed through `duplication.maximum`
  with `{ enabled, severity, percentage }`. The default ships
  `severity: "warning"`, so a legacy project at 8% duplication can adopt
  the gate without immediately failing. The ratchet still blocks any
  duplication increase against `quality/baseline.json`.
- The legacy `duplication.maxPercentage` field is still accepted, but it
  is now interpreted as `maximum: { enabled: true, severity:
  "warning", percentage: N }` instead of the previous blocking
  `duplication-over-absolute-cap`. Teams that want the previous
  blocking behavior must opt in with `maximum.severity: "blocking"`.
- Lint warnings increasing against baseline is advisory by default
  (`lint.warningIncreaseSeverity: "warning"`). Lint errors increasing
  remains blocking. Set `warningIncreaseSeverity: "blocking"` for the
  previous strict behavior.
- The duplication finding type emitted when current exceeds the
  configured maximum is `duplication-over-maximum` (replaces the
  blocking-only `duplication-over-absolute-cap`).
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

- `scripts/quality/duplication-policy.js` — a pure policy module that
  mirrors `coverage-policy.js`. Exports `resolveDuplicationMaximumPolicy`,
  `evaluateDuplicationMaximum`, `evaluateDuplicationRatchet`, and
  `duplicationNoBaselineFinding`.
- `duplication.maximum.{enabled, severity, percentage}` configuration
  with `severity` accepting `"warning"` or `"blocking"`.
- `lint.warningIncreaseSeverity` configuration with `"warning"` (default,
  legacy-friendly) or `"blocking"` (strict) accepted values.
- `tests/quality/duplication-policy.test.js` — unit tests for the
  duplication policy module.
- Compare-baseline tests for the new duplication maximum severity matrix
  (disabled / warning / blocking), the legacy `maxPercentage`
  interpretation, and lint warning severity matrix.
- Validation tests for the new `duplication.maximum` shape and the
  `lint.warningIncreaseSeverity` field.
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
