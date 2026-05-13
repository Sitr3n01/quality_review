// Render the machine-facing Markdown contract: .quality-gate/QUALITY_GATE.md.
//
// This file must be:
//   - Markdown only (no HTML)
//   - Stable, parseable, deterministic
//   - Free of decorative prose and emoji
//   - Free of human-only opinions
//
// Statuses are limited to: PASS | FAIL | WARN | SKIPPED.
// Risk values are limited to: low | medium | high | unknown.
// Blocking values are limited to: true | false.

const {
  gateStatusLabel,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
} = require("./report-status");
const {
  CHECK_DEFINITIONS,
  buildChecks,
  checkIdForType,
  deriveCheckStatus,
  evidenceForCheck,
} = require("./check-registry");
const {
  classifyFileCategory,
  classifyFileRisk,
} = require("./file-risk");
const { buildCoverageRows } = require("./render-coverage-metrics");

const SCHEMA_VERSION = "qg-md-1";

function metricStatus(current, baseline, comparator, threshold) {
  if (current === null || current === undefined) return STATUS_SKIPPED;
  if (comparator === ">=") return current + 1e-9 >= threshold ? STATUS_PASS : STATUS_WARN;
  if (comparator === "<=") return current - 1e-9 <= threshold ? STATUS_PASS : STATUS_WARN;
  return STATUS_SKIPPED;
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined) return "n/a";
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return `${n.toFixed(digits)}%`;
}

function escapeCell(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function buildHeader(meta) {
  return [
    "# Quality Gate Machine Report",
    "",
    `SCHEMA_VERSION: ${SCHEMA_VERSION}`,
    `GATE_STATUS: ${meta.gateStatus}`,
    `GENERATED_AT: ${meta.generatedAt}`,
    `COMMIT_SHA: ${meta.commitSha || "unknown"}`,
    `BRANCH: ${meta.branch || "unknown"}`,
    `PR_NUMBER: ${meta.prNumber || "none"}`,
    "",
  ].join("\n");
}

function buildSummaryTable(meta, checks) {
  const total = checks.length;
  const passed = checks.filter((c) => c.status === STATUS_PASS).length;
  const failed = checks.filter((c) => c.status === STATUS_FAIL).length;
  const skipped = checks.filter((c) => c.status === STATUS_SKIPPED).length;
  return [
    "## Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Gate Status | ${meta.gateStatus} |`,
    `| Blocking Failures | ${meta.blocking} |`,
    `| Warnings | ${meta.warnings} |`,
    `| Checks Total | ${total} |`,
    `| Checks Passed | ${passed} |`,
    `| Checks Failed | ${failed} |`,
    `| Checks Skipped | ${skipped} |`,
    "",
  ].join("\n");
}

function buildChecksTable(checks) {
  const rows = checks.map(
    (c) =>
      `| ${c.id} | ${escapeCell(c.name)} | ${c.status} | ${c.blocking ? "true" : "false"} | ${escapeCell(c.evidence)} |`,
  );
  return [
    "## Checks",
    "",
    "| Check ID | Name | Status | Blocking | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function buildBlockingTable(report, checks) {
  const regressions = report.regressions || [];
  const lines = ["## Blocking Failures", ""];
  if (regressions.length === 0) {
    lines.push("| Check ID | Reason | Evidence |");
    lines.push("| --- | --- | --- |");
    lines.push("| - | No blocking failures. | - |");
    lines.push("");
    return lines.join("\n");
  }
  lines.push("| Check ID | Reason | Evidence |");
  lines.push("| --- | --- | --- |");
  for (const r of regressions) {
    const checkId = checkIdForType(r.type);
    const reason = escapeCell(r.message || r.type);
    const evidence = escapeCell(evidenceForCheck(checkId, checks));
    lines.push(`| ${checkId} | ${reason} | ${evidence} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function buildWarningsTable(report, checks) {
  const warnings = report.warnings || [];
  const lines = ["## Warnings", ""];
  if (warnings.length === 0) {
    lines.push("| Check ID | Reason | Evidence |");
    lines.push("| --- | --- | --- |");
    lines.push("| - | No warnings. | - |");
    lines.push("");
    return lines.join("\n");
  }
  lines.push("| Check ID | Reason | Evidence |");
  lines.push("| --- | --- | --- |");
  for (const w of warnings) {
    const checkId = checkIdForType(w.type);
    const reason = escapeCell(w.message || w.type);
    const evidence = escapeCell(evidenceForCheck(checkId, checks));
    lines.push(`| ${checkId} | ${reason} | ${evidence} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function duplicationRow(report, duplicationCap) {
  const duplication = (report.current || {}).duplication || {};
  if (duplication.percentage === undefined || duplication.percentage === null) return null;
  const dupCurrent = Number(duplication.percentage);
  const dupPrev = ((report.baseline || {}).duplication || {}).percentage;
  const threshold =
    typeof duplicationCap === "number" ? `<= ${formatNumber(duplicationCap)}%` : "n/a";
  const status =
    typeof duplicationCap !== "number"
      ? STATUS_SKIPPED
      : metricStatus(dupCurrent, dupPrev, "<=", duplicationCap);
  return `| duplication_percentage | ${formatPercent(dupCurrent)} | ${formatPercent(dupPrev !== undefined ? dupPrev : null)} | ${threshold} | ${status} |`;
}

function eslintErrorsStatus(currentErrors, baselineErrors) {
  if (baselineErrors === undefined || baselineErrors === null) return STATUS_SKIPPED;
  return currentErrors > baselineErrors ? STATUS_FAIL : STATUS_PASS;
}

function eslintErrorsRow(report) {
  const eslint = (report.current || {}).eslint || {};
  if (eslint.available === false || eslint.errors === null || eslint.errors === undefined) {
    return null;
  }
  const baselineErrors = ((report.baseline || {}).eslint || {}).errors;
  const status = eslintErrorsStatus(eslint.errors, baselineErrors);
  const prev = baselineErrors === undefined ? "n/a" : baselineErrors;
  return `| eslint_errors | ${eslint.errors} | ${prev} | <= baseline (ratchet) | ${status} |`;
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function buildMetricsTable(report, config) {
  const rows = buildCoverageRows(report, config);
  const duplicationCap = safeObject(safeObject(config).duplication).maxPercentage;
  const dupRow = duplicationRow(report, duplicationCap);
  if (dupRow) rows.push(dupRow);
  const lintRow = eslintErrorsRow(report);
  if (lintRow) rows.push(lintRow);
  return [
    "## Metrics",
    "",
    "| Metric | Current | Previous | Threshold | Status |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function buildChangedFilesTable(report) {
  const filesData = (report.current || {}).files || {};
  const files = Array.isArray(filesData.changedFiles) ? filesData.changedFiles.slice(0, 50) : [];
  const lines = ["## Changed Files", ""];
  if (files.length === 0) {
    lines.push("| File | Category | Risk |");
    lines.push("| --- | --- | --- |");
    lines.push("| - | unknown | unknown |");
    lines.push("");
    return lines.join("\n");
  }
  lines.push("| File | Category | Risk |");
  lines.push("| --- | --- | --- |");
  for (const f of files) {
    lines.push(`| ${escapeCell(f)} | ${classifyFileCategory(f)} | ${classifyFileRisk(f)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function buildFinalDecision(meta) {
  return [
    "## Final Decision",
    "",
    `GATE_STATUS: ${meta.gateStatus}`,
    "DECISION_SOURCE: deterministic-checks",
    "AI_OVERRIDE_ALLOWED: false",
    "",
  ].join("\n");
}

function buildMeta(report, options) {
  const summary = report.summary || {};
  return {
    gateStatus: gateStatusLabel(report.status),
    generatedAt: report.generatedAt || new Date().toISOString(),
    commitSha: options.commitSha || "unknown",
    branch: options.branch || "unknown",
    prNumber: options.prNumber || "none",
    blocking: summary.blocking || 0,
    warnings: summary.warnings || 0,
  };
}

function renderMachineMarkdown(report, options = {}) {
  const config = options.config || {};
  const checks = buildChecks(report);
  const meta = buildMeta(report, options);
  return [
    buildHeader(meta),
    buildSummaryTable(meta, checks),
    buildChecksTable(checks),
    buildBlockingTable(report, checks),
    buildWarningsTable(report, checks),
    buildMetricsTable(report, config),
    buildChangedFilesTable(report),
    buildFinalDecision(meta),
  ].join("\n");
}

module.exports = {
  renderMachineMarkdown,
  gateStatusLabel,
  deriveCheckStatus,
  classifyFileCategory,
  classifyFileRisk,
  CHECK_DEFINITIONS,
  SCHEMA_VERSION,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
};
