const EPSILON = 0.001;

function resolveMinimumsPolicy(cfg) {
  const raw = cfg.minimums || {};
  const enabled = raw.enabled === true;
  const severity = raw.severity === "blocking" ? "blocking" : "warning";
  return { enabled, severity, values: raw };
}

function coverageMetricMissingFinding(metric) {
  return {
    type: "coverage-metric-missing",
    severity: "warning",
    metric,
    message: `Coverage metric ${metric} is missing from the current report.`,
  };
}

function coverageNoBaselineFinding(metric, current) {
  return {
    type: "coverage-no-baseline",
    severity: "warning",
    metric,
    current,
    message: `No baseline for coverage.${metric}; current is ${current.toFixed(2)}%.`,
    recommendation: "Run `npm run quality:baseline` on main to lock in the current value.",
  };
}

function evaluateCoverageMinimum(metric, current, minimums, out) {
  if (
    !minimums.enabled ||
    typeof minimums.values[metric] !== "number" ||
    current + EPSILON >= minimums.values[metric]
  ) {
    return;
  }
  const minValue = minimums.values[metric];
  const blocking = minimums.severity === "blocking";
  const finding = {
    type: "coverage-below-minimum",
    severity: minimums.severity,
    metric,
    current,
    minimum: minValue,
    message: blocking
      ? `Coverage ${metric} is ${current.toFixed(2)}%, below the blocking minimum of ${minValue.toFixed(2)}%.`
      : `Coverage ${metric} is ${current.toFixed(2)}%, below the recommended minimum of ${minValue.toFixed(2)}%.`,
    recommendation: blocking
      ? "Add tests for uncovered critical paths before merging."
      : "Improve coverage over time. This is advisory because coverage minimums are configured as warning.",
  };
  (blocking ? out.regressions : out.warnings).push(finding);
}

function evaluateCoverageRatchet(metric, current, baseline, cfg, minDelta, out) {
  const delta = Math.round((current - baseline) * 100) / 100;
  if (!cfg.allowDecrease && current + EPSILON < baseline - minDelta) {
    out.regressions.push({
      type: "coverage-drop",
      severity: "blocking",
      metric,
      baseline,
      current,
      delta,
      message: `Coverage ${metric} decreased from ${baseline.toFixed(2)}% to ${current.toFixed(2)}%.`,
      recommendation: "Add tests for the changed behavior or revert the offending change.",
    });
  } else if (delta >= minDelta) {
    out.infos.push({
      type: "coverage-improved",
      severity: "info",
      metric,
      baseline,
      current,
      delta,
      message: `Coverage ${metric} improved from ${baseline.toFixed(2)}% to ${current.toFixed(2)}%.`,
    });
  }
}

module.exports = {
  resolveMinimumsPolicy,
  coverageMetricMissingFinding,
  coverageNoBaselineFinding,
  evaluateCoverageMinimum,
  evaluateCoverageRatchet,
};
