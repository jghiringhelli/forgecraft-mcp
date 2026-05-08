#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Prepare-commit-msg Enricher: Use case tagger
#
# Fires before the commit message editor opens. Reads staged file paths,
# matches them against use case keywords in docs/use-cases.md, and appends
# a "Touches: UC-NNN, UC-NNN" trailer to the commit message.
#
# Gives every commit an automatic link back to the specs it satisfies.
# Enables PR-Brief and Spec-Drift to reason about commit intent.
#
# Trigger: prepare-commit-msg git hook
# Exit: Always 0 (enricher — never blocks)
# ──────────────────────────────────────────────────────────────────────

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Skip automated message sources
case "$COMMIT_SOURCE" in
  merge|squash|commit) exit 0 ;;
esac

# Require docs/use-cases.md
[ -f "docs/use-cases.md" ] || exit 0

# Get staged files (paths only)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null | tr '[:upper:]' '[:lower:]')
[ -z "$STAGED_FILES" ] && exit 0

MATCHED_UCS=""

# Walk use cases: lines with UC-NNN identifiers
while IFS= read -r line; do
  UC_ID=$(echo "$line" | grep -oE "UC-[0-9]+" | head -1)
  [ -z "$UC_ID" ] && continue

  # Extract meaningful keywords (4+ chars, skip common noise)
  KEYWORDS=$(echo "$line" \
    | sed -E 's/UC-[0-9]+//g; s/[^a-zA-Z ]/ /g' \
    | tr '[:upper:]' '[:lower:]' \
    | tr ' ' '\n' \
    | grep -E '^[a-z]{4,}$' \
    | grep -vE '^(that|this|with|from|into|when|then|have|will|should|must|user|data|file|list|able|each|over|more|some|such|also)$')

  # Check if any staged file path contains a keyword
  for KEYWORD in $KEYWORDS; do
    if echo "$STAGED_FILES" | grep -q "$KEYWORD"; then
      if ! echo "$MATCHED_UCS" | grep -q "$UC_ID"; then
        MATCHED_UCS="$MATCHED_UCS $UC_ID"
      fi
      break
    fi
  done
done < "docs/use-cases.md"

# Deduplicate and sort
MATCHED_UCS=$(echo "$MATCHED_UCS" \
  | tr ' ' '\n' \
  | grep -v '^$' \
  | sort -V \
  | tr '\n' ' ' \
  | sed 's/^ //; s/ $//')

if [ -n "$MATCHED_UCS" ]; then
  # Don't add if already present
  if ! grep -q "^Touches:" "$COMMIT_MSG_FILE" 2>/dev/null; then
    printf "\nTouches: %s\n" "$MATCHED_UCS" >> "$COMMIT_MSG_FILE"
  fi
fi

exit 0
