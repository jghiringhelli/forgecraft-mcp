#!/bin/bash
# pre-commit-gs-links.sh — Verify @gs-links frontmatter references are honored.
#
# When a staged source file contains:
#   // @gs-links: docs/use-cases/uc-NNN.md, docs/adrs/active/NNNN-slug.md
#
# ...those linked doc paths must also appear in the staged files, OR a
# docs/change-manifest.md must be staged explaining the code-only change.
#
# Only triggers when docs/manifest.yaml or docs/adrs/ exists (GS opted-in).

# ── Skip if project hasn't opted into GS ─────────────────────────────
if [ ! -f "docs/manifest.yaml" ] && [ ! -d "docs/adrs" ]; then
  exit 0
fi

STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
[ -z "$STAGED" ] && exit 0

SRC_STAGED=$(echo "$STAGED" | grep -E '^src/' || true)
[ -z "$SRC_STAGED" ] && exit 0

# Escape hatch: docs/change-manifest.md staged alongside the change
if echo "$STAGED" | grep -qF "docs/change-manifest.md"; then
  exit 0
fi

VIOLATIONS=0
WARNED_FILES=""

for file in $SRC_STAGED; do
  [ -f "$file" ] || continue

  # Extract @gs-links lines that are actual comments (// or #), not string literals.
  # Pattern: line starts with optional whitespace + // or # then contains @gs-links:
  LINK_LINES=$(grep -E '^\s*(//|#)\s*@gs-links:' "$file" 2>/dev/null \
    | grep -oE '@gs-links: *[^"'"'"'`]*' || true)
  [ -z "$LINK_LINES" ] && continue

  while IFS= read -r link_line; do
    # Parse comma-separated paths after @gs-links:
    RAW_PATHS=$(echo "$link_line" | sed 's/@gs-links: *//' | tr ',' '\n')

    while IFS= read -r linked_path; do
      linked_path=$(echo "$linked_path" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
      [ -z "$linked_path" ] && continue

      if ! echo "$STAGED" | grep -qF "$linked_path"; then
        echo "  ⚠️  $file → @gs-links: $linked_path (not staged)"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    done <<< "$RAW_PATHS"
  done <<< "$LINK_LINES"
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "❌ @gs-links: $VIOLATIONS linked document(s) not staged with this source change"
  echo ""
  echo "   These source files declare doc links that should be updated together."
  echo "   Fix one of:"
  echo "   1. Stage the linked docs alongside this commit"
  echo "   2. Stage docs/change-manifest.md explaining why docs don't need updating:"
  echo "      ## Change $(date +%Y-%m-%d)"
  echo "      Why no docs update: <reason>"
  echo ""
  echo "   Emergency: git commit --no-verify"
  exit 1
fi

exit 0
