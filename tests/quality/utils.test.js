const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  safeNumber,
  formatPercent,
  formatDelta,
  normalizePath,
  globToRegex,
  matchGlob,
  isMainLikeBranch,
} = require("../../scripts/quality/utils");

test("safeNumber returns null for non-finite values", () => {
  assert.equal(safeNumber(null), null);
  assert.equal(safeNumber(undefined), null);
  assert.equal(safeNumber("not a number"), null);
  assert.equal(safeNumber(NaN), null);
  assert.equal(safeNumber(Infinity), null);
});

test("safeNumber preserves numeric input", () => {
  assert.equal(safeNumber(0), 0);
  assert.equal(safeNumber(3.14), 3.14);
  assert.equal(safeNumber("42"), 42);
});

test("formatPercent prints n/a for null", () => {
  assert.equal(formatPercent(null), "n/a");
  assert.equal(formatPercent(undefined), "n/a");
});

test("formatPercent appends percent sign with fixed digits", () => {
  assert.equal(formatPercent(42.1234), "42.12%");
  assert.equal(formatPercent(0), "0.00%");
});

test("formatDelta adds sign for positive values", () => {
  assert.equal(formatDelta(2.5), "+2.50");
  assert.equal(formatDelta(-1.25), "-1.25");
  assert.equal(formatDelta(0), "0.00");
  assert.equal(formatDelta(null), "n/a");
});

test("normalizePath converts backslashes to forward", () => {
  assert.equal(normalizePath("src\\foo\\bar.js"), "src/foo/bar.js");
  assert.equal(normalizePath("already/normal.js"), "already/normal.js");
});

test("globToRegex handles ** for cross-directory match", () => {
  const re = globToRegex("src/**/*.ts");
  assert.ok(re.test("src/a.ts"));
  assert.ok(re.test("src/foo/bar.ts"));
  assert.ok(re.test("src/deep/nested/x.ts"));
  assert.ok(!re.test("other/a.ts"));
  assert.ok(!re.test("src/foo.js"));
});

test("globToRegex handles single * within a segment", () => {
  const re = globToRegex("src/*.ts");
  assert.ok(re.test("src/foo.ts"));
  assert.ok(!re.test("src/sub/foo.ts"));
});

test("matchGlob returns true if any pattern matches", () => {
  const patterns = ["src/**/*.ts", "**/*.cs"];
  assert.equal(matchGlob("src/a.ts", patterns), true);
  assert.equal(matchGlob("Assets/Player.cs", patterns), true);
  assert.equal(matchGlob("README.md", patterns), false);
});

test("isMainLikeBranch detects main/master/develop", () => {
  assert.equal(isMainLikeBranch("main"), true);
  assert.equal(isMainLikeBranch("master"), true);
  assert.equal(isMainLikeBranch("develop"), true);
  assert.equal(isMainLikeBranch("feature/foo"), false);
  assert.equal(isMainLikeBranch(null), false);
  assert.equal(isMainLikeBranch(""), false);
});
