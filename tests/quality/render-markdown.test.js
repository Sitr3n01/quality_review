const { test } = require("node:test");
const assert = require("node:assert/strict");

const { renderMarkdown, statusLabel } = require("../../scripts/quality/render-markdown");

function makeReport(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-01-01T00:00:00.000Z",
    summary: { blocking: 0, warnings: 0, infos: 0 },
    baseline: { coverage: { lines: 80, statements: 80, functions: 80, branches: 80 } },
    current: {
      coverage: { available: true, metrics: { lines: 81, statements: 80, functions: 80, branches: 79 } },
    },
    regressions: [],
    warnings: [],
    infos: [],
    recommendations: [],
    aiReviewContext: { shouldRunAiExplainer: false, reason: "" },
    ...overrides,
  };
}

test("statusLabel maps status keys to display labels", () => {
  assert.equal(statusLabel("passed"), "Passed");
  assert.equal(statusLabel("warning"), "Warning");
  assert.equal(statusLabel("failed"), "Failed");
  assert.equal(statusLabel("unknown"), "Unknown");
});

test("renderMarkdown emits a Quality Gate heading and status line", () => {
  const md = renderMarkdown(makeReport());
  assert.ok(md.includes("## Quality Gate"));
  assert.ok(md.includes("**Status:** Passed"));
});

test("renderMarkdown shows summary table with all categories", () => {
  const md = renderMarkdown(makeReport());
  assert.ok(md.includes("| Coverage |"));
  assert.ok(md.includes("| Duplication |"));
  assert.ok(md.includes("| Lint |"));
  assert.ok(md.includes("| File size |"));
  assert.ok(md.includes("| Complexity |"));
});

test("renderMarkdown shows coverage table when available", () => {
  const md = renderMarkdown(makeReport());
  assert.ok(md.includes("### Coverage"));
  assert.ok(md.includes("| Lines |"));
  assert.ok(md.includes("| Branches |"));
});

test("renderMarkdown reports 'No blocking regressions found.' when empty", () => {
  const md = renderMarkdown(makeReport());
  assert.ok(md.includes("No blocking regressions found."));
});

test("renderMarkdown lists blocking regressions when present", () => {
  const md = renderMarkdown(
    makeReport({
      status: "failed",
      summary: { blocking: 1, warnings: 0, infos: 0 },
      regressions: [
        {
          type: "coverage-drop",
          severity: "blocking",
          metric: "branches",
          baseline: 70,
          current: 68,
          delta: -2,
          message: "Branch coverage decreased from 70% to 68%.",
        },
      ],
    }),
  );
  assert.ok(md.includes("**Status:** Failed"));
  assert.ok(md.includes("Branch coverage decreased from 70% to 68%."));
});
