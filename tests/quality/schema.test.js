const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildBaseline } = require("../../scripts/quality/update-baseline");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
}

function assertRequiredKeys(schema, object, label) {
  for (const key of schema.required) {
    assert.ok(key in object, `${label} missing required key ${key}`);
  }
}

test("baseline schema matches generated baseline shape", () => {
  const schema = readJson("quality/schemas/baseline.schema.json");
  const baseline = buildBaseline({}, { now: "2026-01-01T00:00:00.000Z" });
  assertRequiredKeys(schema, baseline, "baseline");
});

test("quality-gate report schema matches a representative report shape", () => {
  const schema = readJson("quality/schemas/quality-gate-report.schema.json");
  const report = {
    schemaVersion: 1,
    status: "passed",
    generatedAt: "2026-01-01T00:00:00.000Z",
    mode: "check",
    stack: {},
    summary: {},
    baseline: {},
    current: {},
    regressions: [],
    warnings: [],
    infos: [],
    recommendations: [],
    aiReviewContext: {},
  };
  assertRequiredKeys(schema, report, "report");
});
