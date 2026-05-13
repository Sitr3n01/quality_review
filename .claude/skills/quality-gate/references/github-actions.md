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
<!-- quality-gate-comment -->
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

## Explainer context is generated locally

The AI explainer workflows (`codex-quality-explainer.yml`,
`claude-quality-assistant.yml`) used to attempt
`actions/download-artifact@v4` to fetch `quality-gate-report` from a
sibling run. That is fragile because `download-artifact` looks at the
*current* run by default, and the explainer is triggered by labels,
comments, or manual dispatch — distinct from the `pull_request` run that
produces the gate artifact.

The shipped workflows now generate their own deterministic context in
each run via `npm run quality:explainer-context`. That script:

- runs `quality:validate`, `audit:report`, `eslint` (JSON), `lint`,
  `test:coverage:ci`, `duplication:ci`, `complexity:ci`, and
  `quality:report` in sequence;
- never aborts the workflow if one command fails — it records the exit
  code in `reports/explainer/commands.ndjson` and continues so the AI has
  the maximum amount of context;
- always exits 0. The deterministic gate is owned by `quality-gate.yml`
  running `quality:check`, not by the explainer.

The explainer prompts read `reports/explainer/commands.ndjson` to surface
which underlying deterministic commands failed while preparing context —
without using those failures as justification to weaken any check.

## PR context resolution

The explainer workflows resolve the PR context up-front with a single
`actions/github-script@v7` step. Outputs:

| Output | Meaning |
|---|---|
| `is_pr` | `"true"` when the run targets a PR; `"false"` for ref-only dispatch |
| `number` | PR number when `is_pr == "true"` |
| `head_sha` | the head SHA to check out for a PR |
| `head_ref` | the head branch name |
| `head_repo` | the head repo full name (used for the fork check) |
| `base_ref` | the base branch |
| `safe` | `"true"` if the head repo matches the host repo or the run is a maintainer-triggered dispatch |

Events handled:

- `pull_request` (labeled/synchronize) — read `context.payload.pull_request` directly.
- `issue_comment` — call `github.rest.pulls.get` when the issue has a `pull_request` ref.
- `pull_request_review_comment` — call `github.rest.pulls.get` for the review comment's PR.
- `workflow_dispatch` — read the optional `pr_number` input and call `github.rest.pulls.get` when present.

When `safe != "true"` (fork PR via comment/label), the rest of the
workflow is skipped with a clear log line. Secrets are never exposed to
fork PRs.

## Workflow inputs

Both AI explainer workflows accept a `workflow_dispatch` input:

```yaml
workflow_dispatch:
  inputs:
    pr_number:
      description: "Optional PR number to explain."
      required: false
      type: string
    run_quality_context:
      description: "Generate fresh deterministic quality reports before invoking AI."
      required: false
      default: "true"
      type: choice
      options: ["true", "false"]
```

Use `pr_number` to explain an existing PR by number. Set
`run_quality_context: "false"` to skip the deterministic generation step,
which is only useful when you want to inspect prompt behavior without
running the underlying toolchain.

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
