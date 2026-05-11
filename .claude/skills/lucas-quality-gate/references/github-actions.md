# GitHub Actions guidance

This document covers the workflows shipped with the skill and the reasoning behind each design choice.

## Workflow files

- `.github/workflows/ci.yml` — install + lint + test on every push and PR.
- `.github/workflows/quality-gate.yml` — coverage + duplication + ratchet + sticky PR comment. The blocking workflow.
- `.github/workflows/codex-quality-explainer.yml` — opt-in Codex narrative explanation, triggered by label or manual dispatch.
- `.github/workflows/claude-quality-assistant.yml` — opt-in Claude narrative explanation, triggered by comment or manual dispatch.

## Required secrets

If you enable the AI explainer workflows, add these as repo secrets:

- `OPENAI_API_KEY` for the Codex action.
- `ANTHROPIC_API_KEY` for the Claude action.

The deterministic workflows (`ci.yml`, `quality-gate.yml`) need no secrets. They should run on every PR.

## Permissions

Use the **least privilege** principle:

```
permissions:
  contents: read           # to checkout
  pull-requests: write     # to post sticky PR comments
  issues: write            # PR comments live on the issue API
```

Never use `permissions: write-all`. Never grant `contents: write` to a workflow that runs untrusted code.

## Why not pull_request_target

`pull_request_target` runs with the base branch's secrets and permissions. It is tempting because it lets you post PR comments on PRs from forks. It is also a famous source of compromise — a malicious fork PR can exfiltrate secrets or alter the base.

The shipped workflows use `pull_request`, which means:

- forks cannot read secrets from your repo (good);
- forks **cannot post PR comments** automatically (acceptable trade-off);
- the AI explainer workflows are opt-in via label or manual dispatch, run only after a maintainer has triaged the PR.

If you need automated PR comments on fork PRs, set up a separate, carefully scoped `pull_request_target` workflow that only reads from `${{ github.event.pull_request.head.sha }}` and never executes code from the fork. Be explicit and intentional.

## Sticky PR comments

The `quality-gate.yml` workflow posts a comment with the HTML marker:

```
<!-- lucas-quality-gate-comment -->
```

On each run, it:

1. lists the existing PR comments;
2. finds the one containing the marker (if any);
3. updates it in place — or creates a new one if absent.

This keeps the PR clean. A 50-commit PR has exactly **one** quality-gate comment, always reflecting the latest state.

## `continue-on-error` discipline

The skill uses `continue-on-error: true` carefully:

- Generating the ESLint JSON report has it (the report is informational; absence of the report becomes a warning downstream).
- Generating the JSCPD report has it (same reasoning).
- `npm run quality:check` has it **only so the workflow can keep going** to post the comment and upload artifacts. The final step then **fails the job explicitly** based on `steps.quality_gate.outcome`.

Never set `continue-on-error: true` on the *last* step that determines the job result. That hides the failure.

## Artifacts

The workflow uploads `reports/` and `coverage/` as artifacts on every run. This makes failure post-mortems easy: download the artifact, see exactly what the gate saw.

## Concurrency

Use:

```
concurrency:
  group: quality-gate-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

so that pushing a new commit cancels the in-flight gate run instead of stacking them up.

## Codex explainer specifics

`openai/codex-action@v1` runs with `sandbox: read-only` by default in this skill. Codex can read the repo, the reports, and the diff, but cannot modify files. This prevents prompt injection from a PR description from causing Codex to push changes.

If you want a Codex *fix* workflow (where Codex can patch the code), create a **separate** workflow with `workflow_dispatch` only and document the risks. Do not extend the explainer.

## Claude explainer specifics

`anthropics/claude-code-action@v1` is given a prompt that explicitly forbids edits:

```
Do not edit files.
Do not approve or reject the PR.
Do not update baseline.
Do not weaken quality checks.
```

Even with these instructions, the workflow does not grant the action `contents: write`. Treat the prompt as a defense in depth, not the only defense.

## Action version pinning

The shipped workflows reference `@v1` for AI actions and `@v4` for first-party actions. Consider pinning to a specific SHA in security-sensitive repos to mitigate supply-chain risk:

```
uses: openai/codex-action@<full-40-char-sha>
```

Document why you pinned and when you reviewed the upstream.

## Fork-PR safety summary

| Workflow | Trigger | Runs untrusted code? | Has secrets? |
|---|---|---|---|
| `ci.yml` | `pull_request` | yes (the build) | no |
| `quality-gate.yml` | `pull_request` | yes (the build) | no |
| `codex-quality-explainer.yml` | `workflow_dispatch` or labeled | gated by maintainer | yes (OpenAI) |
| `claude-quality-assistant.yml` | comment or dispatch | gated by maintainer | yes (Anthropic) |

The AI workflows never auto-run on fork PRs. A maintainer must label or dispatch them.
