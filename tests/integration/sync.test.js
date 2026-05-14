const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runBash(script) {
  return spawnSync("bash", ["-s"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: script,
    shell: false,
  });
}

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
  const skillPaths = Array.isArray(plugin.skills) ? plugin.skills : [plugin.skills];
  for (const skillPath of skillPaths) {
    assert.match(skillPath, /^\.\//, `plugin skill path must be relative: ${skillPath}`);
  }
  assert.equal(plugin.commands, "./.claude/commands");
  assert.ok(Array.isArray(plugin.agents), "plugin agents must list explicit agent files");
  for (const agentPath of plugin.agents) {
    assert.match(agentPath, /^\.\//, `plugin agent path must be relative: ${agentPath}`);
    assert.match(agentPath, /\.md$/, `plugin agent path must point to a Markdown agent file: ${agentPath}`);
    assert.equal(fs.existsSync(path.join(process.cwd(), agentPath)), true, agentPath);
  }

  const claudeVersion = spawnSync("claude", ["--version"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  if (!claudeVersion.error && claudeVersion.status === 0) {
    const validation = spawnSync("claude", ["plugin", "validate", ".claude-plugin/plugin.json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
    });
    assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  }

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
  const syntax = spawnSync("bash", ["-n", rel], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
});

test("full installer creates Claude and Codex assets while preserving baseline", () => {
  const result = runBash(`
    set -euo pipefail
    tmp="$(mktemp -d)"
    trap 'rm -rf "\${tmp}"' EXIT
    mkdir -p "\${tmp}/quality"
    printf '{"scripts":{}}\\n' > "\${tmp}/package.json"
    printf '{"sentinel":true}\\n' > "\${tmp}/quality/baseline.json"

    bash scripts/install-into.sh "\${tmp}" --dry-run > "\${tmp}/dry-run.out"
    grep -q "\\[4/9\\] .agents/skills/quality-gate/" "\${tmp}/dry-run.out"

    bash scripts/install-into.sh "\${tmp}" > "\${tmp}/install.out"
    test -f "\${tmp}/.claude/skills/quality-gate/SKILL.md"
    test -f "\${tmp}/.claude/commands/quality-gate.md"
    test -f "\${tmp}/.agents/skills/quality-gate/SKILL.md"
    test -f "\${tmp}/scripts/quality/quality-gate.js"
    test -f "\${tmp}/.jscpd.json"
    test -f "\${tmp}/eslint.complexity.config.cjs"
    test -f "\${tmp}/quality/quality-gate.config.cjs"
    grep -q '"sentinel":true' "\${tmp}/quality/baseline.json"
    grep -q '"duplication:ci"' "\${tmp}/install.out"
    grep -q '"quality:preflight"' "\${tmp}/install.out"
    grep -q '"jscpd": "4.1.1"' "\${tmp}/install.out"
    grep -q "test:coverage:ci" "\${tmp}/install.out"
  `);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("Codex installer dry-runs skill-only and full modes", () => {
  const result = runBash(`
    set -euo pipefail
    tmp="$(mktemp -d)"
    trap 'rm -rf "\${tmp}"' EXIT

    bash scripts/install-codex.sh "\${tmp}" --dry-run --ref=test-ref > "\${tmp}/skill.out"
    grep -q "ref 'test-ref'" "\${tmp}/skill.out"
    grep -q ".agents/skills/quality-gate" "\${tmp}/skill.out"
    if grep -q "main branch" "\${tmp}/skill.out"; then
      echo "dry-run incorrectly mentions main branch" >&2
      exit 1
    fi

    bash scripts/install-codex.sh "\${tmp}" --dry-run --full --ref=test-ref > "\${tmp}/full.out"
    grep -q "ref 'test-ref'" "\${tmp}/full.out"
    grep -q "full installer" "\${tmp}/full.out"
    grep -q "install-into.sh" "\${tmp}/full.out"
  `);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
