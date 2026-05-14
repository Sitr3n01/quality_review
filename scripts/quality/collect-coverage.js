// Collect coverage metrics from Jest/Istanbul-compatible reports.
//
// Supports both formats:
//   - coverage/coverage-summary.json (Jest's json-summary reporter)
//   - coverage/coverage-final.json   (Istanbul's default output)
//
// Returns a uniform shape regardless of source format:
//   { available, metrics: { lines, statements, functions, branches }, source, warnings }

const path = require("path");
const { fileExists, readJson, REPO_ROOT } = require("./utils");

function extractFromSummary(json) {
  if (!json || !json.total) return null;
  const t = json.total;
  function pct(group) {
    return group && typeof group.pct === "number" ? group.pct : null;
  }
  return {
    lines: pct(t.lines),
    statements: pct(t.statements),
    functions: pct(t.functions),
    branches: pct(t.branches),
  };
}

function extractFromFinal(json) {
  if (!json || typeof json !== "object") return null;
  // coverage-final.json is keyed by file path; each entry has s/b/f/l maps.
  let lTotal = 0, lCovered = 0;
  let sTotal = 0, sCovered = 0;
  let fTotal = 0, fCovered = 0;
  let bTotal = 0, bCovered = 0;
  let any = false;
  for (const fileKey of Object.keys(json)) {
    const file = json[fileKey];
    if (!file || typeof file !== "object") continue;
    any = true;
    if (file.s && typeof file.s === "object") {
      for (const id of Object.keys(file.s)) {
        sTotal += 1;
        if (file.s[id] > 0) sCovered += 1;
      }
    }
    if (file.f && typeof file.f === "object") {
      for (const id of Object.keys(file.f)) {
        fTotal += 1;
        if (file.f[id] > 0) fCovered += 1;
      }
    }
    if (file.b && typeof file.b === "object") {
      for (const id of Object.keys(file.b)) {
        const arr = file.b[id];
        if (Array.isArray(arr)) {
          for (const v of arr) {
            bTotal += 1;
            if (v > 0) bCovered += 1;
          }
        }
      }
    }
    if (file.statementMap && typeof file.statementMap === "object") {
      for (const id of Object.keys(file.statementMap)) {
        const stmt = file.statementMap[id];
        if (stmt && stmt.start && typeof stmt.start.line === "number") {
          lTotal += 1;
          if (file.s && file.s[id] > 0) lCovered += 1;
        }
      }
    }
  }
  if (!any) return null;
  function pct(covered, total) {
    if (total === 0) return null;
    return Math.round((covered / total) * 10000) / 100;
  }
  return {
    lines: pct(lCovered, lTotal),
    statements: pct(sCovered, sTotal),
    functions: pct(fCovered, fTotal),
    branches: pct(bCovered, bTotal),
  };
}

function collectCoverage(config) {
  const paths = (config && config.coverage && config.coverage.coverageSummaryPaths) || [
    "coverage/coverage-summary.json",
    "coverage/coverage-final.json",
  ];
  const warnings = [];
  for (const rel of paths) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fileExists(abs)) continue;
    const json = readJson(abs, null);
    if (!json) {
      warnings.push({
        severity: "warning",
        message: `Coverage file ${rel} could not be parsed as JSON.`,
        recommendation: "Re-run the test runner to regenerate the coverage report.",
      });
      continue;
    }
    let metrics = extractFromSummary(json);
    let source = rel;
    if (!metrics) metrics = extractFromFinal(json);
    if (metrics) {
      return { available: true, metrics, source, warnings };
    }
    warnings.push({
      severity: "warning",
      message: `Coverage file ${rel} has an unrecognized shape.`,
      recommendation: "Expected Jest json-summary or Istanbul coverage-final format.",
    });
  }
  warnings.push({
    severity: "warning",
    message: "No coverage report was found.",
    recommendation:
      "Run the project-specific `npm run test:coverage:ci` script so it writes `coverage/coverage-summary.json` or `coverage/coverage-final.json`.",
  });
  return { available: false, metrics: null, source: null, warnings };
}

module.exports = {
  collectCoverage,
  extractFromSummary,
  extractFromFinal,
};
