const { test } = require("node:test");
const assert = require("node:assert/strict");

const { compareBaseline } = require("../../scripts/quality/compare-baseline");

const baseConfig = require("../../quality/quality-gate.config.cjs");

function makeCurrent(overrides = {}) {
  return {
    coverage: { available: true, metrics: { lines: 80, statements: 80, functions: 80, branches: 80 }, warnings: [] },
    eslint: { available: true, errors: 0, warnings: 0, ruleViolations: {}, topFiles: [], warningsList: [] },
    duplication: { available: true, percentage: 2.0, fragments: 5, duplicatedLines: 50, warnings: [] },
    files: {
      available: true,
      totalFiles: 10,
      changedFiles: [],
      changedFilesStrategy: "none",
      addedFiles: [],
      largestFiles: [],
      oversizedFiles: [],
      nearLimitFiles: [],
      fileLineCounts: {},
      maxLines: 100,
      thresholds: { warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
      warnings: [],
    },
    complexity: {
      heuristicOnly: true,
      maxDepthViolations: 0,
      complexityViolations: 0,
      longFunctionViolations: 0,
      details: [],
      warnings: [],
    },
    ...overrides,
  };
}

function makeBaseline(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: null,
    source: "test",
    coverage: { lines: 80, statements: 80, functions: 80, branches: 80 },
    duplication: { percentage: 2.0, fragments: 5, duplicatedLines: 50 },
    eslint: { errors: 0, warnings: 0, ruleViolations: {} },
    files: { oversizedFiles: [], maxLines: 100, fileLineCounts: {} },
    complexity: { maxDepthViolations: 0, complexityViolations: 0, longFunctionViolations: 0 },
    ...overrides,
  };
}

test("status=passed when current matches baseline exactly", () => {
  const result = compareBaseline(makeCurrent(), makeBaseline(), baseConfig);
  assert.equal(result.status, "passed");
  assert.equal(result.summary.blocking, 0);
});

test("coverage drop on any metric is blocking", () => {
  const current = makeCurrent({
    coverage: { available: true, metrics: { lines: 80, statements: 80, functions: 80, branches: 78 }, warnings: [] },
  });
  const result = compareBaseline(current, makeBaseline(), baseConfig);
  assert.equal(result.status, "failed");
  const branchDrop = result.regressions.find((r) => r.type === "coverage-drop" && r.metric === "branches");
  assert.ok(branchDrop, "expected a coverage-drop regression for branches");
  assert.equal(branchDrop.severity, "blocking");
});

test("coverage at the exact baseline does not regress", () => {
  const current = makeCurrent();
  const result = compareBaseline(current, makeBaseline(), baseConfig);
  assert.equal(result.status, "passed");
});

test("baseline null on coverage emits warning, not blocking", () => {
  const current = makeCurrent({
    coverage: { available: true, metrics: { lines: 30, statements: 30, functions: 30, branches: 30 }, warnings: [] },
  });
  const baseline = makeBaseline({
    coverage: { lines: null, statements: null, functions: null, branches: null },
  });
  const result = compareBaseline(current, baseline, baseConfig);
  assert.equal(result.status, "warning");
  assert.equal(result.summary.blocking, 0);
  const w = result.warnings.find((x) => x.type === "coverage-no-baseline");
  assert.ok(w, "expected a coverage-no-baseline warning");
});

test("duplication increase is blocking", () => {
  const current = makeCurrent({
    duplication: { available: true, percentage: 2.5, fragments: 6, duplicatedLines: 60, warnings: [] },
  });
  const result = compareBaseline(current, makeBaseline(), baseConfig);
  assert.equal(result.status, "failed");
  const r = result.regressions.find((x) => x.type === "duplication-increase");
  assert.ok(r);
});

test("duplication over absolute cap is blocking even if baseline matches", () => {
  const current = makeCurrent({
    duplication: { available: true, percentage: 5.0, fragments: 10, duplicatedLines: 200, warnings: [] },
  });
  const baseline = makeBaseline({ duplication: { percentage: 5.0, fragments: 10, duplicatedLines: 200 } });
  const result = compareBaseline(current, baseline, baseConfig);
  assert.equal(result.status, "failed");
  const r = result.regressions.find((x) => x.type === "duplication-over-absolute-cap");
  assert.ok(r);
});

test("lint error increase is blocking", () => {
  const current = makeCurrent({
    eslint: { available: true, errors: 3, warnings: 0, ruleViolations: {}, topFiles: [], warningsList: [] },
  });
  const result = compareBaseline(current, makeBaseline(), baseConfig);
  assert.equal(result.status, "failed");
  const r = result.regressions.find((x) => x.type === "lint-errors-increase");
  assert.ok(r);
});

test("oversized file that did not grow is info, not blocking", () => {
  const current = makeCurrent({
    files: {
      available: true,
      totalFiles: 1,
      changedFiles: [],
      changedFilesStrategy: "none",
      addedFiles: [],
      largestFiles: [{ file: "src/api.js", lines: 1500 }],
      oversizedFiles: [{ file: "src/api.js", lines: 1500, limit: 1200 }],
      nearLimitFiles: [],
      fileLineCounts: { "src/api.js": 1500 },
      maxLines: 1500,
      thresholds: { warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
      warnings: [],
    },
  });
  const baseline = makeBaseline({
    files: { oversizedFiles: [{ file: "src/api.js", lines: 1500 }], maxLines: 1500, fileLineCounts: { "src/api.js": 1500 } },
  });
  const result = compareBaseline(current, baseline, baseConfig);
  assert.equal(result.status, "passed");
  const info = result.infos.find((x) => x.type === "oversized-file-stable");
  assert.ok(info);
});

test("oversized file that grew is blocking", () => {
  const current = makeCurrent({
    files: {
      available: true,
      totalFiles: 1,
      changedFiles: ["src/api.js"],
      changedFilesStrategy: "origin/main...HEAD",
      addedFiles: [],
      largestFiles: [{ file: "src/api.js", lines: 1800 }],
      oversizedFiles: [{ file: "src/api.js", lines: 1800, limit: 1200 }],
      nearLimitFiles: [],
      fileLineCounts: { "src/api.js": 1800 },
      maxLines: 1800,
      thresholds: { warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
      warnings: [],
    },
  });
  const baseline = makeBaseline({
    files: { oversizedFiles: [{ file: "src/api.js", lines: 1500 }], maxLines: 1500, fileLineCounts: { "src/api.js": 1500 } },
  });
  const result = compareBaseline(current, baseline, baseConfig);
  assert.equal(result.status, "failed");
  const r = result.regressions.find((x) => x.type === "oversized-file-grew");
  assert.ok(r);
  assert.equal(r.baselineLines, 1500);
  assert.equal(r.currentLines, 1800);
});

test("new file exceeding maxLinesNewFile is blocking", () => {
  const current = makeCurrent({
    files: {
      available: true,
      totalFiles: 1,
      changedFiles: ["src/new.js"],
      changedFilesStrategy: "origin/main...HEAD",
      addedFiles: ["src/new.js"],
      largestFiles: [{ file: "src/new.js", lines: 900 }],
      oversizedFiles: [],
      nearLimitFiles: [],
      fileLineCounts: { "src/new.js": 900 },
      maxLines: 900,
      thresholds: { warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
      warnings: [],
    },
  });
  const result = compareBaseline(current, makeBaseline(), baseConfig);
  assert.equal(result.status, "failed");
  const r = result.regressions.find((x) => x.type === "new-file-oversized");
  assert.ok(r);
});

test("missing coverage with blockOnMissingCoverageFile=false produces warning only", () => {
  const current = makeCurrent({
    coverage: { available: false, metrics: null, source: null, warnings: [{ severity: "warning", message: "No coverage report was found." }] },
  });
  const result = compareBaseline(current, makeBaseline(), baseConfig);
  assert.equal(result.status, "warning");
  assert.equal(result.summary.blocking, 0);
});

test("missing coverage with blockOnMissingCoverageFile=true is blocking", () => {
  const current = makeCurrent({
    coverage: { available: false, metrics: null, source: null, warnings: [] },
  });
  const cfg = JSON.parse(JSON.stringify(baseConfig));
  cfg.coverage.blockOnMissingCoverageFile = true;
  const result = compareBaseline(current, makeBaseline(), cfg);
  assert.equal(result.status, "failed");
  const r = result.regressions.find((x) => x.type === "coverage-missing");
  assert.ok(r);
});

test("aiReviewContext.shouldRunAiExplainer is true only when status is failed", () => {
  const passing = compareBaseline(makeCurrent(), makeBaseline(), baseConfig);
  assert.equal(passing.aiReviewContext.shouldRunAiExplainer, false);

  const failing = compareBaseline(
    makeCurrent({
      coverage: { available: true, metrics: { lines: 70, statements: 80, functions: 80, branches: 80 }, warnings: [] },
    }),
    makeBaseline(),
    baseConfig,
  );
  assert.equal(failing.aiReviewContext.shouldRunAiExplainer, true);
});
