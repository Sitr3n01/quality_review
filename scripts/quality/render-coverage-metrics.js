const { resolveMinimumsPolicy } = require("./coverage-policy");
const {
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
} = require("./report-status");
const { safeNumber, formatPercent } = require("./utils");

function formatCoverageNumber(value) {
  const formatted = formatPercent(value);
  return formatted.endsWith("%") ? formatted.slice(0, -1) : formatted;
}

function objectValue(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

function coverageThresholdLabel(minimum, previous) {
  const parts = [];
  if (minimum !== null) parts.push(`minimum >= ${formatCoverageNumber(minimum)}%`);
  if (previous !== null) parts.push(`ratchet >= ${formatCoverageNumber(previous)}%`);
  else parts.push("ratchet baseline missing");
  return parts.join("; ");
}

function coverageMetricStatus(current, previous, minimum, policy) {
  if (current === null) return STATUS_SKIPPED;
  const ratchetFailed =
    !policy.allowDecrease && previous !== null && current + 1e-9 < previous - policy.minDelta;
  const belowMinimum = minimum !== null && current + 1e-9 < minimum;
  if (ratchetFailed || (belowMinimum && policy.minimumSeverity === "blocking")) {
    return STATUS_FAIL;
  }
  if (belowMinimum || previous === null) return STATUS_WARN;
  return STATUS_PASS;
}

function resolveCoverageContext(report, config) {
  const coverageData = objectValue(objectValue(report.current).coverage);
  const coverageCfg = objectValue(objectValue(config).coverage);
  const minimumsPolicy = resolveMinimumsPolicy(coverageCfg);
  return {
    metricsObj: objectValue(coverageData.metrics),
    baselineCoverage: objectValue(objectValue(report.baseline).coverage),
    minimums: minimumsPolicy.values,
    minimumsActive: minimumsPolicy.enabled,
    minimumSeverity: minimumsPolicy.severity,
    allowDecrease: coverageCfg.allowDecrease === true,
    minDelta:
      typeof coverageCfg.minimumDeltaToReport === "number"
        ? coverageCfg.minimumDeltaToReport
        : 0.01,
  };
}

function coverageRow(metric, ctx) {
  const current = safeNumber(ctx.metricsObj[metric]);
  const previous = safeNumber(ctx.baselineCoverage[metric]);
  const minimum =
    ctx.minimumsActive && typeof ctx.minimums[metric] === "number"
      ? ctx.minimums[metric]
      : null;
  const threshold = coverageThresholdLabel(minimum, previous);
  const status = coverageMetricStatus(current, previous, minimum, ctx);
  return `| coverage_${metric} | ${formatPercent(current)} | ${formatPercent(previous)} | ${threshold} | ${status} |`;
}

function buildCoverageRows(report, config) {
  const ctx = resolveCoverageContext(report, config);
  return ["lines", "statements", "functions", "branches"].map((metric) =>
    coverageRow(metric, ctx),
  );
}

module.exports = {
  buildCoverageRows,
  coverageMetricStatus,
  coverageThresholdLabel,
};
