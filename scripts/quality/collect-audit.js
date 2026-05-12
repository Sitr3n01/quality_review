// Collect dependency audit metrics from an npm audit JSON report.

const path = require("path");
const { fileExists, readJson, REPO_ROOT, safeNumber } = require("./utils");

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

function emptyCounts() {
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
}

function extractFromNpmAudit(json) {
  if (!json || typeof json !== "object") return null;
  if (
    Object.keys(json).length === 0 ||
    (json.auditReportVersion && !json.metadata && !json.vulnerabilities)
  ) {
    return emptyCounts();
  }

  const metadataCounts = json.metadata && json.metadata.vulnerabilities;
  if (metadataCounts && typeof metadataCounts === "object") {
    const counts = emptyCounts();
    for (const level of SEVERITIES) {
      counts[level] = safeNumber(metadataCounts[level]) || 0;
    }
    counts.total = safeNumber(metadataCounts.total);
    if (counts.total === null) {
      counts.total = SEVERITIES.reduce((sum, level) => sum + counts[level], 0);
    }
    return counts;
  }

  if (json.vulnerabilities && typeof json.vulnerabilities === "object") {
    const counts = emptyCounts();
    for (const vuln of Object.values(json.vulnerabilities)) {
      const level = vuln && SEVERITIES.includes(vuln.severity) ? vuln.severity : null;
      if (level) counts[level] += 1;
    }
    counts.total = SEVERITIES.reduce((sum, level) => sum + counts[level], 0);
    return counts;
  }

  return null;
}

function collectAudit(config) {
  const cfg = (config && config.audit) || {};
  const rel = cfg.npmAuditJsonPath || "reports/audit/npm-audit.json";
  const abs = path.join(REPO_ROOT, rel);
  const warnings = [];

  if (!fileExists(abs)) {
    warnings.push({
      severity: "warning",
      message: `Audit report not found at ${rel}.`,
      recommendation: "Run `npm run audit:report` before the gate.",
    });
    return { available: false, counts: emptyCounts(), source: null, warnings };
  }

  const json = readJson(abs, null);
  const counts = extractFromNpmAudit(json);
  if (!counts) {
    warnings.push({
      severity: "warning",
      message: `Audit report ${rel} has an unrecognized shape.`,
      recommendation: "Regenerate with `npm audit --json`.",
    });
    return { available: false, counts: emptyCounts(), source: null, warnings };
  }

  return { available: true, counts, source: rel, warnings };
}

module.exports = {
  collectAudit,
  extractFromNpmAudit,
  emptyCounts,
};
