#!/usr/bin/env node
// Generate reports/audit/npm-audit.json without using shell interpolation.

const path = require("path");
const { REPO_ROOT, runCommandSafe, writeJson } = require("./utils");

const OUT_PATH = path.join(REPO_ROOT, "reports", "audit", "npm-audit.json");

function auditFallback(result) {
  return {
    auditReportVersion: 2,
    generatedBy: "run-audit-report.js",
    error: {
      status: result.status,
      message: (result.stderr || result.stdout || "npm audit did not produce JSON").trim(),
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
      },
    },
  };
}

function runAuditReport() {
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = runCommandSafe(npmBin, ["audit", "--json"]);
  let json;
  try {
    json = JSON.parse(result.stdout || "{}");
  } catch (_err) {
    json = auditFallback(result);
  }
  writeJson(OUT_PATH, json);
  return { ok: true, path: OUT_PATH };
}

function main() {
  const result = runAuditReport();
  console.log(`audit:report wrote ${path.relative(REPO_ROOT, result.path)}`);
}

if (require.main === module) {
  main();
}

module.exports = { runAuditReport, auditFallback };
