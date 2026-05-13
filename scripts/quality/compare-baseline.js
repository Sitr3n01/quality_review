// Apply ratchet and absolute rules to produce the final gate verdict.

const { safeNumber } = require("./utils");
const {
  resolveMinimumsPolicy,
  coverageMetricMissingFinding,
  coverageNoBaselineFinding,
  evaluateCoverageMinimum,
  evaluateCoverageRatchet,
} = require("./coverage-policy");

const EPSILON = 0.001;

function pushFinding(arr, finding) {
  arr.push(finding);
}

function compareCoverage(current, baseline, config, out) {
  const cfg = config.coverage || {};
  if (!cfg.enabled) return;
  const cur = current.coverage || {};
  const base = baseline.coverage || {};
  const metrics = cfg.metrics || ["lines", "statements", "functions", "branches"];
  const minimums = resolveMinimumsPolicy(cfg);
  const minDelta = typeof cfg.minimumDeltaToReport === "number" ? cfg.minimumDeltaToReport : 0.01;

  if (!cur.available) {
    if (cfg.blockOnMissingCoverageFile) {
      pushFinding(out.regressions, {
        type: "coverage-missing",
        severity: "blocking",
        message: "Coverage report is missing and policy requires it.",
        recommendation: "Run the test runner with coverage enabled.",
      });
    }
    return;
  }

  for (const metric of metrics) {
    const c = safeNumber(cur.metrics ? cur.metrics[metric] : null);
    const b = safeNumber(base[metric]);
    if (c === null) {
      pushFinding(out.warnings, coverageMetricMissingFinding(metric));
      continue;
    }
    evaluateCoverageMinimum(metric, c, minimums, out);
    if (b === null) {
      pushFinding(out.warnings, coverageNoBaselineFinding(metric, c));
      continue;
    }
    evaluateCoverageRatchet(metric, c, b, cfg, minDelta, out);
  }
}

function compareDuplication(current, baseline, config, out) {
  const cfg = config.duplication || {};
  if (!cfg.enabled) return;
  const cur = current.duplication || {};
  const base = baseline.duplication || {};

  if (!cur.available) {
    if (cfg.blockOnMissingReport) {
      pushFinding(out.regressions, {
        type: "duplication-missing",
        severity: "blocking",
        message: "Duplication report is missing and policy requires it.",
      });
    }
    return;
  }

  const c = safeNumber(cur.percentage);
  const b = safeNumber(base.percentage);

  if (typeof cfg.maxPercentage === "number" && c !== null && c > cfg.maxPercentage + EPSILON) {
    pushFinding(out.regressions, {
      type: "duplication-over-absolute-cap",
      severity: "blocking",
      current: c,
      limit: cfg.maxPercentage,
      message: `Duplication is ${c.toFixed(2)}% which exceeds the absolute cap of ${cfg.maxPercentage}%.`,
      recommendation: "Refactor duplicated fragments into shared modules.",
    });
  }

  if (b === null) {
    if (c !== null) {
      pushFinding(out.warnings, {
        type: "duplication-no-baseline",
        severity: "warning",
        current: c,
        message: `No duplication baseline; current is ${c.toFixed(2)}%.`,
        recommendation: "Run `npm run quality:baseline` on main to lock in the current value.",
      });
    }
    return;
  }

  if (c !== null && !cfg.allowIncrease && c > b + EPSILON) {
    pushFinding(out.regressions, {
      type: "duplication-increase",
      severity: "blocking",
      baseline: b,
      current: c,
      delta: Math.round((c - b) * 100) / 100,
      message: `Duplication increased from ${b.toFixed(2)}% to ${c.toFixed(2)}%.`,
      recommendation: "Refactor the new duplicated fragments before merging.",
    });
  } else if (c !== null && c < b - EPSILON) {
    pushFinding(out.infos, {
      type: "duplication-improved",
      severity: "info",
      baseline: b,
      current: c,
      delta: Math.round((c - b) * 100) / 100,
      message: `Duplication improved from ${b.toFixed(2)}% to ${c.toFixed(2)}%.`,
    });
  }
}

function compareAudit(current, config, out) {
  const cfg = config.audit || {};
  if (!cfg.enabled) return;
  const cur = current.audit || {};
  const counts = cur.counts || {};

  if (!cur.available) {
    if (cfg.blockOnMissingReport) {
      pushFinding(out.regressions, {
        type: "audit-missing",
        severity: "blocking",
        message: "Audit report is missing and policy requires it.",
        recommendation: "Run `npm run audit:report` before the gate.",
      });
    }
    return;
  }

  const blockLevels = cfg.blockLevels || ["critical"];
  const warnLevels = cfg.warnLevels || ["high", "moderate"];
  const infoLevels = cfg.infoLevels || ["low"];

  for (const level of blockLevels) {
    const count = Number(counts[level]) || 0;
    if (count > 0) {
      pushFinding(out.regressions, {
        type: "audit-vulnerability",
        severity: "blocking",
        level,
        count,
        message: `Dependency audit found ${count} ${level} vulnerabilities.`,
        recommendation: "Upgrade or replace vulnerable dependencies before merging.",
      });
    }
  }

  for (const level of warnLevels) {
    const count = Number(counts[level]) || 0;
    if (count > 0) {
      pushFinding(out.warnings, {
        type: "audit-vulnerability",
        severity: "warning",
        level,
        count,
        message: `Dependency audit found ${count} ${level} vulnerabilities.`,
        recommendation: "Review and schedule dependency updates.",
      });
    }
  }

  for (const level of infoLevels) {
    const count = Number(counts[level]) || 0;
    if (count > 0) {
      pushFinding(out.infos, {
        type: "audit-vulnerability",
        severity: "info",
        level,
        count,
        message: `Dependency audit found ${count} ${level} vulnerabilities.`,
      });
    }
  }
}

function compareLint(current, baseline, config, out) {
  const cfg = config.lint || {};
  if (!cfg.enabled) return;
  const cur = current.eslint || {};
  const base = baseline.eslint || {};

  if (!cur.available) {
    if (cfg.blockOnMissingReport) {
      pushFinding(out.regressions, {
        type: "lint-missing",
        severity: "blocking",
        message: "ESLint report is missing and policy requires it.",
      });
    }
    return;
  }

  const curErrors = Number(cur.errors) || 0;
  const curWarnings = Number(cur.warnings) || 0;
  const baseErrors = safeNumber(base.errors);
  const baseWarnings = safeNumber(base.warnings);

  if (baseErrors === null) {
    pushFinding(out.warnings, {
      type: "lint-no-baseline",
      severity: "warning",
      message: `No lint baseline; current has ${curErrors} errors and ${curWarnings} warnings.`,
      recommendation: "Run `npm run quality:baseline` on main to lock in the current value.",
    });
  } else if (!cfg.allowNewErrors && curErrors > baseErrors) {
    pushFinding(out.regressions, {
      type: "lint-errors-increase",
      severity: "blocking",
      baseline: baseErrors,
      current: curErrors,
      delta: curErrors - baseErrors,
      message: `Lint errors increased from ${baseErrors} to ${curErrors}.`,
      recommendation: "Fix the newly introduced lint errors.",
    });
  } else if (curErrors < baseErrors) {
    pushFinding(out.infos, {
      type: "lint-errors-improved",
      severity: "info",
      baseline: baseErrors,
      current: curErrors,
      delta: curErrors - baseErrors,
      message: `Lint errors decreased from ${baseErrors} to ${curErrors}.`,
    });
  }

  if (baseWarnings !== null && !cfg.allowNewWarnings && curWarnings > baseWarnings) {
    pushFinding(out.regressions, {
      type: "lint-warnings-increase",
      severity: "blocking",
      baseline: baseWarnings,
      current: curWarnings,
      delta: curWarnings - baseWarnings,
      message: `Lint warnings increased from ${baseWarnings} to ${curWarnings}.`,
      recommendation: "Fix or suppress the newly introduced lint warnings deliberately.",
    });
  }
}

function compareFiles(current, baseline, config, out) {
  const cfg = config.files || {};
  if (!cfg.enabled) return;
  const cur = current.files || {};
  const base = baseline.files || {};
  if (!cur.available) {
    pushFinding(out.warnings, {
      type: "files-missing",
      severity: "warning",
      message: "File metrics unavailable.",
    });
    return;
  }

  const baselineCounts = base.fileLineCounts || {};
  const blockIfGrows = cfg.blockIfOversizedFileGrows !== false;

  for (const entry of cur.oversizedFiles || []) {
    const baselineLines = safeNumber(baselineCounts[entry.file]);
    if (baselineLines === null) {
      pushFinding(out.warnings, {
        type: "oversized-file-no-baseline",
        severity: "warning",
        file: entry.file,
        currentLines: entry.lines,
        limit: entry.limit,
        message: `File ${entry.file} is oversized (${entry.lines} lines) and has no baseline record.`,
        recommendation:
          "Run `npm run quality:baseline` on main to register the current size, then plan a split.",
      });
      continue;
    }
    if (blockIfGrows && entry.lines > baselineLines) {
      pushFinding(out.regressions, {
        type: "oversized-file-grew",
        severity: "blocking",
        file: entry.file,
        baselineLines,
        currentLines: entry.lines,
        delta: entry.lines - baselineLines,
        message: `Oversized file ${entry.file} grew from ${baselineLines} to ${entry.lines} lines.`,
        recommendation: "Move new code into a separate, smaller module.",
      });
    } else {
      pushFinding(out.infos, {
        type: "oversized-file-stable",
        severity: "info",
        file: entry.file,
        currentLines: entry.lines,
        baselineLines,
        message: `File ${entry.file} is oversized (${entry.lines} lines) but did not grow.`,
      });
    }
  }

  // New files exceeding the new-file limit are blocking regardless of baseline.
  const maxLinesNewFile = cfg.maxLinesNewFile || 800;
  for (const f of cur.addedFiles || []) {
    const lines = safeNumber(cur.fileLineCounts ? cur.fileLineCounts[f] : null);
    if (lines !== null && lines > maxLinesNewFile) {
      pushFinding(out.regressions, {
        type: "new-file-oversized",
        severity: "blocking",
        file: f,
        currentLines: lines,
        limit: maxLinesNewFile,
        message: `New file ${f} has ${lines} lines, exceeding the new-file limit of ${maxLinesNewFile}.`,
        recommendation: "Split the new file into smaller, cohesive modules before merging.",
      });
    }
  }

  // Near-limit files: informational warnings.
  for (const entry of (cur.nearLimitFiles || []).slice(0, 10)) {
    pushFinding(out.warnings, {
      type: "file-near-limit",
      severity: "warning",
      file: entry.file,
      currentLines: entry.lines,
      warnAt: entry.warnAt,
      message: `File ${entry.file} has ${entry.lines} lines, approaching the warn threshold of ${entry.warnAt}.`,
    });
  }
}

function compareComplexity(current, baseline, config, out) {
  const cfg = config.complexity || {};
  if (!cfg.enabled) return;
  const cur = current.complexity || {};
  const base = baseline.complexity || {};

  // The collector already surfaces the heuristic notice; do not duplicate.

  function compareMetric(key, label) {
    const c = safeNumber(cur[key]);
    const b = safeNumber(base[key]);
    if (c === null) return;
    if (b === null) {
      if (c > 0) {
        pushFinding(out.infos, {
          type: "complexity-no-baseline",
          severity: "info",
          metric: key,
          current: c,
          message: `${label}: ${c} violations (no baseline yet).`,
        });
      }
      return;
    }
    if (c > b) {
      const severity = cfg.blockOnRegression !== false ? "blocking" : "warning";
      pushFinding(severity === "blocking" ? out.regressions : out.warnings, {
        type: `complexity-${key}-increase`,
        severity,
        metric: key,
        baseline: b,
        current: c,
        delta: c - b,
        message: `${label} increased from ${b} to ${c}.`,
        recommendation: "Split the function or simplify the conditional structure.",
      });
    }
  }

  compareMetric("maxDepthViolations", "Depth violations");
  compareMetric("complexityViolations", "Cyclomatic complexity violations");
  compareMetric("longFunctionViolations", "Long-function violations");
}

function compareBaseline(current, baseline, config) {
  const out = {
    regressions: [],
    warnings: [],
    infos: [],
    recommendations: [],
  };

  // Surface collector-level warnings (missing reports, git fallbacks, etc).
  for (const section of ["coverage", "audit", "eslint", "duplication", "files", "complexity"]) {
    const data = current[section];
    if (!data) continue;
    const candidateList = data.warnings || data.warningsList || [];
    const list = Array.isArray(candidateList) ? candidateList : [];
    for (const w of list) {
      const severity = w.severity || "warning";
      const target = severity === "blocking" ? out.regressions : severity === "info" ? out.infos : out.warnings;
      target.push({ type: `${section}-collector`, severity, ...w });
    }
  }

  compareCoverage(current, baseline, config, out);
  compareAudit(current, config, out);
  compareDuplication(current, baseline, config, out);
  compareLint(current, baseline, config, out);
  compareFiles(current, baseline, config, out);
  compareComplexity(current, baseline, config, out);

  // Derive recommendations from regressions.
  const recommendations = new Set();
  for (const finding of out.regressions.concat(out.warnings)) {
    if (finding.recommendation) recommendations.add(finding.recommendation);
  }
  out.recommendations = Array.from(recommendations);

  const summary = {
    blocking: out.regressions.length,
    warnings: out.warnings.length,
    infos: out.infos.length,
  };

  let status;
  if (summary.blocking > 0) status = "failed";
  else if (summary.warnings > 0) status = "warning";
  else status = "passed";

  const aiReviewContext = {
    shouldRunAiExplainer: status === "failed",
    reason:
      status === "failed"
        ? "Quality gate failed with blocking regressions."
        : status === "warning"
          ? "Quality gate produced warnings."
          : "Quality gate passed.",
  };

  return {
    status,
    summary,
    regressions: out.regressions,
    warnings: out.warnings,
    infos: out.infos,
    recommendations: out.recommendations,
    aiReviewContext,
  };
}

module.exports = {
  compareBaseline,
  compareCoverage,
  compareAudit,
  compareDuplication,
  compareLint,
  compareFiles,
  compareComplexity,
};
