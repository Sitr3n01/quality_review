const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { collectAudit, extractFromNpmAudit } = require("../../scripts/quality/collect-audit");
const { collectCoverage, extractFromFinal, extractFromSummary } = require("../../scripts/quality/collect-coverage");
const { collectDuplication, extractFromJscpd } = require("../../scripts/quality/collect-duplication");
const { collectEslint } = require("../../scripts/quality/collect-eslint");
const {
  analyzeFunctions,
  collectComplexity,
  collectHeuristicComplexity,
  countMaxBraceDepth,
  extractFromEslintReport,
} = require("../../scripts/quality/collect-complexity");
const { collectFileMetrics } = require("../../scripts/quality/collect-file-metrics");

const fixtureDir = path.join(process.cwd(), "tests", "fixtures", "quality");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

function relFixture(name) {
  return path.join("tests", "fixtures", "quality", name).split(path.sep).join("/");
}

test("coverage collector reads json-summary reports", () => {
  const metrics = extractFromSummary(fixture("coverage-summary.json"));
  assert.deepEqual(metrics, { lines: 90, statements: 80, functions: 80, branches: 75 });

  const result = collectCoverage({
    coverage: { coverageSummaryPaths: [relFixture("coverage-summary.json")] },
  });
  assert.equal(result.available, true);
  assert.equal(result.metrics.lines, 90);
  assert.equal(result.source, relFixture("coverage-summary.json"));
});

test("coverage collector reads coverage-final reports", () => {
  const metrics = extractFromFinal(fixture("coverage-final.json"));
  assert.deepEqual(metrics, { lines: 50, statements: 50, functions: 100, branches: 50 });
});

test("coverage collector warns for missing or invalid reports", () => {
  const result = collectCoverage({ coverage: { coverageSummaryPaths: ["missing/coverage.json"] } });
  assert.equal(result.available, false);
  assert.match(result.warnings[0].message, /No coverage report/);
});

test("coverage collector reports invalid and unrecognized coverage files", () => {
  const dir = path.join(process.cwd(), "reports", "test-fixtures", "coverage");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "invalid.json"), "{", "utf8");
  fs.writeFileSync(path.join(dir, "unknown.json"), "{\"hello\":true}", "utf8");

  const result = collectCoverage({
    coverage: {
      coverageSummaryPaths: [
        "reports/test-fixtures/coverage/invalid.json",
        "reports/test-fixtures/coverage/unknown.json",
      ],
    },
  });

  assert.equal(result.available, false);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings[0].message, /could not be parsed/);
  assert.match(result.warnings[1].message, /unrecognized shape/);
});

test("eslint collector aggregates counts, rules, and top files", () => {
  const result = collectEslint({ lint: { eslintJsonPath: relFixture("eslint.json") } });
  assert.equal(result.available, true);
  assert.equal(result.errors, 1);
  assert.equal(result.warnings, 2);
  assert.equal(result.ruleViolations["no-unused-vars"], 1);
  assert.equal(result.ruleViolations["unknown-rule"], 1);
  assert.equal(result.topFiles.length, 1);
});

test("eslint collector reports missing and malformed JSON", () => {
  const dir = path.join(process.cwd(), "reports", "test-fixtures", "eslint");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "object.json"), "{}", "utf8");

  const missing = collectEslint({ lint: { eslintJsonPath: "reports/test-fixtures/eslint/missing.json" } });
  assert.equal(missing.available, false);
  assert.match(missing.warningsList[0].message, /not found/);

  const malformed = collectEslint({ lint: { eslintJsonPath: "reports/test-fixtures/eslint/object.json" } });
  assert.equal(malformed.available, false);
  assert.match(malformed.warningsList[0].message, /not a JSON array/);
});

test("eslint collector tolerates partial entries", () => {
  const dir = path.join(process.cwd(), "reports", "test-fixtures", "eslint");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "partial.json"),
    JSON.stringify([
      null,
      {
        errorCount: "not-a-number",
        warningCount: 1,
        messages: "not-an-array",
      },
    ]),
    "utf8",
  );

  const result = collectEslint({ lint: { eslintJsonPath: "reports/test-fixtures/eslint/partial.json" } });
  assert.equal(result.available, true);
  assert.equal(result.errors, 0);
  assert.equal(result.warnings, 1);
  assert.deepEqual(result.ruleViolations, {});
  assert.equal(result.topFiles[0].file, "unknown");
});

test("duplication collector handles modern JSCPD report shape", () => {
  const metrics = extractFromJscpd(fixture("jscpd-report.json"));
  assert.deepEqual(metrics, { percentage: 1.5, fragments: 2, duplicatedLines: 12 });

  const result = collectDuplication({
    duplication: { jscpdJsonPaths: [relFixture("jscpd-report.json")] },
  });
  assert.equal(result.available, true);
  assert.equal(result.percentage, 1.5);
});

test("duplication collector handles old, flat, missing, and malformed shapes", () => {
  assert.deepEqual(
    extractFromJscpd({ statistics: { percentage: 2, clones: 3, duplicatedLines: 4 } }),
    { percentage: 2, fragments: 3, duplicatedLines: 4 },
  );
  assert.deepEqual(
    extractFromJscpd({ percentage: 1, duplicatedLines: 5, duplicates: [{}, {}, {}] }),
    { percentage: 1, fragments: 3, duplicatedLines: 5 },
  );
  assert.equal(extractFromJscpd({ nope: true }), null);

  const result = collectDuplication({ duplication: { jscpdJsonPaths: ["missing/duplication.json"] } });
  assert.equal(result.available, false);
  assert.match(result.warnings[0].message, /No duplication report/);
});

test("audit collector handles npm audit metadata shape", () => {
  const counts = extractFromNpmAudit(fixture("npm-audit.json"));
  assert.equal(counts.high, 1);
  assert.equal(counts.total, 4);

  const result = collectAudit({ audit: { npmAuditJsonPath: relFixture("npm-audit.json") } });
  assert.equal(result.available, true);
  assert.equal(result.counts.moderate, 2);
});

test("audit collector treats empty npm audit output as zero vulnerabilities", () => {
  assert.equal(extractFromNpmAudit({}).total, 0);
  assert.equal(extractFromNpmAudit({ auditReportVersion: 2 }).critical, 0);
  const counts = extractFromNpmAudit({
    metadata: {
      vulnerabilities: {
        low: 1,
      },
    },
  });
  assert.equal(counts.total, 1);
});

test("audit collector handles vulnerabilities object, missing report, and malformed JSON", () => {
  const counts = extractFromNpmAudit({
    vulnerabilities: {
      a: { severity: "critical" },
      b: { severity: "high" },
      c: { severity: "unknown" },
    },
  });
  assert.equal(counts.critical, 1);
  assert.equal(counts.high, 1);
  assert.equal(counts.total, 2);

  const missing = collectAudit({ audit: { npmAuditJsonPath: "missing/npm-audit.json" } });
  assert.equal(missing.available, false);
  assert.match(missing.warnings[0].message, /not found/);

  const dir = path.join(process.cwd(), "reports", "test-fixtures", "audit");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bad.json"), "{\"unexpected\":true}", "utf8");
  const bad = collectAudit({ audit: { npmAuditJsonPath: "reports/test-fixtures/audit/bad.json" } });
  assert.equal(bad.available, false);
  assert.match(bad.warnings[0].message, /unrecognized shape/);
});

test("complexity collector reads ESLint complexity report", () => {
  const extracted = extractFromEslintReport(fixture("eslint-complexity.json"));
  assert.equal(extracted.heuristicOnly, false);
  assert.equal(extracted.complexityViolations, 1);
  assert.equal(extracted.maxDepthViolations, 1);
  assert.equal(extracted.longFunctionViolations, 1);

  const result = collectComplexity({
    complexity: {
      eslintJsonPath: relFixture("eslint-complexity.json"),
      heuristicFallback: false,
    },
  });
  assert.equal(result.heuristicOnly, false);
  assert.equal(result.details.length, 3);
});

test("complexity collector reports malformed real report when fallback is disabled", () => {
  const dir = path.join(process.cwd(), "reports", "test-fixtures", "complexity");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bad.json"), "{}", "utf8");

  const bad = collectComplexity({
    complexity: {
      eslintJsonPath: "reports/test-fixtures/complexity/bad.json",
      heuristicFallback: false,
    },
  });
  assert.equal(bad.heuristicOnly, false);
  assert.match(bad.warnings[0].message, /unrecognized shape/);

  const missing = collectComplexity({
    complexity: {
      eslintJsonPath: "reports/test-fixtures/complexity/missing.json",
      heuristicFallback: false,
    },
  });
  assert.match(missing.warnings[0].message, /not found/);
});

test("heuristic depth helper ignores braces inside strings and comments", () => {
  const source = `
    function demo(flag) {
      const literal = "{";
      // if (x) {
      if (flag && literal) {
        return flag ? 1 : 2;
      }
    }
  `;
  assert.equal(countMaxBraceDepth(source), 2);
});

test("heuristic function analyzer flags long and complex functions", () => {
  const source = `
    function demo(flag) {
      if (flag) {
        return flag ? 1 : 2;
      }
    }
  `;
  const info = analyzeFunctions(source, { maxFunctionLines: 3, maxCyclomaticComplexity: 2 });
  assert.equal(info.longFunctions.length, 1);
  assert.equal(info.complexFunctions.length, 1);
});

test("heuristic complexity collector measures configured files", () => {
  const dir = path.join(process.cwd(), "reports", "test-fixtures", "complexity-source");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "sample.js"),
    `
function sample(a, b, c) {
  if (a) {
    if (b) {
      if (c) {
        if (a && b || c) {
          return a ? b : c;
        }
      }
    }
  }
}
`,
    "utf8",
  );

  const result = collectHeuristicComplexity({
    files: { include: ["reports/test-fixtures/complexity-source/**/*.js"], exclude: [] },
    complexity: { maxDepth: 3, maxCyclomaticComplexity: 2, maxFunctionLines: 5 },
  });
  assert.equal(result.heuristicOnly, true);
  assert.equal(result.maxDepthViolations, 1);
  assert.ok(result.complexityViolations >= 1);
  assert.ok(result.longFunctionViolations >= 1);
});

test("file metrics collector can measure configured file sets", () => {
  const sampleDir = path.join(process.cwd(), "reports", "test-fixtures", "file-metrics");
  fs.mkdirSync(sampleDir, { recursive: true });
  const sample = path.join(sampleDir, "sample.js");
  const oversized = path.join(sampleDir, "oversized.js");
  fs.writeFileSync(sample, "one\ntwo\nthree\n", "utf8");
  fs.writeFileSync(oversized, Array.from({ length: 25 }, (_, i) => `line ${i}`).join("\n"), "utf8");

  const result = collectFileMetrics({
    files: {
      include: ["reports/test-fixtures/file-metrics/**/*.js"],
      exclude: [],
      warnLines: 2,
      maxLinesNewFile: 10,
      maxLinesExistingFile: 20,
    },
  });

  assert.equal(result.available, true);
  assert.equal(result.fileLineCounts["reports/test-fixtures/file-metrics/sample.js"], 4);
  assert.equal(result.nearLimitFiles.length, 1);
  assert.equal(result.oversizedFiles.length, 1);
  assert.equal(result.maxLines, 25);
});
