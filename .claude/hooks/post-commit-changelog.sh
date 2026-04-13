#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Post-commit Generator: CHANGELOG updater
#
# Fires after every successful commit. Parses the commit message for
# conventional commit format and appends a formatted entry to CHANGELOG.md
# under an [Unreleased] section.
#
# Trigger: post-commit git hook
# Exit: Always 0 (advisory — never blocks)
# ──────────────────────────────────────────────────────────────────────

CHANGELOG="CHANGELOG.md"
COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null)
COMMIT_HASH=$(git log -1 --pretty=%h 2>/dev/null)

# Only process conventional commits
if ! echo "$COMMIT_MSG" | grep -qE "^(feat|fix|refactor|docs|test|chore|perf|ci|build)(\([^)]+\))?: .+"; then
  exit 0
fi

# Parse type, scope, description
TYPE=$(echo "$COMMIT_MSG" | sed -E 's/^([a-z]+)(\([^)]+\))?: .+/\1/')
SCOPE=$(echo "$COMMIT_MSG" | sed -E 's/^[a-z]+\(([^)]+)\): .+/\1/')
[ "$SCOPE" = "$COMMIT_MSG" ] && SCOPE=""
DESC=$(echo "$COMMIT_MSG" | sed -E 's/^[a-z]+(\([^)]+\))?: //')

# Map type to changelog section heading
case "$TYPE" in
  feat)              SECTION="### Added" ;;
  fix)               SECTION="### Fixed" ;;
  refactor|perf)     SECTION="### Changed" ;;
  docs)              SECTION="### Documentation" ;;
  test|chore|ci|build) SECTION="### Other" ;;
  *)                 SECTION="### Other" ;;
esac

# Build entry line
if [ -n "$SCOPE" ]; then
  ENTRY="- **${SCOPE}**: ${DESC} (\`${COMMIT_HASH}\`)"
else
  ENTRY="- ${DESC} (\`${COMMIT_HASH}\`)"
fi

# Ensure CHANGELOG exists with header
if [ ! -f "$CHANGELOG" ]; then
  printf "# Changelog\n\nAll notable changes documented here.\n\n---\n" > "$CHANGELOG"
fi

# Ensure [Unreleased] section exists
if ! grep -q "## \[Unreleased\]" "$CHANGELOG" 2>/dev/null; then
  TMP=$(mktemp)
  # Insert [Unreleased] after the first --- divider or after the header block
  awk '/^---$/ && !found { print; print ""; print "## [Unreleased]"; print ""; found=1; next } { print }' \
    "$CHANGELOG" > "$TMP" 2>/dev/null
  if grep -q "\[Unreleased\]" "$TMP" 2>/dev/null; then
    mv "$TMP" "$CHANGELOG"
  else
    rm -f "$TMP"
    printf "\n## [Unreleased]\n\n" >> "$CHANGELOG"
  fi
fi

# Insert entry under the correct section within [Unreleased]
# Strategy: find [Unreleased] block, insert after matching section header or create it
TMP=$(mktemp)
awk -v section="$SECTION" -v entry="$ENTRY" '
  BEGIN { in_unreleased=0; inserted=0 }
  /^## \[Unreleased\]/ { in_unreleased=1; print; next }
  in_unreleased && /^## / { in_unreleased=0 }
  in_unreleased && $0 == section && !inserted {
    print
    print entry
    inserted=1
    next
  }
  { print }
  END {
    if (!inserted) {
      print ""
      print section
      print entry
    }
  }
' "$CHANGELOG" > "$TMP" 2>/dev/null

if [ -s "$TMP" ]; then
  mv "$TMP" "$CHANGELOG"
else
  rm -f "$TMP"
  printf "\n%s\n%s\n" "$SECTION" "$ENTRY" >> "$CHANGELOG"
fi

echo "📝 CHANGELOG.md updated — remember to commit this file when releasing"
exit 0
