#!/usr/bin/env node
// Generate deterministic quality context for AI explainer workflows.
//
// Design rules:
//   - Runs each underlying deterministic command best-effort.
//   - Records exit code, duration, stdout/stderr tail for each command in
//     reports/explainer/commands.ndjson so the AI prompt can reason about
//     partial failures.
//   - Always exits with code 0 unless the runner itself is broken. The
//     explainer must never block the workflow on a partial signal.
//
// This is *not* a replacement for `quality:check`. It only prepares context
// for an advisory AI layer. The deterministic gate is still owned by
// `quality-gate.yml` running `quality:check`.

const path = require("path");
const fs = require("fs");
const { runCommandSafe, ensureDir, REPO_ROOT } = require("./utils");

const OUTPUT_DIR = path.join(REPO_ROOT, "reports", "explainer");
const NDJSON_PATH = path.join(OUTPUT_DIR, "commands.ndjson");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "commands.json");

const IS_WINDOWS = process.platform === "win32";
const NPM_BIN = IS_WINDOWS ? "npm.cmd" : "npm";
const NPX_BIN = IS_WINDOWS ? "npx.cmd" : "npx";

const TAIL_LIMIT = 4000;

function tail(text) {
  if (!text) return "";
  const trimmed = text.length > TAIL_LIMIT ? text.slice(-TAIL_LIMIT) : text;
  return trimmed.replace(/\r\n/g, "\n");
}

function buildSteps(npmBin = NPM_BIN, npxBin = NPX_BIN) {
  return [
    { name: "quality:validate", bin: npmBin, args: ["run", "quality:validate"] },
    { name: "audit:report", bin: npmBin, args: ["run", "audit:report"] },
    {
      name: "eslint:json",
      bin: npxBin,
      args: [
        "--no-install",
        "eslint",
        ".",
        "--format",
        "json",
        "--output-file",
        "reports/eslint/eslint.json",
      ],
    },
    { name: "lint", bin: npmBin, args: ["run", "lint", "--if-present"] },
    { name: "test:coverage:ci", bin: npmBin, args: ["run", "test:coverage:ci", "--if-present"] },
    { name: "duplication:ci", bin: npmBin, args: ["run", "duplication:ci", "--if-present"] },
    { name: "complexity:ci", bin: npmBin, args: ["run", "complexity:ci", "--if-present"] },
    { name: "quality:report", bin: npmBin, args: ["run", "quality:report"] },
  ];
}

function buildEntry(name, bin, args, result, durationMs) {
  const exitCode = result.error ? -1 : typeof result.status === "number" ? result.status : -1;
  return {
    name,
    command: [bin, ...args].join(" "),
    exitCode,
    ok: exitCode === 0,
    durationMs,
    skipped: false,
    error: result.error ? String(result.error.message || result.error) : null,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
  };
}

function buildSummary(records) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totals: {
      count: records.length,
      ok: records.filter((r) => r.ok).length,
      failed: records.filter((r) => !r.ok).length,
    },
    commands: records.map((r) => ({
      name: r.name,
      command: r.command,
      exitCode: r.exitCode,
      ok: r.ok,
      durationMs: r.durationMs,
      skipped: r.skipped,
    })),
  };
}

function appendNdjson(entry, ndjsonPath) {
  try {
    fs.appendFileSync(ndjsonPath, JSON.stringify(entry) + "\n", "utf8");
  } catch (_err) {
    // Best-effort; the in-memory record is still flushed at the end.
  }
}

function runStep(records, name, bin, args, options = {}) {
  const start = Date.now();
  const display = [bin, ...args].join(" ");
  process.stdout.write(`[explainer-context] ${name}: ${display}\n`);

  // Windows .cmd shims (npm.cmd, npx.cmd) require shell:true to be spawned.
  // All `args` here are hard-coded constants, so shell expansion is safe.
  const spawnOptions = IS_WINDOWS && bin.endsWith(".cmd") ? { shell: true } : {};
  const result = options.runner
    ? options.runner(bin, args, options)
    : runCommandSafe(bin, args, spawnOptions);
  const entry = buildEntry(name, bin, args, result, Date.now() - start);

  records.push(entry);
  appendNdjson(entry, options.ndjsonPath || NDJSON_PATH);

  if (!entry.ok) {
    process.stdout.write(
      `[explainer-context] ${name} finished with exitCode=${entry.exitCode} (continuing)\n`,
    );
  }
  return entry;
}

function runSteps(records, steps, options = {}) {
  for (const step of steps) {
    runStep(records, step.name, step.bin, step.args, options);
  }
  return records;
}

function writeSummary(summary, summaryPath) {
  try {
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
    return true;
  } catch (err) {
    process.stdout.write(
      `[explainer-context] failed to write summary: ${err.message}\n`,
    );
    return false;
  }
}

function resetNdjson(ndjsonPath) {
  try {
    fs.writeFileSync(ndjsonPath, "", "utf8");
  } catch (_err) {
    // appendFileSync below will retry.
  }
}

function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(path.join(REPO_ROOT, "reports", "eslint"));
  resetNdjson(NDJSON_PATH);

  const records = [];
  runSteps(records, buildSteps());

  const summary = buildSummary(records);
  writeSummary(summary, SUMMARY_PATH);

  process.stdout.write(
    `[explainer-context] done: ${summary.totals.ok}/${summary.totals.count} ok, ${summary.totals.failed} failed (always exit 0)\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(
      `[explainer-context] unexpected runner failure: ${err && err.stack ? err.stack : err}\n`,
    );
  }
  process.exit(0);
}

module.exports = {
  tail,
  buildSteps,
  buildEntry,
  buildSummary,
  appendNdjson,
  runStep,
  runSteps,
  writeSummary,
  resetNdjson,
};
