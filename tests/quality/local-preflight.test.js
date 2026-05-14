const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildPreflightSteps,
  buildPreflightSummary,
  renderSummaryMarkdown,
  runLocalPreflight,
} = require("../../scripts/quality/run-local-preflight");

function mktemp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `qg-preflight-${name}-`));
}

function passedReport(overrides = {}) {
  return {
    status: "passed",
    warnings: [],
    summary: { blocking: 0, warnings: 0, infos: 0 },
    ...overrides,
  };
}

function runWithStatuses(statuses, report = passedReport()) {
  const dir = mktemp("run");
  const calls = [];
  const result = runLocalPreflight({
    outputDir: dir,
    qualityReport: report,
    print: false,
    runner: (_bin, _args, step) => {
      calls.push(step.name);
      return {
        status: statuses[step.name] === undefined ? 0 : statuses[step.name],
        stdout: `${step.name} stdout`,
        stderr: statuses[step.name] ? `${step.name} failed` : "",
      };
    },
  });
  return { dir, calls, result };
}

test("buildPreflightSteps returns fixed local gate sequence", () => {
  const steps = buildPreflightSteps("npm", "npx");
  assert.deepEqual(
    steps.map((step) => step.name),
    [
      "quality:validate",
      "audit:report",
      "eslint:json",
      "lint",
      "test:coverage:ci",
      "duplication:ci",
      "complexity:ci",
      "quality:check",
    ],
  );
  assert.equal(steps.find((step) => step.name === "eslint:json").required, false);
  assert.equal(steps.find((step) => step.name === "quality:check").required, true);
});

test("preflight passes when every required command passes, even with gate warnings", () => {
  const { dir, result } = runWithStatuses(
    {},
    passedReport({
      status: "warning",
      warnings: [{ type: "duplication-over-maximum", message: "Duplication is above advisory maximum." }],
      summary: { blocking: 0, warnings: 1, infos: 0 },
    }),
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.readyForGithub, true);
  assert.equal(result.summary.gateWarnings.length, 1);
  assert.ok(fs.existsSync(path.join(dir, "commands.ndjson")));
  assert.ok(fs.existsSync(path.join(dir, "commands.json")));
  assert.match(fs.readFileSync(path.join(dir, "summary.md"), "utf8"), /READY_FOR_GITHUB=true/);
});

test("preflight runs remaining steps after a required producer fails", () => {
  const { calls, result } = runWithStatuses({ "test:coverage:ci": 1 });

  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.readyForGithub, false);
  assert.equal(calls.length, 8);
  assert.deepEqual(
    result.summary.blockingFailures.map((failure) => failure.name),
    ["test:coverage:ci"],
  );
});

test("eslint json failure is advisory when lint and gate pass", () => {
  const { result } = runWithStatuses({ "eslint:json": 2 });

  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.readyForGithub, true);
  assert.deepEqual(
    result.summary.technicalWarnings.map((warning) => warning.name),
    ["eslint:json"],
  );
});

test("quality check failure blocks readiness", () => {
  const { result } = runWithStatuses(
    { "quality:check": 1 },
    passedReport({ status: "failed", regressions: [{ type: "coverage-drop" }] }),
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.readyForGithub, false);
  assert.ok(result.summary.blockingFailures.some((failure) => failure.name === "quality:check"));
});

test("missing quality report blocks readiness even when commands pass", () => {
  const { result } = runWithStatuses({}, null);

  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.readyForGithub, false);
  assert.ok(result.summary.blockingFailures.some((failure) => failure.name === "quality-gate-report"));
});

test("summary markdown lists commands, blocking failures, and warnings", () => {
  const summary = buildPreflightSummary(
    [
      {
        name: "quality:validate",
        label: "validate",
        command: "npm run quality:validate",
        required: true,
        ok: true,
        exitCode: 0,
        durationMs: 1,
      },
      {
        name: "eslint:json",
        label: "eslint json",
        command: "npx eslint",
        required: false,
        ok: false,
        exitCode: 2,
        durationMs: 1,
      },
    ],
    passedReport({ warnings: [{ message: "Advisory warning." }] }),
  );
  const markdown = renderSummaryMarkdown(summary);

  assert.match(markdown, /READY_FOR_GITHUB=true/);
  assert.match(markdown, /eslint:json/);
  assert.match(markdown, /Advisory warning/);
});
