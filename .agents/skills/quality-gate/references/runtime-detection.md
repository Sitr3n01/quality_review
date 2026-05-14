# Runtime detection (Codex side)

The `quality-gate` skill ships for **two agent runtimes** that share the
template repository:

- **Codex (OpenAI Agents SDK)** — this side, `.agents/skills/quality-gate/`.
- **Claude (Claude Code / Claude Desktop)** — mirror at
  `.claude/skills/quality-gate/`.

The deterministic part of the gate is identical in both runtimes. **Only
the assistant's delegation behavior differs**.

## Required first step

Before any other tool call, run:

```
echo "RUNTIME=codex BASE_URL=${OPENAI_BASE_URL:-unset}"
```

Codex sandboxes always behave like a single-agent workflow: there is no
`Task` / `Agent` delegation surface. Treat every flow as sequential.

## Behavior

- Use `read_file`, `apply_patch`, `shell` (when the sandbox allows it),
  and the tools exposed by the Codex action.
- Do **not** assume parity with Claude Code's subagent ecosystem.
- The GitHub Actions workflow `codex-quality-explainer.yml` runs with
  `sandbox: read-only` and `safety-strategy: drop-sudo`. Respect that.

## Why this matters

The skill's hard rule is "do not silence failing signals". A delegation
that silently failed because the runtime does not support `Task` looks
identical to a deterministic check that genuinely passed. By detecting
the runtime up front, the assistant works sequentially and surfaces
every failing signal honestly.

## Out of scope here

This document only governs **how the assistant uses tools**. It does not
change:

- the deterministic checks (`npm run quality:check` is identical everywhere),
- the GitHub Actions workflows,
- the policy in `references/ai-review-policy.md` (AI is always advisory).
