#!/usr/bin/env node
// Validate the quality-gate config and package scripts for CI readiness.

const path = require("path");
const {
  REPO_ROOT,
  fileExists,
  readJson,
  writeJson,
} = require("./utils");

const CONFIG_PATH = path.join(REPO_ROOT, "quality", "quality-gate.config.cjs");
const PACKAGE_PATH = path.join(REPO_ROOT, "package.json");
const REPORT_PATH = path.join(REPO_ROOT, "reports", "quality-config-validation.json");

function requireArray(errors, value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${name} must be a non-empty array.`);
  }
}

function requireNumber(errors, value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${name} must be a finite number.`);
  }
}

function requireScript(errors, scripts, name) {
  if (!scripts || typeof scripts[name] !== "string" || scripts[name].trim() === "") {
    errors.push(`package.json must define script "${name}".`);
  }
}

function validateConfig(config, pkg) {
  const errors = [];
  const warnings = [];
  const scripts = (pkg && pkg.scripts) || {};

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Config must export an object."], warnings };
  }

  requireScript(errors, scripts, "quality:report");
  requireScript(errors, scripts, "quality:check");
  requireScript(errors, scripts, "quality:baseline");
  requireScript(errors, scripts, "quality:validate");

  if (config.coverage && config.coverage.enabled !== false) {
    requireArray(errors, config.coverage.metrics, "coverage.metrics");
    requireArray(errors, config.coverage.coverageSummaryPaths, "coverage.coverageSummaryPaths");
    if (config.coverage.minimums) {
      for (const metric of config.coverage.metrics || []) {
        requireNumber(errors, config.coverage.minimums[metric], `coverage.minimums.${metric}`);
      }
    }
    requireScript(errors, scripts, "test:coverage:ci");
  }

  if (config.audit && config.audit.enabled !== false) {
    if (!config.audit.npmAuditJsonPath) errors.push("audit.npmAuditJsonPath is required when audit is enabled.");
    requireArray(errors, config.audit.blockLevels, "audit.blockLevels");
    requireArray(errors, config.audit.warnLevels, "audit.warnLevels");
    requireScript(errors, scripts, "audit:report");
  }

  if (config.lint && config.lint.enabled !== false) {
    if (!config.lint.eslintJsonPath) errors.push("lint.eslintJsonPath is required when lint is enabled.");
    requireScript(errors, scripts, "lint");
  }

  if (config.duplication && config.duplication.enabled !== false) {
    requireNumber(errors, config.duplication.maxPercentage, "duplication.maxPercentage");
    requireArray(errors, config.duplication.jscpdJsonPaths, "duplication.jscpdJsonPaths");
    requireScript(errors, scripts, "duplication:ci");
  }

  if (config.files && config.files.enabled !== false) {
    requireArray(errors, config.files.include, "files.include");
    requireArray(errors, config.files.exclude, "files.exclude");
    requireNumber(errors, config.files.warnLines, "files.warnLines");
    requireNumber(errors, config.files.maxLinesNewFile, "files.maxLinesNewFile");
    requireNumber(errors, config.files.maxLinesExistingFile, "files.maxLinesExistingFile");
  }

  if (config.complexity && config.complexity.enabled !== false) {
    if (!config.complexity.eslintJsonPath) errors.push("complexity.eslintJsonPath is required when complexity is enabled.");
    requireNumber(errors, config.complexity.maxDepth, "complexity.maxDepth");
    requireNumber(errors, config.complexity.maxCyclomaticComplexity, "complexity.maxCyclomaticComplexity");
    requireNumber(errors, config.complexity.maxFunctionLines, "complexity.maxFunctionLines");
    requireScript(errors, scripts, "complexity:ci");
  }

  if (!fileExists(path.join(REPO_ROOT, "package-lock.json"))) {
    errors.push("package-lock.json is required for deterministic npm CI.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function loadConfigForValidation() {
  delete require.cache[require.resolve(CONFIG_PATH)];
  return require(CONFIG_PATH);
}

function main() {
  const pkg = readJson(PACKAGE_PATH, {});
  const config = loadConfigForValidation();
  const result = validateConfig(config, pkg);
  writeJson(REPORT_PATH, result);
  if (!result.valid) {
    for (const error of result.errors) console.error(`quality:validate error: ${error}`);
    process.exit(1);
  }
  console.log(`quality:validate passed (${result.errors.length} errors, ${result.warnings.length} warnings).`);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateConfig,
  loadConfigForValidation,
};
