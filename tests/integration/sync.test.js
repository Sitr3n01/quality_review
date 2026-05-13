const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("Claude and Codex skill mirrors are synchronized", () => {
  const result = spawnSync("bash", [".agents/skills/quality-gate/scripts/install-or-sync.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /divergent\s+:\s+0/);
});

test("required workflow and prompt files exist", () => {
  for (const rel of [
    ".github/workflows/ci.yml",
    ".github/workflows/quality-gate.yml",
    ".github/workflows/codex-quality-explainer.yml",
    ".github/workflows/claude-quality-assistant.yml",
    ".github/prompts/codex-quality-explainer.md",
    ".github/prompts/claude-quality-explainer.md",
    ".github/prompts/ai-review-policy.md",
    ".agent/rules/quality-gate.md",
    "GEMINI.md",
    "tests/run-node-tests.js",
  ]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), rel)), true, rel);
  }
});
