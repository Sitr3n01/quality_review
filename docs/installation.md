# Installation

The recommended install is **local-first**. Claude Code can load this
repository as a local plugin marketplace from your filesystem, so the skill
does not need to be hosted by OpenAI or Anthropic. GitHub is only a convenient
optional source.

Below, `/path/to/quality_review` is a placeholder — substitute it for the
absolute path where you cloned this repository.

| Your goal | Command |
|---|---|
| **Claude Code plugin from this PC** | `claude plugin marketplace add "/path/to/quality_review" --scope user` then `claude plugin install quality-gate@quality-gate --scope user` |
| **Full local project install** | `bash scripts/install-into.sh /path/to/target` from this repo |
| **Codex skill only** | `curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh \| bash` |
| **Codex full install** | `curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh \| bash -s -- --full` |

After install in any new project, seed the baseline once on `main`:

```bash
git switch main
npm run quality:baseline
git commit quality/baseline.json -m "chore(quality): seed baseline"
```

## Option A: local Claude Code plugin (recommended)

One-time setup that exposes the skill in **every project** without copying it
into each project's `.claude/` directory. The marketplace source is your local
checkout:

```bash
claude plugin marketplace add "/path/to/quality_review" --scope user
claude plugin install quality-gate@quality-gate --scope user
```

Restart Claude Code or run `/reload-plugins` after installing. The plugin is
cached by Claude Code from your local path; the skill content is not hosted by
OpenAI or Anthropic.

Available slash commands in every project after install:

| Slash | What it does |
|---|---|
| `/quality-gate:check` | Run `npm run quality:preflight` locally and explain readiness |
| `/quality-gate:install` | Set up the gate in the current repo (scripts, workflows, config) |
| `/quality-gate:explain` | Read `reports/quality-gate.json` and explain what's blocking |
| `/quality-gate:fix` | Apply the minimum patch that makes the gate pass legitimately |
| `/quality-gate:baseline` | Initialize / refresh `quality/baseline.json` on `main` (guarded) |

For users who already have the skill copied into their project's
`.claude/skills/quality-gate/` (the pre-plugin era), `/quality-gate` (no
namespace) continues to work as a monolithic fallback.

The plugin also installs two subagents (`quality-explainer`,
`quality-fixer`) for Anthropic-capable runtimes; see
[`.claude/agents/`](../.claude/agents) for tool surfaces and model pins.

## Option B: full local project install

If `/plugin` is unavailable, or you want the gate's files committed directly
into the target repo, run the bundled installer from this local checkout:

```bash
bash scripts/install-into.sh /path/to/target [--dry-run] [--force]
```

The installer is **additive**:

- Copies the Claude and Codex skills, slash command, subagents, GitHub
  workflows, prompts, and deterministic scripts.
- **Preserves** an existing `quality/quality-gate.config.cjs` and
  `quality/baseline.json` in the target; it never overwrites project policy.
- Prints a `package.json` snippet for you to merge.
- Supports `--dry-run` (list-only) and `--force` (overwrite divergent files).

## Option C: GitHub plugin source (optional)

If you prefer to load the marketplace from your GitHub repo instead of a local
path:

```text
/plugin marketplace add Sitr3n01/quality_review
/plugin install quality-gate@quality-gate
/reload-plugins
```

This still uses your repository as the source; OpenAI and Anthropic do not host
the skill files.

## Option D: Codex one-liner

From inside the target project:

```bash
curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh | bash
```

Or targeting an explicit path (good for scripted setup):

```bash
curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh \
  | bash -s -- /path/to/target
```

This drops `.agents/skills/quality-gate/` into the target project. Codex
auto-discovers the skill on the next session.

To install the full deterministic gate into the current project:

```bash
curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh \
  | bash -s -- --full
```

Or target an explicit path:

```bash
curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh \
  | bash -s -- /path/to/target --full
```

### Codex auto-invoke from a configured project

If Codex is already configured for the project and the skill files are
present, you can also describe the task in natural language (for
example, "run the quality gate") and Codex will use implicit invocation
via `.agents/skills/quality-gate/agents/openai.yaml`.

## Option E: via Google Antigravity

Open this repository as a workspace in Antigravity. The project includes shared
agent rules in `AGENTS.md`, an Antigravity-specific entry point in `GEMINI.md`,
and a focused workspace rule in `.agent/rules/quality-gate.md`.

Ask the agent to "run the Quality Gate" or "fix the deterministic quality gate"
and it should use those rules before touching CI/CD, baseline, coverage,
duplication, audit, or quality automation files.

For full manual control, copy the following top-level paths into your
project instead:

```
.claude/skills/quality-gate/
.claude/commands/quality-gate.md
.claude/agents/quality-explainer.md
.claude/agents/quality-fixer.md
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
.agents/skills/quality-gate/
.agent/rules/quality-gate.md
.github/workflows/
.github/prompts/
.jscpd.json
eslint.complexity.config.cjs
quality/
scripts/quality/
reports/
tests/quality/
AGENTS.md
CLAUDE.md
GEMINI.md
```

Then merge/adapt the quality scripts into your own `package.json`:

```json
{
  "scripts": {
    "quality:report":    "node scripts/quality/quality-gate.js report",
    "quality:check":     "node scripts/quality/quality-gate.js check",
    "quality:baseline":  "node scripts/quality/quality-gate.js baseline",
    "quality:comment":   "node scripts/quality/render-pr-comment.js",
    "quality:validate":  "node scripts/quality/validate-config.js",
    "quality:explainer-context": "node scripts/quality/run-explainer-context.js",
    "quality:preflight": "node scripts/quality/run-local-preflight.js",
    "quality:hybrid-report": "node scripts/quality/hybrid-report.js",
    "audit:report":      "node scripts/quality/run-audit-report.js",
    "complexity:ci":     "node scripts/quality/run-complexity-report.js",
    "lint":              "eslint .",
    "duplication:ci":    "jscpd --config .jscpd.json --noTips ."
  }
}
```

Also add a `test:coverage:ci` script that matches the target project's test
runner and writes `coverage/coverage-summary.json` or
`coverage/coverage-final.json`. Do not blindly pass coverage flags through
`npm run test` when that script wraps Turbo or another task runner.

Examples:

```json
{
  "scripts": {
    "test:coverage:ci": "vitest run --coverage --coverage.reporter=json-summary"
  }
}
```

```json
{
  "scripts": {
    "test:coverage:ci": "jest --coverage --coverageReporters=json-summary"
  }
}
```

Add the deterministic tool dependencies too:

```json
{
  "devDependencies": {
    "@eslint/js": "9.39.4",
    "c8": "10.1.3",
    "eslint": "9.39.4",
    "globals": "17.6.0",
    "jscpd": "4.1.1"
  }
}
```

Finally, on the `main` branch, initialize the baseline:

```bash
npm run quality:baseline
git add quality/baseline.json
git commit -m "chore(quality): initialize quality gate baseline"
```

From this point on, every pull request is compared against this baseline.
Before pushing a branch, run `npm run quality:preflight` locally to verify
each producer and the deterministic gate with the same signals GitHub will
consume.
