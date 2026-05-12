#!/usr/bin/env node
// Generate an ESLint JSON report that is dedicated to complexity metrics.

const path = require("path");
const { REPO_ROOT, ensureDir, runCommandSafe } = require("./utils");

const OUT_PATH = path.join(REPO_ROOT, "reports", "complexity", "eslint-complexity.json");

function runComplexityReport() {
  ensureDir(path.dirname(OUT_PATH));
  const eslintBin = path.join(REPO_ROOT, "node_modules", "eslint", "bin", "eslint.js");
  const result = runCommandSafe(process.execPath, [
    eslintBin,
    "--config",
    "eslint.complexity.config.cjs",
    "scripts/quality",
    "--format",
    "json",
    "--output-file",
    path.relative(REPO_ROOT, OUT_PATH),
  ]);
  if (!result.ok) {
    return { ok: false, path: OUT_PATH, result };
  }
  return { ok: true, path: OUT_PATH, result };
}

function main() {
  const outcome = runComplexityReport();
  if (!outcome.ok) {
    console.error((outcome.result.stderr || outcome.result.stdout || "complexity report failed").trim());
    process.exit(1);
  }
  console.log(`complexity:ci wrote ${path.relative(REPO_ROOT, outcome.path)}`);
}

if (require.main === module) {
  main();
}

module.exports = { runComplexityReport };
