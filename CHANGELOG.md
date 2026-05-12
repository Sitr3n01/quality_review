# Changelog

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
