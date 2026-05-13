const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDuplicationMaximumPolicy,
  evaluateDuplicationMaximum,
  evaluateDuplicationRatchet,
  duplicationNoBaselineFinding,
} = require("../../scripts/quality/duplication-policy");

function makeOut() {
  return { regressions: [], warnings: [], infos: [] };
}

test("resolveDuplicationMaximumPolicy returns disabled when nothing is configured", () => {
  const policy = resolveDuplicationMaximumPolicy({});
  assert.equal(policy.enabled, false);
  assert.equal(policy.severity, "warning");
  assert.equal(policy.percentage, null);
});

test("resolveDuplicationMaximumPolicy reads the new maximum object verbatim", () => {
  const policy = resolveDuplicationMaximumPolicy({
    maximum: { enabled: true, severity: "blocking", percentage: 3 },
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.severity, "blocking");
  assert.equal(policy.percentage, 3);
  assert.equal(policy.legacy, undefined);
});

test("resolveDuplicationMaximumPolicy defaults invalid severity to warning", () => {
  const policy = resolveDuplicationMaximumPolicy({
    maximum: { enabled: true, severity: "loud", percentage: 3 },
  });
  assert.equal(policy.severity, "warning");
});

test("resolveDuplicationMaximumPolicy treats legacy maxPercentage as warning", () => {
  const policy = resolveDuplicationMaximumPolicy({ maxPercentage: 3.0 });
  assert.equal(policy.enabled, true);
  assert.equal(policy.severity, "warning");
  assert.equal(policy.percentage, 3.0);
  assert.equal(policy.legacy, true);
});

test("resolveDuplicationMaximumPolicy prefers maximum over legacy maxPercentage", () => {
  const policy = resolveDuplicationMaximumPolicy({
    maxPercentage: 5,
    maximum: { enabled: false, percentage: 3 },
  });
  assert.equal(policy.enabled, false);
  assert.equal(policy.percentage, 3);
  assert.notEqual(policy.legacy, true);
});

test("evaluateDuplicationMaximum produces no finding when disabled", () => {
  const out = makeOut();
  evaluateDuplicationMaximum(7.5, { enabled: false, severity: "warning", percentage: 3 }, out);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.warnings.length, 0);
});

test("evaluateDuplicationMaximum produces no finding when current is at or below limit", () => {
  const out = makeOut();
  evaluateDuplicationMaximum(2.5, { enabled: true, severity: "warning", percentage: 3 }, out);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.warnings.length, 0);
});

test("evaluateDuplicationMaximum emits warning when current is above max and severity is warning", () => {
  const out = makeOut();
  evaluateDuplicationMaximum(7.5, { enabled: true, severity: "warning", percentage: 3 }, out);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.warnings.length, 1);
  const w = out.warnings[0];
  assert.equal(w.type, "duplication-over-maximum");
  assert.equal(w.severity, "warning");
  assert.equal(w.current, 7.5);
  assert.equal(w.maximum, 3);
});

test("evaluateDuplicationMaximum emits blocking when severity is blocking", () => {
  const out = makeOut();
  evaluateDuplicationMaximum(7.5, { enabled: true, severity: "blocking", percentage: 3 }, out);
  assert.equal(out.warnings.length, 0);
  assert.equal(out.regressions.length, 1);
  const r = out.regressions[0];
  assert.equal(r.type, "duplication-over-maximum");
  assert.equal(r.severity, "blocking");
});

test("evaluateDuplicationMaximum skips when percentage is null", () => {
  const out = makeOut();
  evaluateDuplicationMaximum(7.5, { enabled: true, severity: "warning", percentage: null }, out);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.warnings.length, 0);
});

test("evaluateDuplicationRatchet blocks an increase against baseline", () => {
  const out = makeOut();
  evaluateDuplicationRatchet(8.5, 8.0, { allowIncrease: false }, out);
  assert.equal(out.regressions.length, 1);
  const r = out.regressions[0];
  assert.equal(r.type, "duplication-increase");
  assert.equal(r.severity, "blocking");
  assert.equal(r.baseline, 8.0);
  assert.equal(r.current, 8.5);
});

test("evaluateDuplicationRatchet does not block when allowIncrease is true", () => {
  const out = makeOut();
  evaluateDuplicationRatchet(8.5, 8.0, { allowIncrease: true }, out);
  assert.equal(out.regressions.length, 0);
});

test("evaluateDuplicationRatchet emits info when duplication decreases", () => {
  const out = makeOut();
  evaluateDuplicationRatchet(7.5, 8.0, { allowIncrease: false }, out);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.infos.length, 1);
  assert.equal(out.infos[0].type, "duplication-improved");
});

test("evaluateDuplicationRatchet stays silent when within EPSILON of baseline", () => {
  const out = makeOut();
  evaluateDuplicationRatchet(8.0001, 8.0, { allowIncrease: false }, out);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.infos.length, 0);
});

test("duplicationNoBaselineFinding reports the current percentage", () => {
  const finding = duplicationNoBaselineFinding(7.5);
  assert.equal(finding.type, "duplication-no-baseline");
  assert.equal(finding.severity, "warning");
  assert.equal(finding.current, 7.5);
  assert.match(finding.message, /7\.50%/);
});
