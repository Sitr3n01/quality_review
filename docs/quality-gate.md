# Quality Gate

This project ships a deterministic CI/CD quality gate plus a **hybrid report
layer** that turns the gate's findings into three artifacts: a machine-facing
Markdown contract, a concise human summary, and an optional rich HTML report
for complex cases.

The deterministic checks decide pass/fail. AI is advisory only and is never
the final judge.

## TL;DR

```sh
# Local pre-GitHub readiness check (runs producers + gate).
npm run quality:preflight

# Deterministic gate (decides pass/fail; exits 1 on blocking regression).
npm run quality:check

# Hybrid report artifacts (always exits 0 unless --enforce is passed).
npm run quality:hybrid-report

# Force the rich HTML artifact even for simple cases.
npm run quality:hybrid-report -- --html
```

The hybrid reporter reads the existing `reports/quality-gate.json` produced
by the deterministic gate. It does not re-run the checks; it formats them.
The local preflight runner is the recommended agent-facing command before
GitHub: it writes `reports/preflight/`, continues through all producers for
visibility, and exits 1 when required setup or `quality:check` fails.

## The three artifacts

After `npm run quality:hybrid-report` you get:

```
.quality-gate/
├── QUALITY_GATE.md      # machine-facing Markdown contract
├── HUMAN_SUMMARY.md     # concise default human-readable summary
├── HUMAN_REPORT.html    # rich HTML, only for COMPLEX or forced runs
└── logs/
    ├── build.log
    ├── tests.log
    ├── lint.log
    ├── typecheck.log
    ├── security.log
    ├── coverage.log
    ├── duplication.log
    ├── files.log
    ├── complexity.log
    └── gate.log
```

`.quality-gate/` is `.gitignore`d. Every run rewrites it from scratch.

The existing `reports/quality-gate.json`, `reports/quality-gate.md`, and
`reports/pr-comment.md` are preserved — the hybrid layer is additive.

### QUALITY_GATE.md — machine source of truth

`QUALITY_GATE.md` is **Markdown only**, with no HTML, no decorative emoji,
and no human prose in the machine-critical sections. It is designed to be
parsed by scripts as well as read by people.

Stable contract:

| Element | Constraint |
| --- | --- |
| `SCHEMA_VERSION` | Always `qg-md-1` for this revision. |
| `GATE_STATUS` | One of `PASS`, `FAIL`, `WARN`, `SKIPPED`. |
| `DECISION_SOURCE` | Always `deterministic-checks`. |
| `AI_OVERRIDE_ALLOWED` | Always `false`. |
| Per-check status | One of `PASS`, `FAIL`, `WARN`, `SKIPPED`. |
| Risk values | One of `low`, `medium`, `high`, `unknown`. |
| Blocking values | One of `true`, `false`. |

Stable headings (do not rename without a migration):

```
# Quality Gate Machine Report
## Summary
## Checks
## Blocking Failures
## Warnings
## Metrics
## Changed Files
## Final Decision
```

### HUMAN_SUMMARY.md — default human view

This is the short, plain-language summary humans actually read. It is
generated on every run, in any complexity tier. It explicitly points at
evidence rather than embedding it.

The summary is written in English by default. If the project explicitly
configures a different language, the renderer can be extended to honor it
(the machine keys must remain English regardless).

### HUMAN_REPORT.html — optional rich view

The HTML report is **only** generated when:

- the run was classified as `COMPLEX` by the deterministic classifier, **or**
- the user passed `--html`, `--force-html`, or `--detailed`.

It is self-contained: inline CSS, no JavaScript, no external assets. It can
be opened from a downloaded CI artifact even without network access.

All user-controlled strings (PR file paths, regression messages) are HTML
escaped before being injected, so a malicious PR cannot inject scripts.

## Complexity classifier

The classifier is a pure function — same input, same label, every time.

| Tier | Triggers (any one is enough unless noted) |
| --- | --- |
| `SIMPLE` | Gate passed (or only minor warnings) and fewer than 6 changed files. |
| `MODERATE` | 1–2 blocking failures, OR ≥ 3 warnings, OR 6–10 changed files, OR a high-risk file touched with warnings. |
| `COMPLEX` | 3+ blocking failures, OR critical security vulnerability, OR > 10 changed files, OR coverage drop combined with oversized/complexity/duplication regressions, OR a blocking failure that touches a high-risk path. |

High-risk paths include `.github/workflows/`, `.github/actions/`, `auth*`,
`payment*`, `secret*`, `credential*`, `deploy*`, `quality/baseline.json`,
and `quality/quality-gate.config.cjs`.

The `--html` flag overrides the classifier and always produces HTML.

## CLI

```
node scripts/quality/hybrid-report.js [options]

  --html, --force-html, --detailed   Always emit HUMAN_REPORT.html.
  --enforce                          Exit 1 when the gate verdict is failed.
  --regenerate                       Force regeneration of reports/quality-gate.json.
  --out=<dir>                        Override output directory (default .quality-gate).
  --input=<path>                     Override input JSON (default reports/quality-gate.json).
  -h, --help                         Show this help.
```

By default the reporter exits **0** even when the gate failed. The
deterministic verdict still lives in `npm run quality:check`, which exits
1 on blocking regression. If you want the hybrid reporter to also enforce
that contract in one step, add `--enforce`.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Artifacts were written. The gate may have passed, warned, or failed. |
| `1` | The gate verdict is `failed` AND `--enforce` was passed. |
| `2` | Infrastructure error: input JSON cannot be read. |

## How pass/fail is decided

| Decision | Component |
| --- | --- |
| **What pass/fail means** | `scripts/quality/compare-baseline.js`, driven by `quality/quality-gate.config.cjs` and `quality/baseline.json`. |
| **Who emits the verdict** | `npm run quality:check` (exit 1 on blocking regression). |
| **Who verifies local readiness before GitHub** | `npm run quality:preflight` (producer checkpoints plus `quality:check`). |
| **Who explains the verdict** | The hybrid reporter (`npm run quality:hybrid-report`) plus the AI explainer workflows. |
| **AI authority** | None. The classifier is deterministic and `AI_OVERRIDE_ALLOWED` is always `false`. |

## Adding a new check

1. Implement a collector under `scripts/quality/collect-<name>.js`. It must
   return `{ available, ...metrics, warnings: [...] }`.
2. Wire the collector into `collectAll` in `scripts/quality/quality-gate.js`.
3. Extend `compareBaseline` so the collector's output produces findings with
   the right `type` prefix and `severity`.
4. Add a check entry to the central registry in
   `scripts/quality/check-registry.js`; machine, human, HTML, and log views
   consume that registry.
5. Add unit tests in `tests/quality/`.
6. Update `quality/baseline.json` on `main` in a deliberate commit.

## Where things live

| Path | Purpose |
| --- | --- |
| `scripts/quality/hybrid-report.js` | CLI orchestrator. |
| `scripts/quality/run-local-preflight.js` | Local pre-GitHub readiness runner for agents and humans. |
| `scripts/quality/classify-complexity.js` | SIMPLE / MODERATE / COMPLEX classifier. |
| `scripts/quality/check-registry.js` | Canonical check list, evidence paths, and finding-to-check mapping. |
| `scripts/quality/file-risk.js` | Shared file category and risk classification. |
| `scripts/quality/report-status.js` | Shared machine status labels. |
| `scripts/quality/render-machine-md.js` | Machine Markdown renderer. |
| `scripts/quality/render-human-summary.js` | Concise human Markdown renderer. |
| `scripts/quality/render-human-html.js` | Self-contained HTML renderer. |
| `scripts/quality/capture-logs.js` | Per-check log synthesis from the JSON report. |
| `scripts/quality/quality-gate.js` | Existing deterministic pipeline (`report`, `check`, `baseline`). |
| `scripts/quality/compare-baseline.js` | Existing comparator that produces the verdict. |
| `quality/quality-gate.config.cjs` | Thresholds, ratchet flags, opt-in coverage minimums. |
| `quality/baseline.json` | Versioned accepted state of `main`. |
| `reports/quality-gate.json` | Internal JSON source-of-truth (the comparator's output). |
| `reports/quality-gate.md` | Legacy human Markdown report (still produced). |
| `.quality-gate/` | New hybrid artifacts (machine MD, human MD, optional HTML, logs). |

## Token economy

Simple cases produce a short Markdown summary, period. HTML is not generated
unless the classifier escalated to `COMPLEX` or the user explicitly asked
for it. This keeps automated CI pipelines cheap and noise-free for the
common path.

## What AI can and cannot do here

AI is **advisory only**. The AI explainer workflows (Codex, Claude) read
the deterministic reports and write narrative explanations. They cannot:

- override the gate verdict;
- mark a failed gate as passed;
- modify `quality/baseline.json`;
- weaken `quality/quality-gate.config.cjs`;
- silence failing tests, lint, or audits;
- edit files in the explainer sandbox.

The hybrid reporter itself does not call any AI model. It only reads the
JSON written by the deterministic pipeline and formats it.
