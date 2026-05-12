const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  collectAll,
  loadBaseline,
  loadConfig,
  runReport,
} = require("../../scripts/quality/quality-gate");
const { buildComment, MARKER } = require("../../scripts/quality/render-pr-comment");
const { auditFallback } = require("../../scripts/quality/run-audit-report");
const { runAuditReport } = require("../../scripts/quality/run-audit-report");
const { runComplexityReport } = require("../../scripts/quality/run-complexity-report");

test("loadConfig and loadBaseline return versioned objects", () => {
  assert.equal(loadConfig().projectType, "auto");
  assert.equal(loadBaseline().schemaVersion, 1);
});

test("collectAll aggregates every quality section", () => {
  const current = collectAll({
    coverage: { coverageSummaryPaths: ["missing/coverage.json"] },
    audit: { npmAuditJsonPath: "missing/audit.json" },
    lint: { eslintJsonPath: "missing/eslint.json" },
    duplication: { jscpdJsonPaths: ["missing/jscpd.json"] },
    files: { include: ["scripts/quality/render-pr-comment.js"], exclude: [], warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
    complexity: { enabled: false },
  });
  for (const key of ["coverage", "audit", "eslint", "duplication", "files", "complexity"]) {
    assert.ok(key in current);
  }
});

test("runReport writes JSON, Markdown, and optional PR comment", () => {
  const report = runReport(
    {
      coverage: { enabled: false },
      audit: { enabled: false },
      lint: { enabled: false },
      duplication: { enabled: false },
      files: { enabled: false },
      complexity: { enabled: false },
    },
    { mode: "report", writePrComment: true },
  );
  assert.equal(report.status, "passed");
  assert.ok(fs.existsSync(path.join(process.cwd(), "reports", "quality-gate.json")));
  assert.ok(fs.existsSync(path.join(process.cwd(), "reports", "quality-gate.md")));
  assert.ok(fs.readFileSync(path.join(process.cwd(), "reports", "pr-comment.md"), "utf8").startsWith(MARKER));
});

test("buildComment is idempotent and auditFallback preserves error details", () => {
  assert.equal(buildComment(`${MARKER}\n\nbody`), `${MARKER}\n\nbody`);
  assert.equal(buildComment("body"), `${MARKER}\n\nbody`);

  const fallback = auditFallback({ status: 1, stderr: "audit failed", stdout: "" });
  assert.equal(fallback.metadata.vulnerabilities.critical, 0);
  assert.equal(fallback.error.status, 1);
});

test("audit and complexity report runners write deterministic report files", () => {
  const audit = runAuditReport();
  assert.equal(audit.ok, true);
  assert.ok(fs.existsSync(audit.path));

  const complexity = runComplexityReport();
  assert.equal(complexity.ok, true, complexity.result.stderr || complexity.result.stdout);
  assert.ok(fs.existsSync(complexity.path));
});
