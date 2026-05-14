#!/usr/bin/env node
// Local preflight runner for agents and humans before pushing to GitHub.
//
// Unlike the AI explainer context, this command enforces readiness: it keeps
// running every producer so the user can see all progress, then exits 1 if any
// required producer or the final deterministic gate failed.

const path = require("path");
const fs = require("fs");
const { runCommandSafe, ensureDir, readJson, REPO_ROOT } = require("./utils");
const {
  tail,
  buildEntry,
  appendNdjson,
  resetNdjson,
} = require("./run-explainer-context");

const OUTPUT_DIR = path.join(REPO_ROOT, "reports", "preflight");
const NDJSON_PATH = path.join(OUTPUT_DIR, "commands.ndjson");
const SUMMARY_JSON_PATH = path.join(OUTPUT_DIR, "commands.json");
const SUMMARY_MD_PATH = path.join(OUTPUT_DIR, "summary.md");
const QUALITY_REPORT_PATH = path.join(REPO_ROOT, "reports", "quality-gate.json");

const IS_WINDOWS = process.platform === "win32";
const NPM_BIN = IS_WINDOWS ? "npm.cmd" : "npm";
const NPX_BIN = IS_WINDOWS ? "npx.cmd" : "npx";

function buildPreflightSteps(npmBin = NPM_BIN, npxBin = NPX_BIN) {
  return [
    {
      name: "quality:validate",
      label: "validate",
      bin: npmBin,
      args: ["run", "quality:validate"],
      required: true,
    },
    {
      name: "audit:report",
      label: "audit",
      bin: npmBin,
      args: ["run", "audit:report"],
      required: true,
    },
    {
      name: "eslint:json",
      label: "eslint json",
      bin: npxBin,
      args: [
        "--no-install",
        "eslint",
        ".",
        "--format",
        "json",
        "--output-file",
        "reports/eslint/eslint.json",
      ],
      required: false,
    },
    {
      name: "lint",
      label: "lint",
      bin: npmBin,
      args: ["run", "lint", "--if-present"],
      required: true,
    },
    {
      name: "test:coverage:ci",
      label: "coverage",
      bin: npmBin,
      args: ["run", "test:coverage:ci", "--if-present"],
      required: true,
    },
    {
      name: "duplication:ci",
      label: "duplication",
      bin: npmBin,
      args: ["run", "duplication:ci", "--if-present"],
      required: true,
    },
    {
      name: "complexity:ci",
      label: "complexity",
      bin: npmBin,
      args: ["run", "complexity:ci", "--if-present"],
      required: true,
    },
    {
      name: "quality:check",
      label: "gate",
      bin: npmBin,
      args: ["run", "quality:check"],
      required: true,
    },
  ];
}

function commandText(step) {
  return [step.bin, ...step.args].join(" ");
}

function runPreflightStep(records, step, index, total, options = {}) {
  const start = Date.now();
  const display = commandText(step);
  const shouldPrint = options.print !== false;
  if (shouldPrint) {
    process.stdout.write(`[${index}/${total}] ${step.label}: ${display}\n`);
  }

  const spawnOptions = IS_WINDOWS && step.bin.endsWith(".cmd") ? { shell: true } : {};
  const result = options.runner
    ? options.runner(step.bin, step.args, step)
    : runCommandSafe(step.bin, step.args, spawnOptions);
  const entry = {
    ...buildEntry(step.name, step.bin, step.args, result, Date.now() - start),
    label: step.label,
    required: step.required,
  };

  records.push(entry);
  appendNdjson(entry, options.ndjsonPath || NDJSON_PATH);

  if (shouldPrint && !entry.ok) {
    const kind = step.required ? "required" : "advisory";
    process.stdout.write(
      `[${index}/${total}] ${step.label} failed (${kind}, exitCode=${entry.exitCode}; continuing)\n`,
    );
  }

  return entry;
}

function runPreflightSteps(records, steps, options = {}) {
  steps.forEach((step, index) => {
    runPreflightStep(records, step, index + 1, steps.length, options);
  });
  return records;
}

function extractGateWarnings(report) {
  if (!report || !Array.isArray(report.warnings)) return [];
  return report.warnings.map((warning) => ({
    type: warning.type || "warning",
    message: warning.message || warning.type || "Quality gate warning.",
  }));
}

function buildPreflightSummary(records, report) {
  const blockingFailures = records
    .filter((entry) => entry.required && !entry.ok)
    .map((entry) => ({
      name: entry.name,
      exitCode: entry.exitCode,
      message: `${entry.name} failed with exitCode=${entry.exitCode}.`,
    }));
  const technicalWarnings = records
    .filter((entry) => !entry.required && !entry.ok)
    .map((entry) => ({
      name: entry.name,
      exitCode: entry.exitCode,
      message: `${entry.name} failed but is advisory for local preflight readiness.`,
    }));
  const gateWarnings = extractGateWarnings(report);
  const reportAvailable = Boolean(report && typeof report === "object");
  const gateStatus = reportAvailable ? report.status || "unknown" : "missing-report";

  if (!reportAvailable) {
    blockingFailures.push({
      name: "quality-gate-report",
      exitCode: -1,
      message: "reports/quality-gate.json was not available after quality:check.",
    });
  } else if (gateStatus === "failed" && !blockingFailures.some((failure) => failure.name === "quality:check")) {
    blockingFailures.push({
      name: "quality:check",
      exitCode: 1,
      message: "Quality gate report status is failed.",
    });
  }

  const readyForGithub = blockingFailures.length === 0;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    readyForGithub,
    verdict: readyForGithub ? "ready" : "not-ready",
    gateStatus,
    totals: {
      count: records.length,
      ok: records.filter((entry) => entry.ok).length,
      failed: records.filter((entry) => !entry.ok).length,
      requiredFailed: records.filter((entry) => entry.required && !entry.ok).length,
      advisoryFailed: records.filter((entry) => !entry.required && !entry.ok).length,
      gateWarnings: gateWarnings.length,
    },
    blockingFailures,
    technicalWarnings,
    gateWarnings,
    commands: records.map((entry) => ({
      name: entry.name,
      label: entry.label,
      command: entry.command,
      required: entry.required,
      exitCode: entry.exitCode,
      ok: entry.ok,
      durationMs: entry.durationMs,
      stdoutTail: tail(entry.stdoutTail || ""),
      stderrTail: tail(entry.stderrTail || ""),
    })),
  };
}

function commandRow(command) {
  const required = command.required ? "yes" : "no";
  const result = command.ok ? "passed" : "failed";
  return `| ${command.name} | ${required} | ${result} | ${command.exitCode} |`;
}

function messageSection(title, findings) {
  const body = findings.length === 0
    ? ["- None"]
    : findings.map((finding) => `- ${finding.message}`);
  return ["", `## ${title}`, "", ...body];
}

function renderSummaryMarkdown(summary) {
  const header = [
    "# Local Quality Preflight",
    "",
    `READY_FOR_GITHUB=${summary.readyForGithub ? "true" : "false"}`,
    `Verdict: ${summary.readyForGithub ? "Pronto para GitHub" : "Nao pronto"}`,
    `Gate status: ${summary.gateStatus}`,
    "",
    "## Commands",
    "",
    "| Step | Required | Result | Exit |",
    "|---|---:|---|---:|",
  ];
  const lines = [
    ...header,
    ...summary.commands.map(commandRow),
    ...messageSection("Blocking failures", summary.blockingFailures),
    ...messageSection("Technical warnings", summary.technicalWarnings),
    ...messageSection("Gate warnings", summary.gateWarnings),
  ];
  return `${lines.join("\n")}\n`;
}

function writePreflightSummary(summary, options = {}) {
  const summaryJsonPath = options.summaryJsonPath || SUMMARY_JSON_PATH;
  const summaryMdPath = options.summaryMdPath || SUMMARY_MD_PATH;
  ensureDir(path.dirname(summaryJsonPath));
  fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  fs.writeFileSync(summaryMdPath, renderSummaryMarkdown(summary), "utf8");
}

function printFinalSummary(summary, paths = {}) {
  const summaryJsonPath = paths.summaryJsonPath || SUMMARY_JSON_PATH;
  const summaryMdPath = paths.summaryMdPath || SUMMARY_MD_PATH;
  process.stdout.write("\n");
  process.stdout.write(`READY_FOR_GITHUB=${summary.readyForGithub ? "true" : "false"}\n`);
  process.stdout.write(
    `Preflight: ${summary.readyForGithub ? "Pronto para GitHub" : "Nao pronto"}\n`,
  );
  process.stdout.write(
    `Commands: ${summary.totals.ok}/${summary.totals.count} ok, ${summary.totals.requiredFailed} required failed, ${summary.totals.advisoryFailed} advisory failed\n`,
  );
  if (summary.gateWarnings.length > 0) {
    process.stdout.write(`Gate warnings: ${summary.gateWarnings.length} (visible, not blocking)\n`);
  }
  process.stdout.write(
    `Reports: ${path.relative(REPO_ROOT, summaryJsonPath)}, ${path.relative(REPO_ROOT, summaryMdPath)}\n`,
  );
}

function resolvePreflightPaths(options = {}) {
  const outputDir = options.outputDir || OUTPUT_DIR;
  return {
    outputDir,
    ndjsonPath: options.ndjsonPath || path.join(outputDir, "commands.ndjson"),
    summaryJsonPath: options.summaryJsonPath || path.join(outputDir, "commands.json"),
    summaryMdPath: options.summaryMdPath || path.join(outputDir, "summary.md"),
    qualityReportPath: options.qualityReportPath || QUALITY_REPORT_PATH,
  };
}

function preparePreflightOutput(paths) {
  ensureDir(paths.outputDir);
  ensureDir(path.join(REPO_ROOT, "reports", "eslint"));
  resetNdjson(paths.ndjsonPath);
}

function loadPreflightReport(options, qualityReportPath) {
  if (Object.prototype.hasOwnProperty.call(options, "qualityReport")) {
    return options.qualityReport;
  }
  return readJson(qualityReportPath, null);
}

function runLocalPreflight(options = {}) {
  const paths = resolvePreflightPaths(options);
  preparePreflightOutput(paths);

  const records = [];
  runPreflightSteps(records, options.steps || buildPreflightSteps(), {
    ...options,
    ndjsonPath: paths.ndjsonPath,
  });

  const report = loadPreflightReport(options, paths.qualityReportPath);
  const summary = buildPreflightSummary(records, report);
  writePreflightSummary(summary, paths);

  if (options.print !== false) {
    printFinalSummary(summary, paths);
  }

  return {
    records,
    summary,
    exitCode: summary.readyForGithub ? 0 : 1,
  };
}

function main() {
  const result = runLocalPreflight();
  process.exit(result.exitCode);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `[preflight] unexpected runner failure: ${err && err.stack ? err.stack : err}\n`,
    );
    process.exit(1);
  }
}

module.exports = {
  buildPreflightSteps,
  runPreflightStep,
  runPreflightSteps,
  buildPreflightSummary,
  renderSummaryMarkdown,
  writePreflightSummary,
  runLocalPreflight,
};
