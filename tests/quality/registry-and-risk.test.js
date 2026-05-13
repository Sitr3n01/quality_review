const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  CHECK_DEFINITIONS,
  buildChecks,
  checkIdForType,
  checkLogFile,
  deriveCheckStatus,
  deriveCheckStatusForCheck,
  evidencePath,
} = require("../../scripts/quality/check-registry");
const {
  classifyFileCategory,
  classifyFileRisk,
  hasHighRiskFile,
  HIGH_RISK_PATTERNS,
} = require("../../scripts/quality/file-risk");
const {
  gateStatusLabel,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
} = require("../../scripts/quality/report-status");

function makeReport(overrides = {}) {
  return {
    status: "passed",
    regressions: [],
    warnings: [],
    current: {
      coverage: { available: true },
      audit: { available: true },
      eslint: { available: true },
      duplication: { available: true },
      files: { available: true },
      complexity: { available: true },
    },
    ...overrides,
  };
}

test("report-status maps internal verdicts to machine statuses", () => {
  assert.equal(gateStatusLabel("passed"), STATUS_PASS);
  assert.equal(gateStatusLabel("warning"), STATUS_WARN);
  assert.equal(gateStatusLabel("failed"), STATUS_FAIL);
  assert.equal(gateStatusLabel("skipped"), STATUS_SKIPPED);
  assert.equal(gateStatusLabel("unknown"), STATUS_SKIPPED);
});

test("check registry exposes the canonical check order and log files", () => {
  assert.deepEqual(
    CHECK_DEFINITIONS.map((check) => check.id),
    ["build", "tests", "lint", "typecheck", "security", "coverage", "duplication", "files", "complexity"],
  );
  assert.deepEqual(
    CHECK_DEFINITIONS.map(checkLogFile),
    ["build.log", "tests.log", "lint.log", "typecheck.log", "security.log", "coverage.log", "duplication.log", "files.log", "complexity.log"],
  );
});

test("check registry derives check status and evidence consistently", () => {
  const report = makeReport({
    regressions: [{ type: "coverage-drop", severity: "blocking" }],
    warnings: [{ type: "file-near-limit", severity: "warning" }],
  });
  const checks = buildChecks(report);

  assert.equal(deriveCheckStatus(report, "coverage"), STATUS_FAIL);
  assert.equal(deriveCheckStatus(report, "files"), STATUS_WARN);
  assert.equal(deriveCheckStatusForCheck(report, CHECK_DEFINITIONS[0]), STATUS_SKIPPED);
  assert.equal(checkIdForType("new-file-oversized"), "files");
  assert.equal(evidencePath(CHECK_DEFINITIONS[5]), ".quality-gate/logs/coverage.log");
  assert.equal(checks.find((check) => check.id === "coverage").status, STATUS_FAIL);
});

test("file-risk preserves category and risk classifications", () => {
  assert.equal(classifyFileCategory(".github/workflows/ci.yml"), "infra");
  assert.equal(classifyFileCategory(".agents/skills/quality-gate/SKILL.md"), "infra");
  assert.equal(classifyFileCategory("tests/foo.test.js"), "test");
  assert.equal(classifyFileCategory("README.md"), "docs");
  assert.equal(classifyFileCategory("quality/baseline.json"), "config");
  assert.equal(classifyFileCategory("src/app.js"), "source");
  assert.equal(classifyFileCategory("randomfile.xyz"), "unknown");

  assert.equal(classifyFileRisk(".github/workflows/ci.yml"), "high");
  assert.equal(classifyFileRisk("quality/baseline.json"), "high");
  assert.equal(classifyFileRisk("src/auth/login.js"), "high");
  assert.equal(classifyFileRisk("tests/foo.test.js"), "low");
  assert.equal(classifyFileRisk("README.md"), "low");
  assert.equal(classifyFileRisk("scripts/build.js"), "medium");
  assert.equal(classifyFileRisk("randomfile.xyz"), "unknown");
});

test("file-risk exposes high-risk patterns for the classifier", () => {
  assert.ok(HIGH_RISK_PATTERNS.length > 0);
  assert.equal(hasHighRiskFile(["src/app.js", ".github/workflows/ci.yml"]), true);
  assert.equal(hasHighRiskFile(["src/app.js", "tests/app.test.js"]), false);
});
