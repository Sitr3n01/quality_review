const { test } = require("node:test");
const assert = require("node:assert/strict");
const pkg = require("../../package.json");

const { compareAudit, compareBaseline } = require("../../scripts/quality/compare-baseline");
const { validateConfig } = require("../../scripts/quality/validate-config");
const { buildBaseline } = require("../../scripts/quality/update-baseline");
const {
  coverageBaseline,
  coverageCurrent,
  coveragePolicy,
  fullScriptPackage,
  standardCoverageMinimums,
  validationConfig,
} = require("./helpers/quality-fixtures");

test("compareAudit blocks critical vulnerabilities and warns on high/moderate", () => {
  const out = { regressions: [], warnings: [], infos: [] };
  compareAudit(
    { audit: { available: true, counts: { critical: 1, high: 2, moderate: 1, low: 1, info: 0 } } },
    { audit: { enabled: true, blockLevels: ["critical"], warnLevels: ["high", "moderate"], infoLevels: ["low"] } },
    out,
  );
  assert.equal(out.regressions.length, 1);
  assert.equal(out.warnings.length, 2);
  assert.equal(out.infos.length, 1);
});

test("compareBaseline includes audit collector findings in final status", () => {
  const result = compareBaseline(
    {
      coverage: { available: false, warnings: [] },
      audit: { available: true, counts: { critical: 1 } },
      eslint: { available: false, warningsList: [] },
      duplication: { available: false, warnings: [] },
      files: { available: false, warnings: [] },
      complexity: { warnings: [] },
    },
    {},
    { audit: { enabled: true, blockLevels: ["critical"], warnLevels: [], infoLevels: [] } },
  );
  assert.equal(result.status, "failed");
  assert.ok(result.regressions.some((finding) => finding.type === "audit-vulnerability"));
});

test("coverage minimums in blocking mode block even without a coverage drop", () => {
  const result = compareBaseline(
    {
      ...coverageCurrent({ lines: 79, statements: 90, functions: 90, branches: 90 }),
      audit: { available: false, warnings: [] },
      eslint: { available: false, warningsList: [] },
      duplication: { available: false, warnings: [] },
      files: { available: false, warnings: [] },
      complexity: { warnings: [] },
    },
    coverageBaseline({ lines: 79, statements: 90, functions: 90, branches: 90 }),
    coveragePolicy({
      metrics: ["lines", "statements", "functions", "branches"],
      minimums: standardCoverageMinimums({ enabled: true, severity: "blocking" }),
    }),
  );
  assert.equal(result.status, "failed");
  assert.ok(result.regressions.some((finding) => finding.type === "coverage-below-minimum"));
});

test("lint warning increase and complexity warning mode are reported", () => {
  const result = compareBaseline(
    {
      coverage: { available: false, warnings: [] },
      audit: { available: false, warnings: [] },
      eslint: { available: true, errors: 0, warnings: 2, ruleViolations: {}, topFiles: [], warningsList: [] },
      duplication: { available: false, warnings: [] },
      files: { available: false, warnings: [] },
      complexity: { maxDepthViolations: 2, complexityViolations: 0, longFunctionViolations: 0, warnings: [] },
    },
    {
      eslint: { errors: 0, warnings: 1 },
      complexity: { maxDepthViolations: 1, complexityViolations: 0, longFunctionViolations: 0 },
    },
    {
      lint: { enabled: true, allowNewErrors: false, allowNewWarnings: false },
      complexity: { enabled: true, blockOnRegression: false },
    },
  );
  assert.equal(result.status, "failed");
  assert.ok(result.regressions.some((finding) => finding.type === "lint-warnings-increase"));
  assert.ok(result.warnings.some((finding) => finding.type === "complexity-maxDepthViolations-increase"));
});

test("buildBaseline preserves audit counts", () => {
  const baseline = buildBaseline({
    audit: {
      available: true,
      counts: { info: 0, low: 1, moderate: 2, high: 3, critical: 0, total: 6 },
    },
  });
  assert.equal(baseline.audit.high, 3);
  assert.equal(baseline.audit.total, 6);
});

test("validateConfig catches missing scripts and malformed thresholds", () => {
  const result = validateConfig(
    {
      coverage: { enabled: true, metrics: ["lines"], coverageSummaryPaths: ["coverage.json"], minimums: { lines: "80" } },
      audit: { enabled: true, npmAuditJsonPath: "audit.json", blockLevels: ["critical"], warnLevels: ["high"] },
      duplication: { enabled: true, maxPercentage: "3", jscpdJsonPaths: ["dup.json"] },
      files: { enabled: true, include: ["scripts/**/*.js"], exclude: [], warnLines: 1, maxLinesNewFile: 2, maxLinesExistingFile: 3 },
      complexity: { enabled: true, eslintJsonPath: "complexity.json", maxDepth: 4, maxCyclomaticComplexity: 10, maxFunctionLines: 80 },
    },
    { scripts: { "quality:report": "x", "quality:check": "x", "quality:baseline": "x" } },
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((msg) => msg.includes("coverage.minimums.lines")));
  assert.ok(result.errors.some((msg) => msg.includes("duplication.maxPercentage")));
  assert.ok(result.errors.some((msg) => msg.includes("quality:validate")));
});

test("validateConfig accepts opt-in minimums in advisory or blocking mode", () => {
  const baseScripts = fullScriptPackage();
  const baseCoverage = (severity) =>
    validationConfig({
      coverage: {
        minimums: { enabled: true, severity, lines: 80 },
      },
    });

  assert.equal(validateConfig(baseCoverage("warning"), baseScripts).valid, true);
  assert.equal(validateConfig(baseCoverage("blocking"), baseScripts).valid, true);

  const badSeverity = baseCoverage("loud");
  const bad = validateConfig(badSeverity, baseScripts);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some((msg) => msg.includes("coverage.minimums.severity")));
});

test("validateConfig allows minimums to be disabled with no per-metric values", () => {
  const result = validateConfig(
    validationConfig({
      coverage: {
        metrics: ["lines", "branches"],
        minimums: { enabled: false, severity: "warning" },
      },
    }),
    fullScriptPackage(),
  );
  assert.equal(result.valid, true);
});

test("validateConfig accepts the repository configuration shape", () => {
  const result = validateConfig(
    validationConfig(),
    fullScriptPackage(),
  );
  assert.equal(result.valid, true);
});

test("duplication:ci scans quality scripts and tests", () => {
  const script = pkg.scripts["duplication:ci"];
  assert.match(script, /\bscripts\/quality\b/);
  assert.match(script, /\btests\b/);
});
