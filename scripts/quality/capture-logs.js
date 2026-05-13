// Synthesize per-check log files for the hybrid report.
//
// The deterministic gate already runs each tool and stores its output in
// reports/. The hybrid layer needs human-friendly log files at
// .quality-gate/logs/* that each pin one check to its evidence.
//
// We do NOT re-run tools here. We extract a concise text view from the
// existing JSON outputs and the in-memory report. This keeps logs honest
// (no fabrication) and avoids duplicating work.
//
// Secrets are out-of-scope here because the inputs (npm audit metadata,
// ESLint AST counts, c8 summary, jscpd report) do not contain secrets by
// design. If a host project pipes raw stdout into these files, it should
// implement its own redaction step.

const path = require("path");
const {
  REPO_ROOT,
  readJson,
  ensureDir,
  writeText,
  fileExists,
} = require("./utils");
const { CHECK_DEFINITIONS, checkLogFile } = require("./check-registry");

const COVERAGE_SUMMARY = path.join(REPO_ROOT, "coverage", "coverage-summary.json");
const AUDIT_REPORT = path.join(REPO_ROOT, "reports", "audit", "npm-audit.json");
const ESLINT_REPORT = path.join(REPO_ROOT, "reports", "eslint", "eslint.json");
const DUPLICATION_REPORT = path.join(REPO_ROOT, "reports", "duplication", "jscpd-report.json");
const COMPLEXITY_REPORT = path.join(REPO_ROOT, "reports", "complexity", "eslint-complexity.json");

function lineSeparator() {
  return "-".repeat(60);
}

function notes(...lines) {
  return lines.filter(Boolean).join("\n");
}

function captureBuildLog() {
  return notes(
    "Check: build",
    "Status: SKIPPED",
    "Reason: This template runs no build step. The host project owns build.",
    "",
    "If you add a build to your project, route its stdout/stderr here.",
  );
}

function captureTypecheckLog() {
  return notes(
    "Check: typecheck",
    "Status: SKIPPED",
    "Reason: No tsc/mypy task is configured in this template.",
    "",
    "If you add a type checker, route its stdout/stderr here.",
  );
}

function captureTestsLog(report) {
  const coverage = (report.current || {}).coverage || {};
  const metrics = coverage.metrics || {};
  const baselineCoverage = (report.baseline || {}).coverage || {};
  const available = coverage.available !== false;
  const lines = ["Check: tests"];
  if (!available) {
    lines.push("Status: SKIPPED");
    lines.push("Reason: No coverage summary was available; tests may not have run.");
    return lines.join("\n");
  }
  lines.push("Status: see coverage thresholds below");
  lines.push("");
  lines.push("Coverage summary (from coverage/coverage-summary.json if present):");
  for (const metric of ["lines", "statements", "functions", "branches"]) {
    const current = metrics[metric];
    const baseline = baselineCoverage[metric];
    const cur = typeof current === "number" ? current.toFixed(2) : "n/a";
    const base = typeof baseline === "number" ? baseline.toFixed(2) : "n/a";
    lines.push(`  ${metric.padEnd(11)} current=${cur}% baseline=${base}%`);
  }
  lines.push("");
  lines.push(`Raw evidence: ${path.relative(REPO_ROOT, COVERAGE_SUMMARY).replace(/\\/g, "/")}`);
  return lines.join("\n");
}

function appendTopLintFiles(lines, topFiles) {
  if (!topFiles || topFiles.length === 0) return;
  lines.push("");
  lines.push("Top files with violations:");
  for (const t of topFiles.slice(0, 10)) {
    lines.push(`  ${t.file || t.path || "?"}: ${t.errors || 0} errors, ${t.warnings || 0} warnings`);
  }
}

function captureLintLog(report) {
  const eslint = (report.current || {}).eslint || {};
  const baselineLint = (report.baseline || {}).eslint || {};
  const lines = ["Check: lint"];
  if (eslint.available === false) {
    lines.push("Status: SKIPPED");
    lines.push("Reason: No ESLint JSON report was found.");
    return lines.join("\n");
  }
  lines.push(`Errors:   current=${eslint.errors} baseline=${baselineLint.errors ?? "n/a"}`);
  lines.push(`Warnings: current=${eslint.warnings} baseline=${baselineLint.warnings ?? "n/a"}`);
  appendTopLintFiles(lines, eslint.topFiles);
  lines.push("");
  lines.push(`Raw evidence: ${path.relative(REPO_ROOT, ESLINT_REPORT).replace(/\\/g, "/")}`);
  return lines.join("\n");
}

function appendVulnerabilityPackages(lines) {
  const auditJson = readJson(AUDIT_REPORT, null);
  if (!auditJson || !auditJson.vulnerabilities) return;
  const ids = Object.keys(auditJson.vulnerabilities).slice(0, 10);
  if (ids.length === 0) return;
  lines.push("");
  lines.push("Top affected packages:");
  for (const id of ids) {
    const v = auditJson.vulnerabilities[id] || {};
    lines.push(`  ${id} severity=${v.severity || "?"}`);
  }
}

function captureSecurityLog(report) {
  const audit = (report.current || {}).audit || {};
  const counts = audit.counts || {};
  const lines = ["Check: security"];
  if (audit.available === false) {
    lines.push("Status: SKIPPED");
    lines.push("Reason: No npm audit JSON report was found.");
    return lines.join("\n");
  }
  lines.push("Vulnerability counts (from npm audit JSON):");
  for (const level of ["critical", "high", "moderate", "low", "info"]) {
    lines.push(`  ${level.padEnd(9)} ${counts[level] || 0}`);
  }
  appendVulnerabilityPackages(lines);
  lines.push("");
  lines.push(`Raw evidence: ${path.relative(REPO_ROOT, AUDIT_REPORT).replace(/\\/g, "/")}`);
  return lines.join("\n");
}

function captureCoverageLog(report) {
  // Tests and coverage share the same underlying summary, but coverage gets
  // its own log so blocking-failure rows can point to it directly.
  return captureTestsLog(report).replace("Check: tests", "Check: coverage");
}

function captureDuplicationLog(report) {
  const dup = (report.current || {}).duplication || {};
  const lines = ["Check: duplication"];
  if (dup.available === false) {
    lines.push("Status: SKIPPED");
    lines.push("Reason: No JSCPD JSON report was found.");
    return lines.join("\n");
  }
  lines.push(`Percentage:      ${dup.percentage ?? "n/a"}%`);
  lines.push(`Fragments:       ${dup.fragments ?? "n/a"}`);
  lines.push(`Duplicated lines: ${dup.duplicatedLines ?? "n/a"}`);
  lines.push("");
  lines.push(`Raw evidence: ${path.relative(REPO_ROOT, DUPLICATION_REPORT).replace(/\\/g, "/")}`);
  return lines.join("\n");
}

function appendOversizedFiles(lines, oversized) {
  if (!oversized || oversized.length === 0) return;
  lines.push("");
  lines.push("Oversized files:");
  for (const f of oversized.slice(0, 10)) {
    lines.push(`  ${f.file}: ${f.lines} lines (limit ${f.limit})`);
  }
}

function appendChangedFiles(lines, changed) {
  if (!changed || changed.length === 0) return;
  lines.push("");
  lines.push(`Changed files (${changed.length}):`);
  for (const f of changed.slice(0, 20)) lines.push(`  ${f}`);
  if (changed.length > 20) lines.push(`  ...and ${changed.length - 20} more.`);
}

function captureFilesLog(report) {
  const files = (report.current || {}).files || {};
  const lines = ["Check: files"];
  if (files.available === false) {
    lines.push("Status: SKIPPED");
    lines.push("Reason: File metrics collector was unavailable.");
    return lines.join("\n");
  }
  lines.push(`Total files: ${files.totalFiles ?? "n/a"}`);
  lines.push(`Largest file: ${files.maxLines ?? "n/a"} lines`);
  appendOversizedFiles(lines, files.oversizedFiles);
  appendChangedFiles(lines, files.changedFiles);
  return lines.join("\n");
}

function captureComplexityLog(report) {
  const complexity = (report.current || {}).complexity || {};
  const lines = ["Check: complexity"];
  lines.push(`Max-depth violations:    ${complexity.maxDepthViolations ?? 0}`);
  lines.push(`Cyclomatic violations:   ${complexity.complexityViolations ?? 0}`);
  lines.push(`Long-function violations: ${complexity.longFunctionViolations ?? 0}`);
  if (complexity.heuristicOnly) {
    lines.push("");
    lines.push("Note: Complexity ran in heuristic mode (no ESLint AST report available).");
  }
  if (fileExists(COMPLEXITY_REPORT)) {
    lines.push("");
    lines.push(`Raw evidence: ${path.relative(REPO_ROOT, COMPLEXITY_REPORT).replace(/\\/g, "/")}`);
  }
  return lines.join("\n");
}

function appendTopRegressions(lines, regressions) {
  if (!regressions || regressions.length === 0) return;
  lines.push("");
  lines.push("Top blocking regressions:");
  for (const r of regressions.slice(0, 5)) {
    lines.push(`  - [${r.type}] ${r.message || ""}`);
  }
}

function captureGateLog(report) {
  const status = (report.status || "unknown").toUpperCase();
  const summary = report.summary || {};
  const generatedAt = report.generatedAt || new Date().toISOString();
  const lines = [
    "Check: gate",
    `Status: ${status}`,
    `Generated: ${generatedAt}`,
    "",
    `Blocking: ${summary.blocking || 0}`,
    `Warnings: ${summary.warnings || 0}`,
    `Infos: ${summary.infos || 0}`,
    "",
    "Decision source: deterministic-checks",
    "AI override allowed: false",
  ];
  appendTopRegressions(lines, report.regressions);
  return lines.join("\n");
}

function captureLogs(report, options = {}) {
  const outDir = options.logsDir || path.join(REPO_ROOT, ".quality-gate", "logs");
  ensureDir(outDir);

  const renderers = {
    build: () => captureBuildLog(),
    tests: () => captureTestsLog(report),
    lint: () => captureLintLog(report),
    typecheck: () => captureTypecheckLog(),
    security: () => captureSecurityLog(report),
    coverage: () => captureCoverageLog(report),
    duplication: () => captureDuplicationLog(report),
    files: () => captureFilesLog(report),
    complexity: () => captureComplexityLog(report),
  };

  const files = {};
  for (const check of CHECK_DEFINITIONS) {
    const render = renderers[check.id];
    if (render) files[checkLogFile(check)] = render();
  }
  files["gate.log"] = captureGateLog(report);

  const written = [];
  for (const [name, body] of Object.entries(files)) {
    const filePath = path.join(outDir, name);
    const wrapped = [body, "", lineSeparator(), "Generated by capture-logs.js — derived from reports/*.json"].join("\n");
    writeText(filePath, wrapped + "\n");
    written.push(filePath);
  }
  return written;
}

module.exports = {
  captureLogs,
  captureBuildLog,
  captureTestsLog,
  captureLintLog,
  captureSecurityLog,
  captureCoverageLog,
  captureDuplicationLog,
  captureFilesLog,
  captureComplexityLog,
  captureGateLog,
  captureTypecheckLog,
};
