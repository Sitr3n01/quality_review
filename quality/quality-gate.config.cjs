// Quality Gate configuration
//
// This file controls the deterministic quality gate. Each section maps to a
// collector under `scripts/quality/`. The gate is opinionated by default but
// every threshold here is overridable per-project.
//
// Modes (see quality-gate.js):
//   - report:   collect + write JSON/MD, always exit 0
//   - check:    collect + compare against baseline.json, exit 1 if blocking regression
//   - baseline: collect current metrics and overwrite quality/baseline.json
//
// Ratchet rule: a metric is allowed to *improve* freely, but new regressions
// against the committed baseline are blocking. This lets legacy projects
// adopt the gate without first becoming perfect.

module.exports = {
  // "auto" lets utils.detectStack() decide. Override with one of:
  //   "node", "node-ts", "unity", "python", "mixed"
  projectType: "auto",

  coverage: {
    enabled: true,
    mode: "ratchet",
    allowDecrease: false,
    metrics: ["lines", "statements", "functions", "branches"],

    // Absolute coverage minimums are opt-in to keep the template
    // legacy-friendly. Set `enabled: true` to apply them, and choose
    // `severity: "warning"` (advisory) or `severity: "blocking"` (strict).
    // Ratchet coverage still applies regardless — coverage must not drop
    // against the committed baseline.
    minimums: {
      enabled: false,
      severity: "warning",
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    },
    minimumDeltaToReport: 0.01,
    blockOnMissingCoverageFile: false,
    coverageSummaryPaths: [
      "coverage/coverage-summary.json",
      "coverage/coverage-final.json",
    ],
  },

  audit: {
    enabled: true,
    npmAuditJsonPath: "reports/audit/npm-audit.json",
    blockLevels: ["critical"],
    warnLevels: ["high", "moderate"],
    infoLevels: ["low"],
    blockOnMissingReport: false,
  },

  lint: {
    enabled: true,
    mode: "ratchet",
    allowNewErrors: false,
    allowNewWarnings: false,
    eslintJsonPath: "reports/eslint/eslint.json",
    blockOnMissingReport: false,
  },

  duplication: {
    enabled: true,
    mode: "ratchet",
    allowIncrease: false,
    maxPercentage: 3.0,
    jscpdJsonPaths: [
      "reports/duplication/jscpd-report.json",
      "reports/duplication/jscpd.json",
    ],
    blockOnMissingReport: false,
  },

  files: {
    enabled: true,
    include: [
      "*.cjs",
      "*.js",
      "quality/**/*.cjs",
      "scripts/**/*.js",
      "src/**/*.js",
      "src/**/*.jsx",
      "src/**/*.ts",
      "src/**/*.tsx",
      "tests/**/*.js",
      "Assets/**/*.cs",
      "**/*.cs",
    ],
    exclude: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "reports/**",
      ".git/**",
      "Library/**",
      "Temp/**",
      "obj/**",
      "bin/**",
    ],
    warnLines: 500,
    maxLinesNewFile: 800,
    maxLinesExistingFile: 1200,
    blockIfOversizedFileGrows: true,
  },

  complexity: {
    enabled: true,
    eslintJsonPath: "reports/complexity/eslint-complexity.json",
    maxDepth: 4,
    maxCyclomaticComplexity: 10,
    maxFunctionLines: 80,
    blockOnRegression: true,
    heuristicFallback: true,
  },

  pullRequest: {
    maxChangedFilesWarning: 30,
    maxChangedLinesWarning: 800,
    maxChangedLinesBlock: 1500,
  },

  aiReview: {
    enabled: true,
    aiIsNeverAuthoritative: true,
    blockOnlyDeterministicFindings: true,
  },
};
