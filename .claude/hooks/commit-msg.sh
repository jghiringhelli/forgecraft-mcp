#!/bin/bash
# commit-msg.sh — Enforce conventional commit format
# Called by .git/hooks/commit-msg with $1 = path to commit message file.
MSG_FILE="$1"
MSG=$(cat "$MSG_FILE")

# Skip merge commits, fixups, and squash markers
if echo "$MSG" | grep -qE '^(Merge|Revert|fixup!|squash!)'; then
  exit 0
fi

# Use commitlint if available and config exists
if command -v npx &>/dev/null && [ -f "commitlint.config.cjs" ]; then
  npx --no-install commitlint --edit "$MSG_FILE" 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "  ✅ Commit message format valid"
    exit 0
  fi
  # commitlint not installed locally — fall through to regex
fi

# Regex fallback (no npm deps required)
PATTERN="^(feat|fix|refactor|docs|test|chore|ci|perf|revert)(\([^)]+\))?!?: .{1,100}"
if ! echo "$MSG" | grep -qE "$PATTERN"; then
  echo "❌ Commit message must follow Conventional Commits format."
  echo ""
  echo "   Format:  <type>(<scope>): <description>"
  echo "   Types:   feat, fix, refactor, docs, test, chore, ci, perf, revert"
  echo "   Example: feat(auth): add OAuth2 login"
  echo ""
  echo "   Got: $MSG"
  exit 1
fi

echo "  ✅ Commit message format valid"
exit 0
