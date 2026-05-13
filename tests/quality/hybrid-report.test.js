const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseArgs, loadOrGenerateReport, runHybrid } = require("../../scripts/quality/hybrid-report");

function mktemp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `qg-${name}-`));
}

test("parseArgs accepts the documented flags", () => {
  const a = parseArgs(["--html"]);
  assert.equal(a.forceHtml, true);
  assert.equal(a.enforce, false);

  const b = parseArgs(["--force-html"]);
  assert.equal(b.forceHtml, true);

  const c = parseArgs(["--detailed"]);
  assert.equal(c.forceHtml, true);

  const d = parseArgs(["--enforce"]);
  assert.equal(d.enforce, true);

  const e = parseArgs(["--regenerate"]);
  assert.equal(e.regenerate, true);

  const f = parseArgs(["--out=/tmp/x", "--input=/tmp/in.json"]);
  assert.ok(f.outDir.endsWith("x"));
  assert.ok(f.inputPath.endsWith("in.json"));

  const help = parseArgs(["--help"]);
  assert.equal(help.help, true);
});

test("parseArgs rejects unknown flags by setting help true", () => {
  const a = parseArgs(["--unknown-flag"]);
  assert.equal(a.help, true);
});

test("loadOrGenerateReport reads an existing JSON file", () => {
  const dir = mktemp("input");
  const inputPath = path.join(dir, "qg.json");
  const fixture = {
    schemaVersion: 1,
    status: "passed",
    summary: { blocking: 0, warnings: 0, infos: 0 },
    regressions: [],
    warnings: [],
    infos: [],
    recommendations: [],
    current: { files: { changedFiles: [] } },
    baseline: {},
  };
  fs.writeFileSync(inputPath, JSON.stringify(fixture), "utf8");
  const loaded = loadOrGenerateReport({ inputPath, regenerate: false });
  assert.equal(loaded.status, "passed");
});

test("loadOrGenerateReport throws when the input is present but unreadable as JSON", () => {
  const dir = mktemp("badjson");
  const inputPath = path.join(dir, "bad.json");
  fs.writeFileSync(inputPath, "not-valid-json{", "utf8");
  assert.throws(
    () => loadOrGenerateReport({ inputPath, regenerate: false }),
    /failed to read/i,
  );
});

test("runHybrid writes machine + summary artifacts for a simple report and skips HTML", () => {
  const inputDir = mktemp("rh-in");
  const outDir = mktemp("rh-out");
  const inputPath = path.join(inputDir, "qg.json");
  const fixture = {
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-05-12T00:00:00.000Z",
    summary: { blocking: 0, warnings: 0, infos: 1 },
    regressions: [],
    warnings: [],
    infos: [{ type: "coverage-improved", severity: "info", metric: "lines" }],
    recommendations: [],
    current: {
      coverage: { available: true, metrics: { lines: 85, statements: 85, functions: 85, branches: 75 } },
      audit: { available: true, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 } },
      eslint: { available: true, errors: 0, warnings: 0 },
      duplication: { available: true, percentage: 1.0 },
      files: { available: true, changedFiles: ["README.md"], oversizedFiles: [], totalFiles: 1, thresholds: {} },
      complexity: { maxDepthViolations: 0, complexityViolations: 0, longFunctionViolations: 0 },
    },
    baseline: { coverage: { lines: 80, statements: 80, functions: 80, branches: 70 }, duplication: { percentage: 1.0 }, eslint: { errors: 0, warnings: 0 } },
  };
  fs.writeFileSync(inputPath, JSON.stringify(fixture), "utf8");

  const result = runHybrid({ inputPath, outDir, forceHtml: false, regenerate: false });
  assert.equal(result.complexity, "SIMPLE");
  assert.equal(result.htmlEmitted, false);
  assert.ok(fs.existsSync(path.join(outDir, "QUALITY_GATE.md")));
  assert.ok(fs.existsSync(path.join(outDir, "HUMAN_SUMMARY.md")));
  assert.ok(!fs.existsSync(path.join(outDir, "HUMAN_REPORT.html")));
  assert.ok(fs.existsSync(path.join(outDir, "logs", "build.log")));
});

test("runHybrid emits HTML when --force-html is passed even for SIMPLE cases", () => {
  const inputDir = mktemp("rh-html-in");
  const outDir = mktemp("rh-html-out");
  const inputPath = path.join(inputDir, "qg.json");
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      schemaVersion: 1,
      status: "passed",
      generatedAt: "2026-05-12T00:00:00.000Z",
      summary: { blocking: 0, warnings: 0, infos: 0 },
      regressions: [],
      warnings: [],
      infos: [],
      recommendations: [],
      current: { files: { available: true, changedFiles: [] } },
      baseline: {},
    }),
    "utf8",
  );

  const result = runHybrid({ inputPath, outDir, forceHtml: true, regenerate: false });
  assert.equal(result.complexity, "COMPLEX");
  assert.equal(result.htmlEmitted, true);
  assert.ok(fs.existsSync(path.join(outDir, "HUMAN_REPORT.html")));
  const html = fs.readFileSync(path.join(outDir, "HUMAN_REPORT.html"), "utf8");
  assert.match(html, /<!doctype html>/);
});

test("runHybrid emits HTML automatically when the report has 3+ blocking failures", () => {
  const inputDir = mktemp("rh-complex-in");
  const outDir = mktemp("rh-complex-out");
  const inputPath = path.join(inputDir, "qg.json");
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      schemaVersion: 1,
      status: "failed",
      generatedAt: "2026-05-12T00:00:00.000Z",
      summary: { blocking: 3, warnings: 0, infos: 0 },
      regressions: [
        { type: "coverage-drop", severity: "blocking", message: "Coverage dropped." },
        { type: "lint-errors-increase", severity: "blocking", message: "Lint errors up." },
        { type: "duplication-increase", severity: "blocking", message: "Duplication up." },
      ],
      warnings: [],
      infos: [],
      recommendations: ["Add tests.", "Fix lint."],
      current: { files: { available: true, changedFiles: ["src/a.js", "src/b.js"] } },
      baseline: {},
    }),
    "utf8",
  );

  const result = runHybrid({ inputPath, outDir, forceHtml: false, regenerate: false });
  assert.equal(result.complexity, "COMPLEX");
  assert.equal(result.htmlEmitted, true);
  assert.ok(fs.existsSync(path.join(outDir, "HUMAN_REPORT.html")));

  const machine = fs.readFileSync(path.join(outDir, "QUALITY_GATE.md"), "utf8");
  assert.match(machine, /GATE_STATUS: FAIL/);
  assert.match(machine, /AI_OVERRIDE_ALLOWED: false/);

  const human = fs.readFileSync(path.join(outDir, "HUMAN_SUMMARY.md"), "utf8");
  assert.match(human, /\*\*Status:\*\* FAIL/);
  assert.match(human, /HUMAN_REPORT\.html/);
});
