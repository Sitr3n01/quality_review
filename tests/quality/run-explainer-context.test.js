const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  tail,
  buildSteps,
  buildEntry,
  buildSummary,
  appendNdjson,
  runStep,
  runSteps,
  writeSummary,
  resetNdjson,
} = require("../../scripts/quality/run-explainer-context");

function mktemp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `qg-${name}-`));
  return dir;
}

test("tail truncates long strings and normalizes CRLF", () => {
  assert.equal(tail("a".repeat(5000)).length, 4000);
  assert.equal(tail("line1\r\nline2\r\n"), "line1\nline2\n");
  assert.equal(tail(""), "");
  assert.equal(tail(undefined), "");
});

test("buildSteps returns the canonical sequence", () => {
  const steps = buildSteps("npm", "npx");
  assert.equal(steps.length, 8);
  assert.deepEqual(
    steps.map((s) => s.name),
    [
      "quality:validate",
      "audit:report",
      "eslint:json",
      "lint",
      "test:coverage:ci",
      "duplication:ci",
      "complexity:ci",
      "quality:report",
    ],
  );
  assert.deepEqual(steps[0], { name: "quality:validate", bin: "npm", args: ["run", "quality:validate"] });
});

test("buildEntry serializes runner results into an NDJSON-ready shape", () => {
  const okEntry = buildEntry(
    "ok-step",
    "npm",
    ["run", "x"],
    { status: 0, stdout: "out", stderr: "" },
    123,
  );
  assert.equal(okEntry.ok, true);
  assert.equal(okEntry.exitCode, 0);
  assert.equal(okEntry.error, null);
  assert.equal(okEntry.command, "npm run x");
  assert.equal(okEntry.durationMs, 123);
  assert.equal(okEntry.stdoutTail, "out");

  const failEntry = buildEntry(
    "fail-step",
    "npm",
    ["run", "y"],
    { status: 2, stdout: "", stderr: "boom\r\n" },
    7,
  );
  assert.equal(failEntry.ok, false);
  assert.equal(failEntry.exitCode, 2);
  assert.equal(failEntry.stderrTail, "boom\n");

  const errorEntry = buildEntry(
    "err-step",
    "npm",
    ["run", "z"],
    { error: new Error("spawn failed"), stdout: "", stderr: "" },
    1,
  );
  assert.equal(errorEntry.ok, false);
  assert.equal(errorEntry.exitCode, -1);
  assert.equal(errorEntry.error, "spawn failed");
});

test("buildSummary tallies records and produces a stable schema", () => {
  const records = [
    { name: "a", command: "npm a", exitCode: 0, ok: true, durationMs: 1, skipped: false },
    { name: "b", command: "npm b", exitCode: 1, ok: false, durationMs: 2, skipped: false },
    { name: "c", command: "npm c", exitCode: 0, ok: true, durationMs: 3, skipped: false },
  ];
  const summary = buildSummary(records);
  assert.equal(summary.schemaVersion, 1);
  assert.match(summary.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(summary.totals, { count: 3, ok: 2, failed: 1 });
  assert.equal(summary.commands.length, 3);
  assert.equal(summary.commands[1].ok, false);
});

test("appendNdjson appends a line and is best-effort on missing dir", () => {
  const dir = mktemp("ndjson");
  const file = path.join(dir, "commands.ndjson");
  fs.writeFileSync(file, "");
  appendNdjson({ name: "x", ok: true }, file);
  appendNdjson({ name: "y", ok: false }, file);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).name, "x");
  assert.equal(JSON.parse(lines[1]).name, "y");

  // Pointing at a path inside a non-existent directory must not throw.
  appendNdjson({ name: "z" }, path.join(dir, "does", "not", "exist.ndjson"));
});

test("resetNdjson clears an existing file and is best-effort on bad paths", () => {
  const dir = mktemp("reset");
  const file = path.join(dir, "ndjson.log");
  fs.writeFileSync(file, "previous content");
  resetNdjson(file);
  assert.equal(fs.readFileSync(file, "utf8"), "");
  // Non-existent directory: no throw.
  resetNdjson(path.join(dir, "missing", "x.log"));
});

test("writeSummary writes JSON and is best-effort on bad paths", () => {
  const dir = mktemp("summary");
  const file = path.join(dir, "summary.json");
  assert.equal(writeSummary({ totals: { count: 0 } }, file), true);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(parsed, { totals: { count: 0 } });
  // Writing into a non-existent dir returns false rather than throwing.
  assert.equal(writeSummary({}, path.join(dir, "no", "such", "dir.json")), false);
});

test("runStep records exit code and writes NDJSON via injected runner", () => {
  const dir = mktemp("runstep");
  const ndjsonPath = path.join(dir, "commands.ndjson");
  fs.writeFileSync(ndjsonPath, "");
  const records = [];
  const runner = (bin, args) => ({
    status: 0,
    stdout: `ran ${bin} ${args.join(" ")}`,
    stderr: "",
  });
  const entry = runStep(records, "fake-ok", "npm", ["run", "ok"], { runner, ndjsonPath });
  assert.equal(entry.ok, true);
  assert.equal(entry.exitCode, 0);
  assert.equal(records.length, 1);
  const line = fs.readFileSync(ndjsonPath, "utf8").trim();
  assert.match(line, /fake-ok/);
});

test("runStep records failure and continues without throwing", () => {
  const dir = mktemp("runfail");
  const ndjsonPath = path.join(dir, "commands.ndjson");
  fs.writeFileSync(ndjsonPath, "");
  const records = [];
  const runner = () => ({ status: 13, stdout: "", stderr: "fail" });
  const entry = runStep(records, "fake-fail", "npm", ["run", "fail"], { runner, ndjsonPath });
  assert.equal(entry.ok, false);
  assert.equal(entry.exitCode, 13);
  assert.equal(records.length, 1);
});

test("runSteps iterates all steps with the injected runner", () => {
  const dir = mktemp("runsteps");
  const ndjsonPath = path.join(dir, "commands.ndjson");
  fs.writeFileSync(ndjsonPath, "");
  const calls = [];
  const runner = (bin, args) => {
    calls.push([bin, args.join(" ")]);
    return { status: 0, stdout: "", stderr: "" };
  };
  const steps = [
    { name: "one", bin: "npm", args: ["run", "1"] },
    { name: "two", bin: "npm", args: ["run", "2"] },
  ];
  const records = [];
  runSteps(records, steps, { runner, ndjsonPath });
  assert.equal(records.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(records[0].name, "one");
  assert.equal(records[1].name, "two");
});

test("runStep falls back to real spawn when no runner is injected", () => {
  // Use node -e to exit non-zero without depending on shell features.
  const dir = mktemp("realspawn");
  const ndjsonPath = path.join(dir, "commands.ndjson");
  fs.writeFileSync(ndjsonPath, "");
  const records = [];
  const bin = process.platform === "win32" ? "node.exe" : "node";
  const entry = runStep(records, "real-fail", bin, ["-e", "process.exit(7)"], { ndjsonPath });
  assert.equal(entry.exitCode, 7);
  assert.equal(entry.ok, false);
  assert.equal(records.length, 1);
});
