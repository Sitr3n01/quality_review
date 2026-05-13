const { test } = require("node:test");
const assert = require("node:assert/strict");

const { classifyComplexity, shouldEmitHtml } = require("../../scripts/quality/classify-complexity");

function makeReport(overrides = {}) {
  return {
    status: "passed",
    summary: { blocking: 0, warnings: 0, infos: 0 },
    regressions: [],
    warnings: [],
    infos: [],
    current: { files: { changedFiles: [] } },
    ...overrides,
  };
}

test("SIMPLE: passing gate with no changes", () => {
  assert.equal(classifyComplexity(makeReport()), "SIMPLE");
});

test("SIMPLE: warning gate with under 3 warnings is still SIMPLE", () => {
  const report = makeReport({
    status: "warning",
    summary: { blocking: 0, warnings: 2, infos: 0 },
    warnings: [{ type: "complexity-collector" }, { type: "file-near-limit" }],
  });
  assert.equal(classifyComplexity(report), "SIMPLE");
});

test("MODERATE: one blocking regression", () => {
  const report = makeReport({
    status: "failed",
    summary: { blocking: 1, warnings: 0, infos: 0 },
    regressions: [{ type: "lint-errors-increase", severity: "blocking" }],
  });
  assert.equal(classifyComplexity(report), "MODERATE");
});

test("MODERATE: 3+ warnings escalates from SIMPLE", () => {
  const report = makeReport({
    status: "warning",
    summary: { blocking: 0, warnings: 3, infos: 0 },
    warnings: [
      { type: "file-near-limit" },
      { type: "audit-vulnerability", level: "high" },
      { type: "coverage-no-baseline" },
    ],
  });
  assert.equal(classifyComplexity(report), "MODERATE");
});

test("MODERATE: 6-10 changed files", () => {
  const report = makeReport({
    current: { files: { changedFiles: ["a", "b", "c", "d", "e", "f", "g"] } },
  });
  assert.equal(classifyComplexity(report), "MODERATE");
});

test("COMPLEX: 3 or more blocking failures", () => {
  const report = makeReport({
    status: "failed",
    summary: { blocking: 3, warnings: 0, infos: 0 },
    regressions: [
      { type: "lint-errors-increase" },
      { type: "coverage-drop" },
      { type: "duplication-increase" },
    ],
  });
  assert.equal(classifyComplexity(report), "COMPLEX");
});

test("COMPLEX: critical security vulnerability", () => {
  const report = makeReport({
    status: "failed",
    summary: { blocking: 1, warnings: 0, infos: 0 },
    regressions: [{ type: "audit-vulnerability", level: "critical" }],
  });
  assert.equal(classifyComplexity(report), "COMPLEX");
});

test("COMPLEX: more than 10 changed files", () => {
  const report = makeReport({
    current: { files: { changedFiles: Array.from({ length: 11 }, (_, i) => `src/file${i}.js`) } },
  });
  assert.equal(classifyComplexity(report), "COMPLEX");
});

test("COMPLEX: coverage drop combined with oversized file growth", () => {
  const report = makeReport({
    status: "failed",
    summary: { blocking: 2, warnings: 0, infos: 0 },
    regressions: [
      { type: "coverage-drop", severity: "blocking" },
      { type: "oversized-file-grew", severity: "blocking" },
    ],
  });
  assert.equal(classifyComplexity(report), "COMPLEX");
});

test("COMPLEX: blocking regression that touches a workflow file", () => {
  const report = makeReport({
    status: "failed",
    summary: { blocking: 1, warnings: 0, infos: 0 },
    regressions: [{ type: "lint-errors-increase" }],
    current: { files: { changedFiles: [".github/workflows/quality-gate.yml"] } },
  });
  assert.equal(classifyComplexity(report), "COMPLEX");
});

test("COMPLEX: forceHtml escalates a SIMPLE report", () => {
  assert.equal(classifyComplexity(makeReport(), { forceHtml: true }), "COMPLEX");
});

test("classifyComplexity tolerates a missing report", () => {
  assert.equal(classifyComplexity(null), "SIMPLE");
  assert.equal(classifyComplexity(null, { forceHtml: true }), "COMPLEX");
});

test("shouldEmitHtml: true only for COMPLEX or forceHtml", () => {
  assert.equal(shouldEmitHtml("SIMPLE"), false);
  assert.equal(shouldEmitHtml("MODERATE"), false);
  assert.equal(shouldEmitHtml("COMPLEX"), true);
  assert.equal(shouldEmitHtml("SIMPLE", { forceHtml: true }), true);
});
