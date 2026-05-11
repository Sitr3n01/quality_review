// Build a new baseline object from the current collector outputs.
//
// This module is called by quality-gate.js in `baseline` mode. It does NOT
// write the file directly; quality-gate.js does, after emitting a clear
// branch warning. That separation makes the function easy to unit test.

function buildBaseline(current, options = {}) {
  const now = options.now || new Date().toISOString();
  const baseline = {
    schemaVersion: 1,
    generatedAt: now,
    source: options.source || "quality-gate-baseline",
    coverage: {
      lines: null,
      statements: null,
      functions: null,
      branches: null,
    },
    duplication: {
      percentage: null,
      fragments: null,
      duplicatedLines: null,
    },
    eslint: {
      errors: null,
      warnings: null,
      ruleViolations: {},
    },
    files: {
      oversizedFiles: [],
      maxLines: null,
      fileLineCounts: {},
    },
    complexity: {
      maxDepthViolations: null,
      complexityViolations: null,
      longFunctionViolations: null,
    },
  };

  if (current.coverage && current.coverage.available && current.coverage.metrics) {
    for (const m of ["lines", "statements", "functions", "branches"]) {
      if (typeof current.coverage.metrics[m] === "number") {
        baseline.coverage[m] = current.coverage.metrics[m];
      }
    }
  }

  if (current.duplication && current.duplication.available) {
    baseline.duplication.percentage = typeof current.duplication.percentage === "number" ? current.duplication.percentage : null;
    baseline.duplication.fragments = typeof current.duplication.fragments === "number" ? current.duplication.fragments : null;
    baseline.duplication.duplicatedLines = typeof current.duplication.duplicatedLines === "number" ? current.duplication.duplicatedLines : null;
  }

  if (current.eslint && current.eslint.available) {
    baseline.eslint.errors = typeof current.eslint.errors === "number" ? current.eslint.errors : null;
    baseline.eslint.warnings = typeof current.eslint.warnings === "number" ? current.eslint.warnings : null;
    baseline.eslint.ruleViolations = current.eslint.ruleViolations || {};
  }

  if (current.files && current.files.available) {
    baseline.files.oversizedFiles = (current.files.oversizedFiles || []).map((e) => ({
      file: e.file,
      lines: e.lines,
    }));
    baseline.files.maxLines = typeof current.files.maxLines === "number" ? current.files.maxLines : null;
    baseline.files.fileLineCounts = current.files.fileLineCounts || {};
  }

  if (current.complexity) {
    baseline.complexity.maxDepthViolations = typeof current.complexity.maxDepthViolations === "number" ? current.complexity.maxDepthViolations : null;
    baseline.complexity.complexityViolations = typeof current.complexity.complexityViolations === "number" ? current.complexity.complexityViolations : null;
    baseline.complexity.longFunctionViolations = typeof current.complexity.longFunctionViolations === "number" ? current.complexity.longFunctionViolations : null;
  }

  return baseline;
}

module.exports = { buildBaseline };
