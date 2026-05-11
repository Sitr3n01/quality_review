// Collect duplication metrics from a JSCPD JSON report.
//
// JSCPD output shapes vary across versions. We probe several common locations.

const path = require("path");
const { fileExists, readJson, REPO_ROOT, safeNumber } = require("./utils");

function extractFromJscpd(json) {
  if (!json || typeof json !== "object") return null;

  // Newer shape: { statistics: { total: { percentage, duplicatedLines, ...} }, duplicates: [...] }
  if (json.statistics && json.statistics.total) {
    const t = json.statistics.total;
    return {
      percentage: safeNumber(t.percentage),
      fragments: Array.isArray(json.duplicates) ? json.duplicates.length : safeNumber(t.clones),
      duplicatedLines: safeNumber(t.duplicatedLines),
    };
  }

  // Older shape: { statistics: { percentage, duplicatedLines, clones } }
  if (json.statistics && typeof json.statistics.percentage !== "undefined") {
    return {
      percentage: safeNumber(json.statistics.percentage),
      fragments: safeNumber(json.statistics.clones),
      duplicatedLines: safeNumber(json.statistics.duplicatedLines),
    };
  }

  // Flat top-level shape: { percentage, duplicatedLines, ... }
  if (typeof json.percentage !== "undefined") {
    return {
      percentage: safeNumber(json.percentage),
      fragments: Array.isArray(json.duplicates) ? json.duplicates.length : null,
      duplicatedLines: safeNumber(json.duplicatedLines),
    };
  }

  return null;
}

function collectDuplication(config) {
  const paths = (config && config.duplication && config.duplication.jscpdJsonPaths) || [
    "reports/duplication/jscpd-report.json",
    "reports/duplication/jscpd.json",
  ];
  const warnings = [];

  for (const rel of paths) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fileExists(abs)) continue;
    const json = readJson(abs, null);
    if (!json) {
      warnings.push({
        severity: "warning",
        message: `Duplication report ${rel} could not be parsed as JSON.`,
        recommendation: "Regenerate with `jscpd --reporters json`.",
      });
      continue;
    }
    const metrics = extractFromJscpd(json);
    if (metrics) {
      return {
        available: true,
        percentage: metrics.percentage,
        fragments: metrics.fragments,
        duplicatedLines: metrics.duplicatedLines,
        source: rel,
        warnings,
      };
    }
    warnings.push({
      severity: "warning",
      message: `Duplication report ${rel} has an unrecognized shape.`,
      recommendation: "Expected a JSCPD JSON report (any common version).",
    });
  }

  warnings.push({
    severity: "warning",
    message: "No duplication report was found.",
    recommendation: "Run `jscpd --reporters json --output reports/duplication .` before the gate.",
  });

  return {
    available: false,
    percentage: null,
    fragments: null,
    duplicatedLines: null,
    source: null,
    warnings,
  };
}

module.exports = {
  collectDuplication,
  extractFromJscpd,
};
