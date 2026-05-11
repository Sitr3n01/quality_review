// Collect lint metrics from an ESLint JSON report.
//
// Expected input format (ESLint --format json):
//   [ { filePath, errorCount, warningCount, messages: [{ ruleId, severity, ... }] }, ... ]

const path = require("path");
const { fileExists, readJson, REPO_ROOT, normalizePath } = require("./utils");

function collectEslint(config) {
  const rel =
    (config && config.lint && config.lint.eslintJsonPath) ||
    "reports/eslint/eslint.json";
  const abs = path.join(REPO_ROOT, rel);
  const warnings = [];

  if (!fileExists(abs)) {
    warnings.push({
      severity: "warning",
      message: `ESLint report not found at ${rel}.`,
      recommendation:
        "Run `npx eslint . --format json --output-file reports/eslint/eslint.json` before the gate.",
    });
    return {
      available: false,
      errors: null,
      warnings: null,
      ruleViolations: {},
      topFiles: [],
      warningsList: warnings,
    };
  }

  const json = readJson(abs, null);
  if (!Array.isArray(json)) {
    warnings.push({
      severity: "warning",
      message: `ESLint report at ${rel} is not a JSON array.`,
      recommendation: "Regenerate with `eslint --format json`.",
    });
    return {
      available: false,
      errors: null,
      warnings: null,
      ruleViolations: {},
      topFiles: [],
      warningsList: warnings,
    };
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const ruleViolations = {};
  const perFile = [];

  for (const entry of json) {
    if (!entry || typeof entry !== "object") continue;
    const errorCount = Number(entry.errorCount) || 0;
    const warningCount = Number(entry.warningCount) || 0;
    totalErrors += errorCount;
    totalWarnings += warningCount;
    if (Array.isArray(entry.messages)) {
      for (const msg of entry.messages) {
        const rule = msg && msg.ruleId ? msg.ruleId : "unknown-rule";
        ruleViolations[rule] = (ruleViolations[rule] || 0) + 1;
      }
    }
    if (errorCount + warningCount > 0) {
      perFile.push({
        file: entry.filePath ? normalizePath(path.relative(REPO_ROOT, entry.filePath)) : "unknown",
        errors: errorCount,
        warnings: warningCount,
      });
    }
  }

  perFile.sort((a, b) => b.errors - a.errors || b.warnings - a.warnings);
  const topFiles = perFile.slice(0, 10);

  return {
    available: true,
    errors: totalErrors,
    warnings: totalWarnings,
    ruleViolations,
    topFiles,
    warningsList: warnings,
  };
}

module.exports = { collectEslint };
