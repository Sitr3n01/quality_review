const { test } = require("node:test");
const assert = require("node:assert/strict");

const { compareBaseline } = require("../../scripts/quality/compare-baseline");
const {
  cloneBaseConfig,
  coverageBaseline,
  coverageCurrent,
  coveragePolicy,
  makeBaseline,
  makeCurrent,
  standardCoverageMinimums,
} = require("./helpers/quality-fixtures");

const baseConfig = cloneBaseConfig();
const LOW_COVERAGE_METRICS = { lines: 22, statements: 22, functions: 22, branches: 10 };
const LOW_COVERAGE_BASELINE = { lines: 20, statements: 20, functions: 20, branches: 8 };

function baseConfigWithMinimums(minimums) {
  const cfg = cloneBaseConfig();
  cfg.coverage.minimums = minimums;
  return cfg;
}

function belowMinimumScenario(metrics = LOW_COVERAGE_METRICS) {
  return {
    current: coverageCurrent(metrics),
    baseline: coverageBaseline(LOW_COVERAGE_BASELINE),
  };
}

function oversizedFileScenario(currentLines, baselineLines, changedFiles = []) {
  const file = "src/api.js";
  return {
    current: makeCurrent({
      files: {
        available: true,
        totalFiles: 1,
        changedFiles,
        changedFilesStrategy: changedFiles.length > 0 ? "origin/main...HEAD" : "none",
        addedFiles: [],
        largestFiles: [{ file, lines: currentLines }],
        oversizedFiles: [{ file, lines: currentLines, limit: 1200 }],
        nearLimitFiles: [],
        fileLineCounts: { [file]: currentLines },
        maxLines: currentLines,
        thresholds: { warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
        warnings: [],
      },
    }),
    baseline: makeBaseline({
      files: {
        oversizedFiles: [{ file, lines: baselineLines }],
        maxLines: baselineLines,
        fileLineCounts: { [file]: baselineLines },
      },
    }),
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

test("minimums blocking: low coverage blocks even when baseline is null", () => {
  const current = coverageCurrent({ lines: 50 });
  const baseline = coverageBaseline({ lines: null });
  const cfg = coveragePolicy({
    minimums: standardCoverageMinimums({ enabled: true, severity: "blocking" }),
  });
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.status, "failed");
  assert.ok(result.regressions.some((f) => f.type === "coverage-below-minimum"));
  assert.ok(result.warnings.some((f) => f.type === "coverage-no-baseline"));
});

test("minimums warning: low coverage warns when baseline is null", () => {
  const current = coverageCurrent({ lines: 50 });
  const baseline = coverageBaseline({ lines: null });
  const cfg = coveragePolicy({
    minimums: standardCoverageMinimums({ enabled: true, severity: "warning" }),
  });
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.status, "warning");
  assert.equal(result.summary.blocking, 0);
  assert.ok(result.warnings.some((f) => f.type === "coverage-below-minimum"));
  assert.ok(result.warnings.some((f) => f.type === "coverage-no-baseline"));
});

test("minimums disabled: baseline null still emits only no-baseline coverage warning", () => {
  const current = coverageCurrent({ lines: 50 });
  const baseline = coverageBaseline({ lines: null });
  const cfg = coveragePolicy({
    minimums: standardCoverageMinimums({ enabled: false, severity: "blocking" }),
  });
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.status, "warning");
  assert.equal(result.summary.blocking, 0);
  assert.ok(result.warnings.some((f) => f.type === "coverage-no-baseline"));
  assert.ok(!result.warnings.some((f) => f.type === "coverage-below-minimum"));
  assert.ok(!result.regressions.some((f) => f.type === "coverage-below-minimum"));
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
  const { current, baseline } = oversizedFileScenario(1500, 1500);
  const result = compareBaseline(current, baseline, baseConfig);
  assert.equal(result.status, "passed");
  const info = result.infos.find((x) => x.type === "oversized-file-stable");
  assert.ok(info);
});

test("oversized file that grew is blocking", () => {
  const { current, baseline } = oversizedFileScenario(1800, 1500, ["src/api.js"]);
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
  const cfg = cloneBaseConfig();
  cfg.coverage.blockOnMissingCoverageFile = true;
  const result = compareBaseline(current, makeBaseline(), cfg);
  assert.equal(result.status, "failed");
  const r = result.regressions.find((x) => x.type === "coverage-missing");
  assert.ok(r);
});

test("minimums disabled: low coverage above baseline passes without coverage-below-minimum", () => {
  const { current, baseline } = belowMinimumScenario();
  const cfg = baseConfigWithMinimums(standardCoverageMinimums({ enabled: false }));
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.summary.blocking, 0);
  const below = [...result.regressions, ...result.warnings].find(
    (f) => f.type === "coverage-below-minimum",
  );
  assert.ok(!below, "expected no coverage-below-minimum finding when minimums.enabled is false");
});

test("minimums warning: low coverage emits warning, not blocking", () => {
  const { current, baseline } = belowMinimumScenario();
  const cfg = baseConfigWithMinimums(standardCoverageMinimums({ enabled: true, severity: "warning" }));
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.summary.blocking, 0);
  const warning = result.warnings.find(
    (f) => f.type === "coverage-below-minimum" && f.metric === "lines",
  );
  assert.ok(warning, "expected a coverage-below-minimum warning when severity is warning");
  assert.equal(warning.severity, "warning");
});

test("minimums blocking: low coverage is blocking", () => {
  const { current, baseline } = belowMinimumScenario({ ...LOW_COVERAGE_METRICS, branches: 68 });
  const cfg = baseConfigWithMinimums(standardCoverageMinimums({ enabled: true, severity: "blocking" }));
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.status, "failed");
  const blocker = result.regressions.find(
    (f) => f.type === "coverage-below-minimum" && f.severity === "blocking",
  );
  assert.ok(blocker, "expected a blocking coverage-below-minimum regression");
});

test("ratchet still blocks coverage drop even when minimums.enabled is false", () => {
  const current = coverageCurrent({ lines: 19, statements: 19, functions: 19, branches: 7 });
  const baseline = coverageBaseline(LOW_COVERAGE_BASELINE);
  const cfg = baseConfigWithMinimums(standardCoverageMinimums({ enabled: false }));
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.status, "failed");
  assert.ok(result.regressions.some((f) => f.type === "coverage-drop"));
});

test("coverage improvement below absolute minimum still passes when minimums.enabled is false", () => {
  const { current, baseline } = belowMinimumScenario();
  const cfg = baseConfigWithMinimums(standardCoverageMinimums({ enabled: false }));
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.summary.blocking, 0);
  assert.ok(result.infos.some((f) => f.type === "coverage-improved"));
});

test("legacy minimums without enabled flag are not applied (opt-in default)", () => {
  // Backward-compatibility: a legacy config that defines minimums but no
  // `enabled` field should be treated as opt-in (enabled=false), aligned
  // with the new ratchet-first default. Documented in CHANGELOG.
  const { current, baseline } = belowMinimumScenario();
  const cfg = baseConfigWithMinimums({
    lines: 80,
    statements: 80,
    functions: 80,
    branches: 70,
  });
  const result = compareBaseline(current, baseline, cfg);
  assert.equal(result.summary.blocking, 0);
  const below = [...result.regressions, ...result.warnings].find(
    (f) => f.type === "coverage-below-minimum",
  );
  assert.ok(!below, "legacy minimums without enabled flag should not block");
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
