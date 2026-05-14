#!/usr/bin/env bash
# install-into.sh
#
# Install the quality-gate template into a target project.
#
# Usage:
#   bash scripts/install-into.sh /path/to/target/project [--dry-run] [--force] [--verbose]
#
# Behavior:
#   - Copies the skill, slash command, subagents, GitHub workflows, prompts,
#     and deterministic scripts from this canonical template into the target.
#   - Additive: never overwrites quality/baseline.json or
#     quality/quality-gate.config.cjs when they already exist.
#   - Reports created / updated / preserved / divergent counts.
#   - --dry-run lists what would happen without writing.
#   - --force overwrites divergent files (except preserved policy files).
#
# Portability:
#   Pure bash. Works on Linux, macOS, WSL, and Git Bash on Windows.

set -euo pipefail

TARGET=""
DRY_RUN=0
FORCE=0
VERBOSE=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    --verbose) VERBOSE=1 ;;
    -h|--help)
      sed -n '1,22p' "$0"
      exit 0
      ;;
    -*)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
    *)
      if [ -z "$TARGET" ]; then
        TARGET="$arg"
      else
        echo "Only one positional argument (target path) is supported." >&2
        exit 2
      fi
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "Usage: bash scripts/install-into.sh /path/to/target [--dry-run] [--force] [--verbose]" >&2
  exit 2
fi

if [ ! -d "$TARGET" ]; then
  echo "Target directory does not exist: $TARGET" >&2
  exit 1
fi

# Resolve source = this repo root.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="$(cd "$TARGET" && pwd)"

if [ ! -f "$SRC/.claude/skills/quality-gate/SKILL.md" ]; then
  echo "Source does not look like a quality-gate template: $SRC" >&2
  echo "Expected .claude/skills/quality-gate/SKILL.md to exist." >&2
  exit 1
fi

if [ "$SRC" = "$TARGET" ]; then
  echo "Source and target are the same directory. Refusing to self-install." >&2
  exit 1
fi

echo "Source : $SRC"
echo "Target : $TARGET"
MODE="apply"
[ $DRY_RUN -eq 1 ] && MODE="dry-run"
[ $FORCE -eq 1 ]   && MODE="$MODE (force)"
echo "Mode   : $MODE"
echo

CREATED=0
UPDATED=0
PRESERVED=0
DIVERGENT=0

# copy_file <src> <dst> [preserve|overwrite]
#   - preserve : never overwrite an existing file at dst
#   - overwrite: replace if different and --force, else mark divergent
copy_file() {
  local src_file="$1"
  local dst_file="$2"
  local policy="${3:-overwrite}"

  if [ ! -f "$src_file" ]; then
    [ $VERBOSE -eq 1 ] && echo "  source missing: $src_file (skipping)"
    return 0
  fi

  local rel="${dst_file#$TARGET/}"

  if [ -f "$dst_file" ]; then
    if [ "$policy" = "preserve" ]; then
      echo "  preserved (already exists): $rel"
      PRESERVED=$((PRESERVED + 1))
      return 0
    fi
    if cmp -s "$src_file" "$dst_file"; then
      [ $VERBOSE -eq 1 ] && echo "  ok: $rel"
      return 0
    fi
    if [ $FORCE -eq 1 ]; then
      [ $DRY_RUN -eq 0 ] && cp "$src_file" "$dst_file"
      echo "  updated: $rel"
      UPDATED=$((UPDATED + 1))
    else
      echo "  DIVERGENT (use --force to apply): $rel"
      DIVERGENT=$((DIVERGENT + 1))
    fi
  else
    if [ $DRY_RUN -eq 0 ]; then
      mkdir -p "$(dirname "$dst_file")"
      cp "$src_file" "$dst_file"
    fi
    echo "  created: $rel"
    CREATED=$((CREATED + 1))
  fi
}

# copy_tree <src_dir> <dst_dir> [preserve|overwrite]
copy_tree() {
  local src_dir="$1"
  local dst_dir="$2"
  local policy="${3:-overwrite}"

  if [ ! -d "$src_dir" ]; then
    [ $VERBOSE -eq 1 ] && echo "  source dir missing: $src_dir (skipping)"
    return 0
  fi

  while IFS= read -r -d '' f; do
    local rel="${f#$src_dir/}"
    copy_file "$f" "$dst_dir/$rel" "$policy"
  done < <(find "$src_dir" -type f -print0)
}

# -----------------------------------------------------------------------------
# 1. Claude skill
echo "[1/8] .claude/skills/quality-gate/"
copy_tree "$SRC/.claude/skills/quality-gate" "$TARGET/.claude/skills/quality-gate"

# 2. Slash command (the load-bearing fix for /quality-gate visibility)
echo
echo "[2/8] .claude/commands/quality-gate.md"
copy_file "$SRC/.claude/commands/quality-gate.md" "$TARGET/.claude/commands/quality-gate.md"

# 3. Subagents (runtime-aware; only used in Anthropic-capable runtimes)
echo
echo "[3/8] .claude/agents/quality-*.md"
copy_file "$SRC/.claude/agents/quality-explainer.md" "$TARGET/.claude/agents/quality-explainer.md"
copy_file "$SRC/.claude/agents/quality-fixer.md"     "$TARGET/.claude/agents/quality-fixer.md"

# 4. Codex mirror — only if target opted into .agents/
echo
echo "[4/8] .agents/skills/quality-gate/ (only if target has .agents/)"
if [ -d "$TARGET/.agents" ]; then
  copy_tree "$SRC/.agents/skills/quality-gate" "$TARGET/.agents/skills/quality-gate"
else
  echo "  target has no .agents/ — skipping Codex mirror"
fi

# 5. GitHub workflows
echo
echo "[5/8] .github/workflows/"
copy_file "$SRC/.github/workflows/quality-gate.yml"             "$TARGET/.github/workflows/quality-gate.yml"
copy_file "$SRC/.github/workflows/codex-quality-explainer.yml"  "$TARGET/.github/workflows/codex-quality-explainer.yml"
copy_file "$SRC/.github/workflows/claude-quality-assistant.yml" "$TARGET/.github/workflows/claude-quality-assistant.yml"

# 6. Explainer prompts
echo
echo "[6/8] .github/prompts/"
copy_tree "$SRC/.github/prompts" "$TARGET/.github/prompts"

# 7. Deterministic scripts (the brains of the gate)
echo
echo "[7/8] scripts/quality/"
copy_tree "$SRC/scripts/quality" "$TARGET/scripts/quality"

# 8. Config (PRESERVE — never overwrite project policy).
#
# We deliberately do NOT copy quality/baseline.json. The template's baseline
# contains values specific to this canonical repo (its coverage %, its file
# paths, its complexity counts). Pushing those into a fresh target would
# cause the first `quality:check` to compare the target's code against
# unrelated metrics and report false regressions. The SKILL.md Install-mode
# contract is that a fresh baseline starts with nulls and is populated by
# `npm run quality:baseline` on `main` after install.
echo
echo "[8/8] quality/ (preserve existing config; baseline is seeded by the user later)"
copy_file "$SRC/quality/quality-gate.config.cjs" "$TARGET/quality/quality-gate.config.cjs" "preserve"
if [ -f "$TARGET/quality/baseline.json" ]; then
  echo "  preserved (already exists): quality/baseline.json"
  PRESERVED=$((PRESERVED + 1))
else
  echo "  baseline.json NOT copied — run 'npm run quality:baseline' on main to seed it"
fi

# -----------------------------------------------------------------------------
echo
echo "Summary:"
echo "  created   : $CREATED"
echo "  updated   : $UPDATED"
echo "  preserved : $PRESERVED  (existing config / baseline left alone)"
echo "  divergent : $DIVERGENT"

# -----------------------------------------------------------------------------
# package.json scripts — print snippet for manual merge.
# We deliberately do NOT mutate the target package.json: doing it safely
# requires a JSON parser and risks reordering / reformatting the user's file.
if [ -f "$TARGET/package.json" ]; then
  echo
  echo "package.json detected. Add these entries to \"scripts\" (preserving existing):"
  cat <<'EOF'
    "quality:report":            "node scripts/quality/quality-gate.js report",
    "quality:check":             "node scripts/quality/quality-gate.js check",
    "quality:baseline":          "node scripts/quality/quality-gate.js baseline",
    "quality:comment":           "node scripts/quality/render-pr-comment.js",
    "quality:validate":          "node scripts/quality/validate-config.js",
    "quality:explainer-context": "node scripts/quality/run-explainer-context.js",
    "audit:report":              "node scripts/quality/run-audit-report.js",
    "complexity:ci":             "node scripts/quality/run-complexity-report.js"
EOF
else
  echo
  echo "No package.json in target. The gate expects a Node project."
  echo "Initialize one with: npm init -y"
fi

echo
if [ $DIVERGENT -gt 0 ] && [ $FORCE -eq 0 ]; then
  echo "There are divergent files. Review them and re-run with --force to apply."
  exit 1
fi

if [ $DRY_RUN -eq 1 ]; then
  echo "Dry-run complete. Re-run without --dry-run to apply."
else
  echo "Install complete."
  echo
  echo "Next steps in the target project:"
  echo "  1. Merge the package.json snippet above."
  echo "  2. npm install   # ensure devDependencies (eslint, c8, jscpd) match"
  echo "  3. npm run quality:validate"
  echo "  4. npm run quality:report   # writes reports without comparing against baseline"
  echo "  5. git switch main && npm run quality:baseline   # seed the baseline from current code"
  echo "  6. git commit quality/baseline.json -m 'chore(quality): seed baseline'"
  echo "  7. Open the target with Claude Code and type '/quality-gate' — it must appear."
fi
