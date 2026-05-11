const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildBaseline } = require("../../scripts/quality/update-baseline");

test("buildBaseline produces schemaVersion 1 with required sections", () => {
  const baseline = buildBaseline({}, { now: "2026-01-01T00:00:00.000Z" });
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.ok("coverage" in baseline);
  assert.ok("duplication" in baseline);
  assert.ok("eslint" in baseline);
  assert.ok("files" in baseline);
  assert.ok("complexity" in baseline);
});

test("buildBaseline preserves coverage metrics when available", () => {
  const current = {
    coverage: { available: true, metrics: { lines: 82.5, statements: 80, functions: 75, branches: 70.2 } },
  };
  const baseline = buildBaseline(current);
  assert.equal(baseline.coverage.lines, 82.5);
  assert.equal(baseline.coverage.statements, 80);
  assert.equal(baseline.coverage.functions, 75);
  assert.equal(baseline.coverage.branches, 70.2);
});

test("buildBaseline leaves coverage null when collector unavailable", () => {
  const current = { coverage: { available: false, metrics: null } };
  const baseline = buildBaseline(current);
  assert.equal(baseline.coverage.lines, null);
  assert.equal(baseline.coverage.branches, null);
});

test("buildBaseline preserves file line counts and oversized files", () => {
  const current = {
    files: {
      available: true,
      oversizedFiles: [{ file: "src/api.js", lines: 1500, limit: 1200 }],
      maxLines: 1500,
      fileLineCounts: { "src/api.js": 1500, "src/utils.js": 100 },
    },
  };
  const baseline = buildBaseline(current);
  assert.deepEqual(baseline.files.oversizedFiles, [{ file: "src/api.js", lines: 1500 }]);
  assert.equal(baseline.files.maxLines, 1500);
  assert.equal(baseline.files.fileLineCounts["src/api.js"], 1500);
});

test("buildBaseline preserves eslint rule violations", () => {
  const current = {
    eslint: {
      available: true,
      errors: 5,
      warnings: 3,
      ruleViolations: { "no-unused-vars": 4, "complexity": 1 },
    },
  };
  const baseline = buildBaseline(current);
  assert.equal(baseline.eslint.errors, 5);
  assert.equal(baseline.eslint.warnings, 3);
  assert.equal(baseline.eslint.ruleViolations["no-unused-vars"], 4);
});
