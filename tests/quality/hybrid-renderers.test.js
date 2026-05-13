const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  renderMachineMarkdown,
  deriveCheckStatus,
  gateStatusLabel,
  SCHEMA_VERSION,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
} = require("../../scripts/quality/render-machine-md");
const { renderHumanSummary, describeWhatHappened } = require("../../scripts/quality/render-human-summary");
const { renderHumanHtml, escapeHtml, severityFromFinding } = require("../../scripts/quality/render-human-html");
const { captureLogs } = require("../../scripts/quality/capture-logs");

function makeReport(overrides = {}) {
  return {
    status: "passed",
    generatedAt: "2026-05-12T00:00:00.000Z",
    summary: { blocking: 0, warnings: 0, infos: 0 },
    regressions: [],
    warnings: [],
    infos: [],
    recommendations: [],
    current: {
      coverage: { available: true, metrics: { lines: 90, statements: 90, functions: 90, branches: 80 } },
      audit: { available: true, counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 } },
      eslint: { available: true, errors: 0, warnings: 0, ruleViolations: {}, topFiles: [] },
      duplication: { available: true, percentage: 1.0, fragments: 1, duplicatedLines: 10 },
      files: { available: true, totalFiles: 10, changedFiles: [], oversizedFiles: [], maxLines: 200, thresholds: {} },
      complexity: { maxDepthViolations: 0, complexityViolations: 0, longFunctionViolations: 0 },
    },
    baseline: {
      coverage: { lines: 90, statements: 90, functions: 90, branches: 80 },
      duplication: { percentage: 1.0 },
      eslint: { errors: 0, warnings: 0 },
    },
    ...overrides,
  };
}

function metricRow(markdown, metric) {
  return markdown.split("\n").find((line) => line.includes(`coverage_${metric}`));
}

test("gateStatusLabel maps internal statuses to machine values", () => {
  assert.equal(gateStatusLabel("passed"), STATUS_PASS);
  assert.equal(gateStatusLabel("failed"), STATUS_FAIL);
  assert.equal(gateStatusLabel("warning"), STATUS_WARN);
  assert.equal(gateStatusLabel("anything-else"), STATUS_SKIPPED);
});

test("deriveCheckStatus returns PASS / FAIL / WARN / SKIPPED based on section findings", () => {
  const base = makeReport();
  assert.equal(deriveCheckStatus(base, "eslint"), STATUS_PASS);
  const withFail = makeReport({
    regressions: [{ type: "lint-errors-increase", severity: "blocking" }],
  });
  assert.equal(deriveCheckStatus(withFail, "eslint"), STATUS_FAIL);
  const withWarn = makeReport({
    warnings: [{ type: "audit-vulnerability", level: "high", severity: "warning" }],
  });
  assert.equal(deriveCheckStatus(withWarn, "audit"), STATUS_WARN);
  const skipped = makeReport({
    current: { coverage: { available: false } },
  });
  assert.equal(deriveCheckStatus(skipped, "coverage"), STATUS_SKIPPED);
});

test("renderMachineMarkdown emits stable headings and metadata", () => {
  const md = renderMachineMarkdown(makeReport(), { commitSha: "abc1234", branch: "main", prNumber: "42" });
  assert.match(md, /^# Quality Gate Machine Report$/m);
  assert.match(md, new RegExp(`SCHEMA_VERSION: ${SCHEMA_VERSION}`));
  assert.match(md, /^GATE_STATUS: PASS$/m);
  assert.match(md, /^COMMIT_SHA: abc1234$/m);
  assert.match(md, /^BRANCH: main$/m);
  assert.match(md, /^PR_NUMBER: 42$/m);
  for (const heading of ["## Summary", "## Checks", "## Blocking Failures", "## Warnings", "## Metrics", "## Changed Files", "## Final Decision"]) {
    assert.match(md, new RegExp(`^${heading}$`, "m"));
  }
  assert.match(md, /AI_OVERRIDE_ALLOWED: false/);
});

test("renderMachineMarkdown contains no HTML and no decorative emoji", () => {
  const md = renderMachineMarkdown(makeReport());
  assert.ok(!/<[a-z]+[ >/]/i.test(md), "machine MD must not contain HTML tags");
  // basic emoji guard
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(md), "machine MD must not contain decorative emoji");
});

test("renderMachineMarkdown surfaces blocking failures with check id and evidence", () => {
  const report = makeReport({
    status: "failed",
    summary: { blocking: 1, warnings: 0, infos: 0 },
    regressions: [
      { type: "coverage-drop", severity: "blocking", message: "Coverage lines decreased.", metric: "lines" },
    ],
  });
  const md = renderMachineMarkdown(report);
  assert.match(md, /\| coverage \| Coverage lines decreased\./);
  assert.match(md, /GATE_STATUS: FAIL/);
});

test("renderMachineMarkdown labels blocking coverage minimum violations as FAIL", () => {
  const config = {
    coverage: { minimums: { enabled: true, severity: "blocking", lines: 95, statements: 95, functions: 95, branches: 90 } },
  };
  const md = renderMachineMarkdown(makeReport(), { config });
  assert.equal(
    metricRow(md, "lines"),
    "| coverage_lines | 90.00% | 90.00% | minimum >= 95.00%; ratchet >= 90.00% | FAIL |",
  );
});

test("renderMachineMarkdown labels advisory coverage minimum violations as WARN", () => {
  const report = makeReport({
    current: {
      ...makeReport().current,
      coverage: { available: true, metrics: { lines: 70, statements: 90, functions: 90, branches: 80 } },
    },
    baseline: {
      ...makeReport().baseline,
      coverage: { lines: 65, statements: 90, functions: 90, branches: 80 },
    },
  });
  const config = {
    coverage: { minimums: { enabled: true, severity: "warning", lines: 80 } },
  };
  const md = renderMachineMarkdown(report, { config });
  assert.equal(
    metricRow(md, "lines"),
    "| coverage_lines | 70.00% | 65.00% | minimum >= 80.00%; ratchet >= 65.00% | WARN |",
  );
});

test("renderMachineMarkdown keeps ratchet failures visible when minimums pass", () => {
  const report = makeReport({
    current: {
      ...makeReport().current,
      coverage: { available: true, metrics: { lines: 90, statements: 90, functions: 90, branches: 80 } },
    },
    baseline: {
      ...makeReport().baseline,
      coverage: { lines: 95, statements: 90, functions: 90, branches: 80 },
    },
  });
  const config = {
    coverage: {
      allowDecrease: false,
      minimums: { enabled: true, severity: "blocking", lines: 80 },
    },
  };
  const md = renderMachineMarkdown(report, { config });
  assert.equal(
    metricRow(md, "lines"),
    "| coverage_lines | 90.00% | 95.00% | minimum >= 80.00%; ratchet >= 95.00% | FAIL |",
  );
});

test("renderMachineMarkdown labels missing coverage baseline as WARN", () => {
  const report = makeReport({
    baseline: {
      ...makeReport().baseline,
      coverage: { lines: null, statements: 90, functions: 90, branches: 80 },
    },
  });
  const config = {
    coverage: { minimums: { enabled: false, lines: 80 } },
  };
  const md = renderMachineMarkdown(report, { config });
  assert.equal(
    metricRow(md, "lines"),
    "| coverage_lines | 90.00% | n/a | ratchet baseline missing | WARN |",
  );
});

test("renderMachineMarkdown classifies changed files with shared file risk rules", () => {
  const md = renderMachineMarkdown(makeReport({
    current: {
      ...makeReport().current,
      files: {
        ...makeReport().current.files,
        changedFiles: [".github/workflows/ci.yml"],
      },
    },
  }));
  assert.match(md, /\| \.github\/workflows\/ci\.yml \| infra \| high \|/);
});

test("renderHumanSummary produces the documented headings", () => {
  const md = renderHumanSummary(makeReport(), { outDir: ".quality-gate", htmlEmitted: false });
  assert.match(md, /^# Quality Gate Summary$/m);
  for (const heading of ["## Result", "## What happened", "## Important checks", "## Blocking issues", "## Suggested next steps", "## Evidence"]) {
    assert.match(md, new RegExp(`^${heading}$`, "m"));
  }
  assert.match(md, /\*\*Status:\*\* PASS/);
  assert.match(md, /No blocking issues found\./);
  assert.ok(!/HUMAN_REPORT\.html/.test(md), "should not link HTML when not emitted");
});

test("renderHumanSummary points at the HTML artifact when it was emitted", () => {
  const md = renderHumanSummary(makeReport(), { outDir: ".quality-gate", htmlEmitted: true });
  assert.match(md, /HUMAN_REPORT\.html/);
});

test("describeWhatHappened uses the right language for each status", () => {
  assert.match(describeWhatHappened(makeReport()), /passed/i);
  assert.match(
    describeWhatHappened(makeReport({ status: "warning", summary: { blocking: 0, warnings: 1, infos: 0 } })),
    /warning/i,
  );
  assert.match(
    describeWhatHappened(makeReport({ status: "failed", summary: { blocking: 2, warnings: 0, infos: 0 } })),
    /failed/i,
  );
});

test("renderHumanHtml emits a self-contained document with required sections", () => {
  const html = renderHumanHtml(makeReport({
    status: "failed",
    summary: { blocking: 2, warnings: 1, infos: 0 },
    regressions: [
      { type: "coverage-drop", severity: "blocking", message: "Coverage lines decreased.", recommendation: "Add tests." },
      { type: "lint-errors-increase", severity: "blocking", message: "Lint errors went up.", recommendation: "Fix lint." },
    ],
    warnings: [{ type: "file-near-limit", severity: "warning", message: "File near limit." }],
    recommendations: ["Add tests.", "Fix lint."],
    current: {
      ...makeReport().current,
      files: { available: true, totalFiles: 1, changedFiles: ["src/foo.js"] },
    },
  }), { outDir: ".quality-gate", commitSha: "abc", branch: "feat/x", prNumber: "7" });
  assert.match(html, /^<!doctype html>/);
  assert.ok(!/https?:\/\//i.test(html), "HTML report must not reference external URLs");
  assert.ok(!/<script\b/i.test(html), "HTML report must not include scripts");
  for (const section of [
    "Executive Summary",
    "Gate Checks",
    "Blocking Failures",
    "Warnings",
    "Changed Files and Risk",
    "Suggested Fix Plan",
    "Evidence",
  ]) {
    assert.match(html, new RegExp(section));
  }
  assert.match(html, /Coverage lines decreased\./);
  assert.match(html, /badge-fail/);
});

test("escapeHtml prevents script injection from PR-controlled strings", () => {
  const dangerous = `<script>alert('x')</script>`;
  assert.equal(escapeHtml(dangerous), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  assert.equal(escapeHtml(`"& <a>`), "&quot;&amp; &lt;a&gt;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("renderHumanHtml escapes hostile file paths and finding messages", () => {
  const html = renderHumanHtml(makeReport({
    status: "failed",
    summary: { blocking: 1, warnings: 0, infos: 0 },
    regressions: [{ type: "coverage-drop", severity: "blocking", message: "<img src=x onerror=alert(1)>" }],
    current: {
      ...makeReport().current,
      files: { available: true, totalFiles: 1, changedFiles: ['"><script>alert(1)</script>'] },
    },
  }));
  assert.ok(!/<img src=x onerror=alert\(1\)>/.test(html), "raw HTML must be escaped");
  assert.ok(!/<script>alert\(1\)<\/script>/.test(html), "raw script tags must be escaped");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("severityFromFinding maps internal severity to human label", () => {
  assert.equal(severityFromFinding({ severity: "blocking" }), "blocker");
  assert.equal(severityFromFinding({ severity: "warning" }), "warning");
  assert.equal(severityFromFinding({ severity: "info" }), "info");
  assert.equal(severityFromFinding({}), "warning");
  assert.equal(severityFromFinding(null), "warning");
});

test("captureLogs writes one log per check derived from the report", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qg-logs-"));
  const written = captureLogs(
    makeReport({
      regressions: [{ type: "coverage-drop", severity: "blocking", message: "Coverage dropped." }],
    }),
    { logsDir: dir },
  );
  const names = written.map((p) => path.basename(p)).sort();
  assert.deepEqual(names, [
    "build.log",
    "complexity.log",
    "coverage.log",
    "duplication.log",
    "files.log",
    "gate.log",
    "lint.log",
    "security.log",
    "tests.log",
    "typecheck.log",
  ]);
  const buildLog = fs.readFileSync(path.join(dir, "build.log"), "utf8");
  assert.match(buildLog, /Status: SKIPPED/);
  const gateLog = fs.readFileSync(path.join(dir, "gate.log"), "utf8");
  assert.match(gateLog, /Decision source: deterministic-checks/);
  assert.match(gateLog, /AI override allowed: false/);
});
