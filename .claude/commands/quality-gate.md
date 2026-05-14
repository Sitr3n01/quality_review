---
description: Run the deterministic quality gate (install, check, explain, fix, baseline).
---

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
