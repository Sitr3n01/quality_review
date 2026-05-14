#!/usr/bin/env bash
# install-or-sync.sh
#
# Mirror the quality-gate skill files between .claude/skills and .agents/skills.
#
# Use cases:
#   - First-time install: only one of the two skill directories exists; this script
#     creates the other by copying files over.
#   - Drift detection: both exist; this script reports any divergent files (does
#     not overwrite without confirmation).
#
# Safety:
#   - Never silently overwrites a divergent file. Use --force to apply.
#   - Never touches files outside the two skill directories.
#   - Works in bash (Linux, macOS, WSL, git bash on Windows).
#
# Usage:
#   bash install-or-sync.sh [--force] [--verbose]

set -euo pipefail

FORCE=0
VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --verbose) VERBOSE=1 ;;
    -h|--help)
      sed -n '1,30p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

# Resolve repo root by climbing until we find one of the two skill directories.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
while [ "$REPO_ROOT" != "/" ]; do
  if [ -d "$REPO_ROOT/.claude/skills/quality-gate" ] || [ -d "$REPO_ROOT/.agents/skills/quality-gate" ]; then
    break
  fi
  REPO_ROOT="$(dirname "$REPO_ROOT")"
done

CLAUDE_DIR="$REPO_ROOT/.claude/skills/quality-gate"
AGENTS_DIR="$REPO_ROOT/.agents/skills/quality-gate"

if [ ! -d "$CLAUDE_DIR" ] && [ ! -d "$AGENTS_DIR" ]; then
  echo "Neither $CLAUDE_DIR nor $AGENTS_DIR exists. Nothing to sync."
  exit 1
fi

# Pick the source (whichever exists; if both exist, prefer the one with more files).
if [ -d "$CLAUDE_DIR" ] && [ ! -d "$AGENTS_DIR" ]; then
  SRC="$CLAUDE_DIR"; DST="$AGENTS_DIR"
elif [ ! -d "$CLAUDE_DIR" ] && [ -d "$AGENTS_DIR" ]; then
  SRC="$AGENTS_DIR"; DST="$CLAUDE_DIR"
else
  CLAUDE_COUNT=$(find "$CLAUDE_DIR" -type f | wc -l | tr -d ' ')
  AGENTS_COUNT=$(find "$AGENTS_DIR" -type f | wc -l | tr -d ' ')
  if [ "$CLAUDE_COUNT" -ge "$AGENTS_COUNT" ]; then
    SRC="$CLAUDE_DIR"; DST="$AGENTS_DIR"
  else
    SRC="$AGENTS_DIR"; DST="$CLAUDE_DIR"
  fi
fi

echo "Source : $SRC"
echo "Target : $DST"
echo

mkdir -p "$DST"

CREATED=0
UPDATED=0
DIVERGENT=0
SKIPPED=0

# Files that are intentionally divergent between the two skill mirrors.
# Each side has its own runtime-specific content (Claude Code/Desktop vs
# Codex). The script verifies BOTH versions exist but does not try to
# overwrite one with the other.
INTENTIONALLY_DIVERGENT=(
  "SKILL.md"
  "references/runtime-detection.md"
)

is_intentionally_divergent() {
  local needle="$1"
  for f in "${INTENTIONALLY_DIVERGENT[@]}"; do
    [ "$needle" = "$f" ] && return 0
  done
  return 1
}

INTENTIONAL=0

while IFS= read -r -d '' src_file; do
  rel="${src_file#$SRC/}"
  # Skip Codex-only files when copying into .claude/.
  if [ "$DST" = "$CLAUDE_DIR" ] && [ "$rel" = "agents/openai.yaml" ]; then
    [ $VERBOSE -eq 1 ] && echo "Skipping Codex-only file: $rel"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  dst_file="$DST/$rel"
  # Intentionally divergent: only verify the counterpart exists.
  if is_intentionally_divergent "$rel"; then
    if [ -f "$dst_file" ]; then
      [ $VERBOSE -eq 1 ] && echo "  intentionally divergent (counterpart exists): $rel"
      INTENTIONAL=$((INTENTIONAL + 1))
    else
      echo "  MISSING counterpart for intentionally-divergent file: $rel"
      DIVERGENT=$((DIVERGENT + 1))
    fi
    continue
  fi
  if [ ! -f "$dst_file" ]; then
    mkdir -p "$(dirname "$dst_file")"
    cp "$src_file" "$dst_file"
    echo "  created: $rel"
    CREATED=$((CREATED + 1))
  elif ! cmp -s "$src_file" "$dst_file"; then
    if [ $FORCE -eq 1 ]; then
      cp "$src_file" "$dst_file"
      echo "  updated: $rel"
      UPDATED=$((UPDATED + 1))
    else
      echo "  DIVERGENT (use --force to apply): $rel"
      DIVERGENT=$((DIVERGENT + 1))
    fi
  else
    [ $VERBOSE -eq 1 ] && echo "  ok: $rel"
  fi
done < <(find "$SRC" -type f -print0)

echo
echo "Summary (intra-skill mirror):"
echo "  created                  : $CREATED"
echo "  updated                  : $UPDATED"
echo "  divergent (unexpected)   : $DIVERGENT"
echo "  intentionally divergent  : $INTENTIONAL"
echo "  skipped (Codex-only)     : $SKIPPED"

# ---- Structural check: Claude-only template assets outside the skill dir ----
#
# These live outside .claude/skills/quality-gate/ and are Claude-only — there
# is no Codex mirror to compare against. We just verify they exist so the
# canonical template stays intact.

CLAUDE_TEMPLATE_FILES=(
  ".claude/commands/quality-gate.md"
  ".claude/agents/quality-explainer.md"
  ".claude/agents/quality-fixer.md"
)

MISSING=0
echo
echo "Structural check (Claude-only template assets):"
for rel in "${CLAUDE_TEMPLATE_FILES[@]}"; do
  if [ -f "$REPO_ROOT/$rel" ]; then
    [ $VERBOSE -eq 1 ] && echo "  ok: $rel"
  else
    echo "  MISSING: $rel"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -gt 0 ]; then
  echo
  echo "Missing Claude template assets: $MISSING"
  echo "These files are required for /quality-gate to register as a slash"
  echo "command and for the runtime-aware subagents to be available."
fi

if [ $DIVERGENT -gt 0 ] && [ $FORCE -eq 0 ]; then
  echo
  echo "There are divergent files. Review them and re-run with --force to apply."
  exit 1
fi

if [ $MISSING -gt 0 ]; then
  exit 1
fi
