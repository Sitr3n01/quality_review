// Deterministic complexity classifier for the hybrid report.
//
// Reads a quality-gate.json shape and returns one of:
//   "SIMPLE"   -> Markdown only
//   "MODERATE" -> Markdown only
//   "COMPLEX"  -> Markdown + HTML
//
// The classifier is pure: no I/O, no model calls. Same input -> same label.

const { HIGH_RISK_PATTERNS, hasHighRiskFile } = require("./file-risk");

function regressionTypes(report) {
  return new Set((report.regressions || []).map((r) => r.type));
}

function buildFindingFlags(types, regressions) {
  return {
    hasCriticalSecurity: regressions.some(
      (r) => r.type === "audit-vulnerability" && r.level === "critical",
    ),
    hasSecurityIssue: regressions.some((r) => r.type === "audit-vulnerability"),
    hasCoverageDrop: types.has("coverage-drop") || types.has("coverage-below-minimum"),
    hasOversized: types.has("oversized-file-grew") || types.has("new-file-oversized"),
    hasDuplicationIssue:
      types.has("duplication-increase") || types.has("duplication-over-absolute-cap"),
    hasComplexityIssue: Array.from(types).some((t) => t.startsWith("complexity-")),
  };
}

function extractSignals(report) {
  const summary = report.summary || {};
  const current = report.current || {};
  const filesData = current.files || {};
  const changedFiles = Array.isArray(filesData.changedFiles) ? filesData.changedFiles : [];
  const regressions = report.regressions || [];
  const types = regressionTypes(report);
  return {
    blocking: Number(summary.blocking) || 0,
    warnings: Number(summary.warnings) || 0,
    changedFiles,
    types,
    touchesHighRisk: hasHighRiskFile(changedFiles),
    ...buildFindingFlags(types, regressions),
  };
}

function combinedRegression(signals) {
  if (
    signals.hasCoverageDrop &&
    (signals.hasOversized || signals.hasComplexityIssue || signals.hasDuplicationIssue)
  ) {
    return true;
  }
  return signals.hasSecurityIssue && signals.hasCoverageDrop;
}

function isComplex(signals) {
  if (signals.blocking >= 3) return true;
  if (signals.hasCriticalSecurity) return true;
  if (signals.changedFiles.length > 10) return true;
  if (signals.touchesHighRisk && signals.blocking > 0) return true;
  return combinedRegression(signals);
}

function isModerate(signals) {
  if (signals.blocking >= 1) return true;
  if (signals.warnings >= 3) return true;
  if (signals.changedFiles.length > 5) return true;
  if (signals.touchesHighRisk && signals.warnings > 0) return true;
  return false;
}

function classifyComplexity(report, options = {}) {
  if (!report || typeof report !== "object") {
    return options.forceHtml ? "COMPLEX" : "SIMPLE";
  }
  if (options.forceHtml) return "COMPLEX";
  const signals = extractSignals(report);
  if (isComplex(signals)) return "COMPLEX";
  if (isModerate(signals)) return "MODERATE";
  return "SIMPLE";
}

function shouldEmitHtml(complexity, options = {}) {
  if (options.forceHtml) return true;
  return complexity === "COMPLEX";
}

module.exports = {
  classifyComplexity,
  shouldEmitHtml,
  HIGH_RISK_PATTERNS,
};
