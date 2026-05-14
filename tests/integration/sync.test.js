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

test("Claude Code plugin manifest and marketplace catalog exist", () => {
  for (const rel of [
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
  ]) {
    assert.equal(
      fs.existsSync(path.join(process.cwd(), rel)),
      true,
      `${rel} is required for /plugin marketplace add + /plugin install`,
    );
  }

  const plugin = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), ".claude-plugin/plugin.json"), "utf8"),
  );
  assert.equal(plugin.name, "quality-gate");
  assert.ok(plugin.version, "plugin.json must declare a version");
  assert.ok(
    Array.isArray(plugin.skills) || typeof plugin.skills === "string",
    "plugin.json must declare a skills path",
  );

  const market = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), ".claude-plugin/marketplace.json"), "utf8"),
  );
  assert.equal(market.name, "quality-gate");
  assert.ok(Array.isArray(market.plugins) && market.plugins.length > 0, "marketplace must list at least one plugin");
  const entry = market.plugins.find((p) => p.name === "quality-gate");
  assert.ok(entry, "marketplace must list the quality-gate plugin");
  assert.ok(entry.source, "marketplace entry must declare a source");
});

test("Focused mode skills exist under .claude/skills/quality-gate-modes/", () => {
  for (const mode of ["check", "install", "explain", "fix", "baseline"]) {
    const rel = `.claude/skills/quality-gate-modes/${mode}/SKILL.md`;
    assert.equal(
      fs.existsSync(path.join(process.cwd(), rel)),
      true,
      `${rel} powers /quality-gate:${mode} via the plugin`,
    );
  }
});

test("Codex one-liner installer script exists and is parseable bash", () => {
  const rel = "scripts/install-codex.sh";
  const abs = path.join(process.cwd(), rel);
  assert.equal(fs.existsSync(abs), true, `${rel} provides the Codex install path`);
  const content = fs.readFileSync(abs, "utf8");
  assert.match(content, /^#!\/usr\/bin\/env bash/, "script must start with bash shebang");
  assert.match(content, /set -euo pipefail/, "script must use strict bash flags");
});
