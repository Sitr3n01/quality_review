#!/usr/bin/env node
// Quality Gate — entry point.
//
// Usage:
//   node scripts/quality/quality-gate.js report
//   node scripts/quality/quality-gate.js check
//   node scripts/quality/quality-gate.js baseline
//
// See quality/README.md for policy and quality/quality-gate.config.cjs for thresholds.

const path = require("path");
const {
  REPO_ROOT,
  readJson,
  writeJson,
  writeText,
  fileExists,
  detectStack,
  getCurrentBranch,
  isMainLikeBranch,
} = require("./utils");
const { collectCoverage } = require("./collect-coverage");
const { collectAudit } = require("./collect-audit");
const { collectEslint } = require("./collect-eslint");
const { collectDuplication } = require("./collect-duplication");
const { collectFileMetrics } = require("./collect-file-metrics");
const { collectComplexity } = require("./collect-complexity");
const { compareBaseline } = require("./compare-baseline");
const { renderMarkdown } = require("./render-markdown");
const { buildBaseline } = require("./update-baseline");
const { buildComment } = require("./render-pr-comment");

const CONFIG_PATH = path.join(REPO_ROOT, "quality", "quality-gate.config.cjs");
const BASELINE_PATH = path.join(REPO_ROOT, "quality", "baseline.json");
const REPORT_JSON = path.join(REPO_ROOT, "reports", "quality-gate.json");
const REPORT_MD = path.join(REPO_ROOT, "reports", "quality-gate.md");
const PR_COMMENT = path.join(REPO_ROOT, "reports", "pr-comment.md");

function loadConfig() {
  if (!fileExists(CONFIG_PATH)) {
    console.error(`quality-gate: config file not found at ${CONFIG_PATH}.`);
    console.error("Run the quality-gate skill installer or create the file manually.");
    process.exit(1);
  }
  try {
    return require(CONFIG_PATH);
  } catch (err) {
    console.error(`quality-gate: failed to load config: ${err.message}`);
    process.exit(1);
  }
}

function loadBaseline() {
  return readJson(BASELINE_PATH, {
    schemaVersion: 1,
    generatedAt: null,
    source: "missing-baseline-file",
    coverage: { lines: null, statements: null, functions: null, branches: null },
    audit: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    duplication: { percentage: null, fragments: null, duplicatedLines: null },
    eslint: { errors: null, warnings: null, ruleViolations: {} },
    files: { oversizedFiles: [], maxLines: null, fileLineCounts: {} },
    complexity: { maxDepthViolations: null, complexityViolations: null, longFunctionViolations: null },
  });
}

function collectAll(config) {
  const isEnabled = (section) => !config[section] || config[section].enabled !== false;
  return {
    coverage: isEnabled("coverage") ? collectCoverage(config) : { available: false, metrics: null, warnings: [] },
    audit: isEnabled("audit")
      ? collectAudit(config)
      : { available: false, counts: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, warnings: [] },
    eslint: isEnabled("lint")
      ? collectEslint(config)
      : { available: false, errors: null, warnings: null, ruleViolations: {}, topFiles: [], warningsList: [] },
    duplication: isEnabled("duplication")
      ? collectDuplication(config)
      : { available: false, percentage: null, fragments: null, duplicatedLines: null, warnings: [] },
    files: isEnabled("files")
      ? collectFileMetrics(config)
      : { available: false, totalFiles: 0, warnings: [] },
    complexity: isEnabled("complexity")
      ? collectComplexity(config)
      : { heuristicOnly: false, maxDepthViolations: 0, complexityViolations: 0, longFunctionViolations: 0, details: [], warnings: [] },
  };
}

function printSummary(report) {
  const status = report.status;
  console.log("");
  console.log(`Quality Gate: ${status.toUpperCase()}`);
  console.log(
    `  blocking=${report.summary.blocking} warnings=${report.summary.warnings} infos=${report.summary.infos}`,
  );
  if (report.regressions.length > 0) {
    console.log("");
    console.log("Blocking regressions:");
    for (const r of report.regressions.slice(0, 10)) {
      console.log(`  - ${r.message || r.type}`);
    }
    if (report.regressions.length > 10) {
      console.log(`  ...and ${report.regressions.length - 10} more.`);
    }
  }
  console.log("");
  console.log(`Reports written:`);
  console.log(`  ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`  ${path.relative(REPO_ROOT, REPORT_MD)}`);
}

function writeReports(report, markdown, writePrComment) {
  writeJson(REPORT_JSON, report);
  writeText(REPORT_MD, markdown);
  if (writePrComment) {
    writeText(PR_COMMENT, buildComment(markdown));
  }
}

function runReport(config, opts) {
  const current = collectAll(config);
  const baseline = loadBaseline();
  const comparison = compareBaseline(current, baseline, config);
  const stack = detectStack(REPO_ROOT);
  const report = {
    schemaVersion: 1,
    status: comparison.status,
    generatedAt: new Date().toISOString(),
    mode: opts.mode,
    stack,
    summary: comparison.summary,
    baseline,
    current,
    regressions: comparison.regressions,
    warnings: comparison.warnings,
    infos: comparison.infos,
    recommendations: comparison.recommendations,
    aiReviewContext: comparison.aiReviewContext,
  };
  const markdown = renderMarkdown(report);
  writeReports(report, markdown, opts.writePrComment);
  printSummary(report);
  return report;
}

function runBaseline(config) {
  const current = collectAll(config);
  const branch = getCurrentBranch();
  if (!isMainLikeBranch(branch)) {
    console.warn("");
    console.warn(`!! WARNING: current branch is '${branch || "unknown"}', not main/master/develop.`);
    console.warn("!! Updating the baseline on a feature branch can hide regressions.");
    console.warn("!! Prefer updating the baseline on main after human approval.");
    console.warn("");
  }
  const baseline = buildBaseline(current, {
    source: `quality:baseline from branch ${branch || "unknown"}`,
  });
  writeJson(BASELINE_PATH, baseline);
  console.log(`Baseline written to ${path.relative(REPO_ROOT, BASELINE_PATH)}.`);
  console.log("Commit this file as a deliberate change so it is visible in git history.");
}

function usage() {
  console.log("Usage:");
  console.log("  node scripts/quality/quality-gate.js report");
  console.log("  node scripts/quality/quality-gate.js check");
  console.log("  node scripts/quality/quality-gate.js baseline");
}

function main() {
  const mode = (process.argv[2] || "").toLowerCase();
  if (!mode || mode === "-h" || mode === "--help") {
    usage();
    process.exit(0);
  }
  const config = loadConfig();

  if (mode === "report") {
    runReport(config, { mode: "report", writePrComment: true });
    process.exit(0);
  }

  if (mode === "check") {
    const report = runReport(config, { mode: "check", writePrComment: true });
    process.exit(report.status === "failed" ? 1 : 0);
  }

  if (mode === "baseline") {
    runBaseline(config);
    process.exit(0);
  }

  console.error(`Unknown mode: ${mode}`);
  usage();
  process.exit(2);
}

if (require.main === module) {
  main();
}

module.exports = {
  loadConfig,
  loadBaseline,
  collectAll,
  runReport,
  runBaseline,
};
