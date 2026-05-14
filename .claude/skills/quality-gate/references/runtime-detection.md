# Runtime detection

The `quality-gate` skill ships in a repository that is opened by **two
different Claude runtimes** that share the same `.claude/` directory:

- **Claude Desktop** — runs Anthropic models managed by the desktop app.
- **Claude Code terminal** — may be configured for any provider via
  `ANTHROPIC_BASE_URL` (Anthropic, DeepSeek, OpenRouter, Bedrock proxy, etc.).

The deterministic part of the gate (`npm run quality:*`, GitHub Actions)
is model-agnostic and runs identically everywhere. **Only the assistant's
own behavior changes per runtime**, specifically around delegating to
`Task` / `Agent` subagents.

## Required first step

Before any other tool call, run:

```
bash -lc 'echo "CLAUDECODE=${CLAUDECODE:-unset} BASE_URL=${ANTHROPIC_BASE_URL:-unset}"'
```

Read both values and classify the runtime using the table below.

## Classification

| `CLAUDECODE` | `ANTHROPIC_BASE_URL`              | Runtime                              |
|--------------|-----------------------------------|--------------------------------------|
| `unset`      | any                               | Claude Desktop                       |
| `1`          | `unset` or `*api.anthropic.com*`  | Claude Code terminal — Anthropic     |
| `1`          | other (DeepSeek, OpenRouter, ...) | Claude Code terminal — custom provider |

If `CLAUDECODE` happens not to be set by the user's CLI version, fall back
to the `ANTHROPIC_BASE_URL` row alone — it is the load-bearing signal for
subagent safety.

## Behavior per runtime

### Claude Desktop

- `Task` / `Agent` subagents: **allowed**.
- Prefer the `quality-explainer` and `quality-fixer` subagents in
  `.claude/agents/` for their respective modes — they have explicit
  `model:` declarations and minimal tool surfaces.
- Bash is available but the user may need to grant permission for each
  command.

### Claude Code terminal — Anthropic

- `Task` / `Agent` subagents: **allowed**.
- Same as Desktop, with full Bash access.

### Claude Code terminal — custom provider (DeepSeek, OpenRouter, ...)

- `Task` / `Agent` subagents: **avoid**. The terminal's configured
  subagent model is unlikely to match the names used in
  `.claude/agents/*.md` frontmatter; delegation will fail with errors
  like `model 'claude-sonnet-4-6' not available` or
  `model 'deepseek-v4-flash' does not exist`.
- Do **everything sequentially** with `Read`, `Grep`, `Glob`, `Bash`. The
  skill never *needs* a subagent — every flow can be expressed with
  direct tool calls.
- If the user explicitly asks to use a subagent, warn them once that the
  current runtime may reject the call, then attempt it and surface the
  exact error if it fails.

## Why this matters

The skill's hard rule is "do not silence failing signals" — that applies
to its own behavior too. A delegated `Task` that fails because the model
name is invalid is a **silent loss of signal** disguised as a runtime
error. By detecting the runtime up front, the assistant either:

- delegates correctly (Desktop / Anthropic), or
- announces the constraint and works sequentially (custom provider),

instead of failing mid-flow and confusing the user about whether the
problem is the gate, the skill, or the model.

## Out of scope here

This document only governs **which tools the assistant uses**. It does
not change:

- the deterministic checks (`npm run quality:check` is identical everywhere),
- the GitHub Actions workflows (they use their own action-managed models
  via `secrets.ANTHROPIC_API_KEY` / `secrets.OPENAI_API_KEY`),
- the policy in `references/ai-review-policy.md` (AI is always advisory).
