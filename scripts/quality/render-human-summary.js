// Render the concise human Markdown summary: .quality-gate/HUMAN_SUMMARY.md.
//
// This file is written for every run. It must be short, specific, and point
// to evidence — not embed it. Do not include AI prose or speculation; the
// gate verdict is deterministic and comes from the underlying report.

const {
  gateStatusLabel,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
} = require("./report-status");
const { CHECK_DEFINITIONS, deriveCheckStatusForCheck } = require("./check-registry");

function plural(n, singular, plural) {
  return n === 1 ? singular : plural;
}

function describePass(infos) {
  if (infos > 0) {
    return `The deterministic quality gate passed. ${infos} positive ${plural(infos, "signal", "signals")} (such as coverage improvements) were recorded.`;
  }
  return "The deterministic quality gate passed. No blocking regressions or warnings were found.";
}

function describeWarn(warnings) {
  return `The deterministic quality gate finished with ${warnings} ${plural(warnings, "warning", "warnings")} and no blocking regressions. The gate does not block on warnings unless the project's policy says otherwise.`;
}

function describeFail(blocking) {
  return `The deterministic quality gate failed. ${blocking} blocking ${plural(blocking, "check", "checks")} did not pass against the committed baseline.`;
}

function describeWhatHappened(report) {
  const status = gateStatusLabel(report.status);
  const summary = (report && report.summary) || {};
  const blocking = summary.blocking || 0;
  const warnings = summary.warnings || 0;
  const infos = summary.infos || 0;
  if (status === STATUS_PASS) return describePass(infos);
  if (status === STATUS_WARN) return describeWarn(warnings);
  if (status === STATUS_FAIL) return describeFail(blocking);
  return "The deterministic quality gate did not produce a verdict in this run.";
}

function renderCheckList(report) {
  return CHECK_DEFINITIONS.map((c) => {
    const status = deriveCheckStatusForCheck(report, c);
    return `- ${c.humanName || c.name}: ${status}`;
  }).join("\n");
}

function renderBlocking(report) {
  const regressions = report.regressions || [];
  if (regressions.length === 0) {
    return "- No blocking issues found.";
  }
  return regressions
    .slice(0, 8)
    .map((r) => `- ${r.message || r.type}`)
    .concat(regressions.length > 8 ? [`- ...and ${regressions.length - 8} more (see machine report).`] : [])
    .join("\n");
}

function renderSuggestedSteps(report) {
  const status = gateStatusLabel(report.status);
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];

  if (status === STATUS_PASS && recommendations.length === 0) {
    return [
      "1. No action required — the gate is green.",
      "2. Continue normal review of the change itself.",
    ].join("\n");
  }
  if (status === STATUS_WARN && recommendations.length === 0) {
    return [
      "1. Skim the warnings in the machine report.",
      "2. Decide whether to address them now or in a follow-up.",
      "3. Proceed with code review.",
    ].join("\n");
  }
  if (recommendations.length === 0) {
    return [
      "1. Read the blocking failures section in the machine report.",
      "2. Reproduce the failing check locally and apply the smallest fix.",
      "3. Re-run `npm run quality:check` and push when it is green.",
    ].join("\n");
  }
  return recommendations
    .slice(0, 5)
    .map((r, idx) => `${idx + 1}. ${r}`)
    .join("\n");
}

function renderHumanSummary(report, options = {}) {
  const status = gateStatusLabel(report.status);
  const outDir = options.outDir || ".quality-gate";
  const machineRel = `${outDir}/QUALITY_GATE.md`;
  const logsRel = `${outDir}/logs/`;
  const htmlRel = `${outDir}/HUMAN_REPORT.html`;
  const includeHtmlPointer = options.htmlEmitted === true;

  const sections = [
    "# Quality Gate Summary",
    "",
    "## Result",
    "",
    `**Status:** ${status}`,
    "",
    "## What happened",
    "",
    describeWhatHappened(report),
    "",
    "## Important checks",
    "",
    renderCheckList(report),
    "",
    "## Blocking issues",
    "",
    renderBlocking(report),
    "",
    "## Suggested next steps",
    "",
    renderSuggestedSteps(report),
    "",
    "## Evidence",
    "",
    `- Machine report: \`${machineRel}\``,
    `- Logs: \`${logsRel}\``,
  ];

  if (includeHtmlPointer) {
    sections.push(`- Detailed HTML report: \`${htmlRel}\``);
  }

  sections.push("");
  return sections.join("\n");
}

module.exports = {
  renderHumanSummary,
  describeWhatHappened,
};
