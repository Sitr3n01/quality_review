const baseConfig = require("../../../quality/quality-gate.config.cjs");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, overrides) {
  const out = clone(base);
  for (const [key, value] of Object.entries(overrides || {})) {
    if (isPlainObject(out[key]) && isPlainObject(value)) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function makeCurrent(overrides = {}) {
  return {
    coverage: { available: true, metrics: { lines: 80, statements: 80, functions: 80, branches: 80 }, warnings: [] },
    eslint: { available: true, errors: 0, warnings: 0, ruleViolations: {}, topFiles: [], warningsList: [] },
    duplication: { available: true, percentage: 2.0, fragments: 5, duplicatedLines: 50, warnings: [] },
    files: {
      available: true,
      totalFiles: 10,
      changedFiles: [],
      changedFilesStrategy: "none",
      addedFiles: [],
      largestFiles: [],
      oversizedFiles: [],
      nearLimitFiles: [],
      fileLineCounts: {},
      maxLines: 100,
      thresholds: { warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
      warnings: [],
    },
    complexity: {
      heuristicOnly: true,
      maxDepthViolations: 0,
      complexityViolations: 0,
      longFunctionViolations: 0,
      details: [],
      warnings: [],
    },
    ...overrides,
  };
}

function makeBaseline(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: null,
    source: "test",
    coverage: { lines: 80, statements: 80, functions: 80, branches: 80 },
    duplication: { percentage: 2.0, fragments: 5, duplicatedLines: 50 },
    eslint: { errors: 0, warnings: 0, ruleViolations: {} },
    files: { oversizedFiles: [], maxLines: 100, fileLineCounts: {} },
    complexity: { maxDepthViolations: 0, complexityViolations: 0, longFunctionViolations: 0 },
    ...overrides,
  };
}

function coverageCurrent(metrics) {
  return makeCurrent({ coverage: { available: true, metrics, warnings: [] } });
}

function coverageBaseline(coverage) {
  return makeBaseline({ coverage });
}

function standardCoverageMinimums(overrides = {}) {
  return {
    enabled: false,
    severity: "warning",
    lines: 80,
    statements: 80,
    functions: 80,
    branches: 70,
    ...overrides,
  };
}

function coveragePolicy(options = {}) {
  return {
    coverage: {
      enabled: true,
      metrics: options.metrics || ["lines"],
      minimums: options.minimums || { enabled: false },
    },
  };
}

function cloneBaseConfig() {
  return clone(baseConfig);
}

function fullScriptPackage() {
  return {
    scripts: {
      "quality:report": "x",
      "quality:check": "x",
      "quality:baseline": "x",
      "quality:validate": "x",
      "quality:preflight": "x",
      "test:coverage:ci": "x",
      "audit:report": "x",
      lint: "x",
      "duplication:ci": "x",
      "complexity:ci": "x",
    },
  };
}

function validationConfig(overrides = {}) {
  return deepMerge(
    {
      coverage: {
        enabled: true,
        metrics: ["lines"],
        coverageSummaryPaths: ["coverage.json"],
        minimums: { lines: 80 },
      },
      audit: { enabled: true, npmAuditJsonPath: "audit.json", blockLevels: ["critical"], warnLevels: ["high"] },
      lint: { enabled: true, eslintJsonPath: "eslint.json" },
      duplication: { enabled: true, maxPercentage: 3, jscpdJsonPaths: ["dup.json"] },
      files: { enabled: true, include: ["scripts/**/*.js"], exclude: ["reports/**"], warnLines: 500, maxLinesNewFile: 800, maxLinesExistingFile: 1200 },
      complexity: { enabled: true, eslintJsonPath: "complexity.json", maxDepth: 4, maxCyclomaticComplexity: 10, maxFunctionLines: 80 },
    },
    overrides,
  );
}

module.exports = {
  cloneBaseConfig,
  coverageBaseline,
  coverageCurrent,
  coveragePolicy,
  fullScriptPackage,
  makeBaseline,
  makeCurrent,
  standardCoverageMinimums,
  validationConfig,
};
