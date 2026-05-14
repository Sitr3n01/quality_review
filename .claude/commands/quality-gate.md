---
description: Run the deterministic quality gate (install, check, explain, fix, baseline). Project-scoped fallback — if you installed the plugin (`/plugin install quality-gate@quality-gate`), prefer the namespaced slashes `/quality-gate:check`, `/quality-gate:install`, `/quality-gate:explain`, `/quality-gate:fix`, `/quality-gate:baseline` instead.
---

> **Note**: this is the monolithic project-scoped slash that dispatches by argument. If you have the Claude Code plugin installed (`/plugin install quality-gate@quality-gate`), prefer the focused namespaced slashes:
> `/quality-gate:check`, `/quality-gate:install`, `/quality-gate:explain`, `/quality-gate:fix`, `/quality-gate:baseline`.

Invoke the `quality-gate` skill.

**Read `.claude/skills/quality-gate/SKILL.md` first** and follow its
"Runtime detection (do this first)" block before any other tool call.
That block decides whether you may delegate to `Task` / `Agent`
subagents (Claude Desktop / Anthropic terminal) or must work
sequentially (custom-provider terminal like DeepSeek/OpenRouter).

After detection, choose the mode that matches the user's request:

- **Install** — set up the gate in this repo.
- **Check** — run `npm run quality:check` and report.
- **Explain** — read `reports/quality-gate.json` and explain the verdict.
- **Fix** — minimal patch to make the gate legitimately pass.
- **Baseline** — only on `main`, with explicit user confirmation.

If the user passed an argument, treat it as a mode hint or a question.

User argument (if any): $ARGUMENTS
