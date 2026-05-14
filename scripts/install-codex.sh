#!/usr/bin/env bash
# install-codex.sh — One-liner installer for Quality Gate on Codex
# (OpenAI Agents SDK). By default, drops .agents/skills/quality-gate/ into a
# target project. With --full, installs the complete deterministic gate.
#
# Usage (from anywhere — does not require cloning the repo):
#
#   curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh \
#     | bash -s -- /path/to/target/project
#
# Or from inside the target project (defaults TARGET to .):
#
#   curl -fsSL https://raw.githubusercontent.com/Sitr3n01/quality_review/main/scripts/install-codex.sh | bash
#
# Flags:
#   --dry-run    list what would be done without writing.
#   --full       install the complete gate (Claude/Codex skills, workflows,
#                prompts, scripts, and config) using scripts/install-into.sh
#                from the downloaded template archive.
#   --force      overwrite an existing .agents/skills/quality-gate/ directory.
#                In --full mode, passes --force to the full installer.
#   --ref=<ref>  fetch from a specific git ref instead of main (e.g., a release tag).

set -euo pipefail

TARGET=""
DRY_RUN=0
FULL=0
FORCE=0
REF="main"

# Parse args. We support GNU-style `--ref=foo` and the equivalent `--ref foo`.
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --full)    FULL=1; shift ;;
    --force)   FORCE=1; shift ;;
    --ref)     REF="${2:-main}"; shift 2 ;;
    --ref=*)   REF="${1#--ref=}"; shift ;;
    -h|--help)
      sed -n '1,22p' "$0"
      exit 0
      ;;
    -*)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
    *)
      if [ -z "$TARGET" ]; then
        TARGET="$1"
      else
        echo "Only one positional argument (target path) is supported." >&2
        exit 2
      fi
      shift
      ;;
  esac
done

TARGET="${TARGET:-.}"

if [ ! -d "$TARGET" ]; then
  echo "Target directory not found: $TARGET" >&2
  exit 1
fi

TARGET="$(cd "$TARGET" && pwd)"
DEST="$TARGET/.agents/skills/quality-gate"

if [ $FULL -eq 0 ] && [ -d "$DEST" ] && [ $FORCE -eq 0 ]; then
  echo "Refusing to overwrite existing $DEST" >&2
  echo "Re-run with --force to replace it, or back it up first." >&2
  exit 1
fi

echo "Target : $TARGET"
echo "Source : https://github.com/Sitr3n01/quality_review (ref: $REF)"
MODE="apply skill-only"
[ $FULL -eq 1 ]   && MODE="apply full"
[ $DRY_RUN -eq 1 ] && MODE="dry-run"
[ $FORCE -eq 1 ]   && MODE="$MODE (force overwrite)"
echo "Mode   : $MODE"
echo

if [ $DRY_RUN -eq 1 ]; then
  echo "Would download archive from ref '$REF'."
  if [ $FULL -eq 1 ]; then
    echo "Would run the full installer from the downloaded archive:"
    echo "  bash <archive>/scripts/install-into.sh $TARGET --dry-run"
    if [ $FORCE -eq 1 ]; then
      echo "  with --force passed through to overwrite divergent files"
    fi
  else
    echo "Would extract:"
    echo "  quality_review-$REF/.agents/skills/quality-gate/ → $DEST/"
  fi
  echo
  echo "Dry-run complete. Re-run without --dry-run to apply."
  exit 0
fi

# Need: curl, tar, mktemp. All standard on Linux/macOS/WSL/Git Bash.
for cmd in curl tar mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
done

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

ARCHIVE_URL="https://github.com/Sitr3n01/quality_review/archive/${REF}.tar.gz"
echo "Downloading $ARCHIVE_URL ..."
if ! curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$TMPDIR"; then
  echo "Failed to download or extract archive from $ARCHIVE_URL" >&2
  echo "If the ref looks correct, the repo may be unreachable." >&2
  exit 1
fi

# Archive top-level dir is typically "quality_review-<sanitized-ref>".
SRC_ROOT=""
SRC_DIR=""
for d in "$TMPDIR"/*/; do
  if [ -d "${d}.agents/skills/quality-gate" ]; then
    SRC_ROOT="${d%/}"
    SRC_DIR="$SRC_ROOT/.agents/skills/quality-gate"
    break
  fi
done

if [ -z "$SRC_ROOT" ] || [ -z "$SRC_DIR" ]; then
  echo "Could not locate .agents/skills/quality-gate in the downloaded archive." >&2
  echo "The archive layout may have changed. Check ref '$REF'." >&2
  exit 1
fi

if [ $FULL -eq 1 ]; then
  if [ ! -f "$SRC_ROOT/scripts/install-into.sh" ]; then
    echo "Could not locate scripts/install-into.sh in the downloaded archive." >&2
    echo "The archive layout may have changed. Check ref '$REF'." >&2
    exit 1
  fi

  INSTALL_ARGS=("$SRC_ROOT/scripts/install-into.sh" "$TARGET")
  if [ $FORCE -eq 1 ]; then
    INSTALL_ARGS+=("--force")
  fi

  echo "Running full Quality Gate installer from downloaded archive..."
  bash "${INSTALL_ARGS[@]}"
  exit $?
fi

mkdir -p "$TARGET/.agents/skills"
if [ -d "$DEST" ]; then
  rm -rf "$DEST"
fi
cp -R "$SRC_DIR" "$DEST"

echo
echo "Codex skill installed at: $DEST"
echo
echo "Next steps:"
echo "  1. Open this project in Codex (OpenAI Agents SDK)."
echo "  2. .agents/skills/quality-gate/SKILL.md is auto-discovered."
echo "  3. To also install the deterministic gate files (npm run quality:*),"
echo "     rerun this installer with --full, or clone this repo and run:"
echo "     bash scripts/install-into.sh $TARGET"
