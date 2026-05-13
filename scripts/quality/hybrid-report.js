#!/usr/bin/env node
// Hybrid report orchestrator.
//
// Reads the existing reports/quality-gate.json (running the deterministic
// pipeline first if needed) and writes the three artifacts the prompt
// specifies:
//
//   .quality-gate/QUALITY_GATE.md      machine-facing Markdown
//   .quality-gate/HUMAN_SUMMARY.md     default concise human summary
//   .quality-gate/HUMAN_REPORT.html    optional rich HTML (complex/forced)
//   .quality-gate/logs/*.log           per-check evidence
//
// AI is never used here. The classifier is a pure function of the report.
// The pass/fail decision stays where it already lives: in `quality:check`,
// driven by compare-baseline.js.
//
// Exit codes:
//   0  the artifacts were written (gate verdict is informational here)
//   1  the gate verdict is "failed" AND --enforce was passed
//   2  infrastructure error (cannot read the underlying JSON, etc.)

const path = require("path");
const fs = require("fs");
const {
  REPO_ROOT,
  ensureDir,
  writeText,
  readJson,
  getCurrentBranch,
  runCommandSafe,
} = require("./utils");
const { loadConfig, runReport } = require("./quality-gate");
const { renderMachineMarkdown } = require("./render-machine-md");
const { renderHumanSummary } = require("./render-human-summary");
const { renderHumanHtml } = require("./render-human-html");
const { classifyComplexity, shouldEmitHtml } = require("./classify-complexity");
const { captureLogs } = require("./capture-logs");

const DEFAULT_OUT_DIR = path.join(REPO_ROOT, ".quality-gate");
const REPORT_JSON = path.join(REPO_ROOT, "reports", "quality-gate.json");

const HTML_FLAGS = new Set(["--html", "--force-html", "--detailed"]);

function applyFlag(args, token) {
  if (HTML_FLAGS.has(token)) { args.forceHtml = true; return true; }
  if (token === "--enforce") { args.enforce = true; return true; }
  if (token === "--regenerate") { args.regenerate = true; return true; }
  if (token === "-h" || token === "--help") { args.help = true; return true; }
  if (token.startsWith("--out=")) {
    args.outDir = path.resolve(REPO_ROOT, token.slice("--out=".length));
    return true;
  }
  if (token.startsWith("--input=")) {
    args.inputPath = path.resolve(REPO_ROOT, token.slice("--input=".length));
    return true;
  }
  return false;
}

function parseArgs(argv) {
  const args = {
    forceHtml: false,
    enforce: false,
    inputPath: REPORT_JSON,
    outDir: DEFAULT_OUT_DIR,
    regenerate: false,
    help: false,
  };
  for (const token of argv) {
    if (!applyFlag(args, token)) {
      console.error(`hybrid-report: unknown argument: ${token}`);
      args.help = true;
    }
  }
  return args;
}

function usage() {
  console.log("Usage:");
  console.log("  node scripts/quality/hybrid-report.js [options]");
  console.log("");
  console.log("Options:");
  console.log("  --html, --force-html, --detailed   Always emit HUMAN_REPORT.html.");
  console.log("  --enforce                          Exit 1 when the gate verdict is failed.");
  console.log("  --regenerate                       Force regeneration of reports/quality-gate.json.");
  console.log("  --out=<dir>                        Override output directory (default .quality-gate).");
  console.log("  --input=<path>                     Override input JSON (default reports/quality-gate.json).");
  console.log("  -h, --help                         Show this help.");
}

function detectCommitSha() {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha;
  const result = runCommandSafe("git", ["rev-parse", "HEAD"]);
  return result.ok ? result.stdout.trim() : null;
}

function detectBranch() {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  return getCurrentBranch();
}

function detectPrNumber() {
  if (process.env.PR_NUMBER) return process.env.PR_NUMBER;
  const ref = process.env.GITHUB_REF || "";
  const match = ref.match(/refs\/pull\/(\d+)\//);
  return match ? match[1] : null;
}

function loadOrGenerateReport(args) {
  if (args.regenerate || !fs.existsSync(args.inputPath)) {
    const config = loadConfig();
    return runReport(config, { mode: "report", writePrComment: false });
  }
  const data = readJson(args.inputPath, null);
  if (!data) {
    throw new Error(
      `hybrid-report: failed to read ${path.relative(REPO_ROOT, args.inputPath)}. ` +
        "Run `npm run quality:report` first, or pass --regenerate.",
    );
  }
  return data;
}

function runHybrid(args) {
  const report = loadOrGenerateReport(args);
  const complexity = classifyComplexity(report, { forceHtml: args.forceHtml });
  const emitHtml = shouldEmitHtml(complexity, { forceHtml: args.forceHtml });

  const commitSha = detectCommitSha();
  const branch = detectBranch();
  const prNumber = detectPrNumber();
  const config = loadConfig();

  const outDir = args.outDir;
  const logsDir = path.join(outDir, "logs");
  ensureDir(outDir);
  ensureDir(logsDir);

  const machineMd = renderMachineMarkdown(report, { config, commitSha, branch, prNumber });
  const humanMd = renderHumanSummary(report, {
    outDir: path.relative(REPO_ROOT, outDir).replace(/\\/g, "/"),
    htmlEmitted: emitHtml,
  });

  const machinePath = path.join(outDir, "QUALITY_GATE.md");
  const humanPath = path.join(outDir, "HUMAN_SUMMARY.md");
  writeText(machinePath, machineMd);
  writeText(humanPath, humanMd);

  let htmlPath = null;
  if (emitHtml) {
    htmlPath = path.join(outDir, "HUMAN_REPORT.html");
    writeText(
      htmlPath,
      renderHumanHtml(report, {
        outDir: path.relative(REPO_ROOT, outDir).replace(/\\/g, "/"),
        commitSha,
        branch,
        prNumber,
      }),
    );
  }

  captureLogs(report, { logsDir });

  const result = {
    status: report.status,
    complexity,
    htmlEmitted: emitHtml,
    artifacts: {
      machine: path.relative(REPO_ROOT, machinePath).replace(/\\/g, "/"),
      human: path.relative(REPO_ROOT, humanPath).replace(/\\/g, "/"),
      html: htmlPath ? path.relative(REPO_ROOT, htmlPath).replace(/\\/g, "/") : null,
      logs: path.relative(REPO_ROOT, logsDir).replace(/\\/g, "/"),
    },
  };

  return result;
}

function printSummary(result) {
  console.log("");
  console.log(`Quality Gate (hybrid): status=${result.status} complexity=${result.complexity}`);
  console.log(`  ${result.artifacts.machine}`);
  console.log(`  ${result.artifacts.human}`);
  if (result.artifacts.html) console.log(`  ${result.artifacts.html}`);
  console.log(`  ${result.artifacts.logs}`);
  console.log("");
  if (!result.htmlEmitted) {
    console.log(
      "HTML report not generated (complexity is below the COMPLEX threshold and --html was not passed).",
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  try {
    const result = runHybrid(args);
    printSummary(result);
    if (args.enforce && result.status === "failed") {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error(`hybrid-report: ${err.message || err}`);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runHybrid,
  loadOrGenerateReport,
};
