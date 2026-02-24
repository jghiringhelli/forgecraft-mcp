#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Post-tool Hook: Atomic Commit Reminder
#
# Runs after file write/edit operations. Detects when uncommitted changes
# accumulate beyond a threshold and reminds to commit the current feature
# before starting the next one.
#
# Prevents:
#   - Multi-feature commits (violates "one logical change per commit")
#   - Lost work from uncommitted deletions or refactors
#
# Trigger: PostToolUse (file write/edit tools)
# Exit: Always 0 (advisory only, never blocks)
# ──────────────────────────────────────────────────────────────────────

# ── Configuration ─────────────────────────────────────────────────────
# Warn when total uncommitted files reach this count.
# Single features typically touch < 15 files.
WARN_THRESHOLD="${FORGECRAFT_COMMIT_WARN_THRESHOLD:-15}"

# ── Safety: only run inside a git repo ────────────────────────────────
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

# ── Count uncommitted changes ─────────────────────────────────────────
MODIFIED=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
TOTAL=$((MODIFIED + STAGED + UNTRACKED))

if [ "$TOTAL" -lt "$WARN_THRESHOLD" ]; then
  exit 0
fi

# ── Identify affected areas (top-level directories) ───────────────────
AREAS=$(
  {
    git diff --name-only 2>/dev/null
    git diff --cached --name-only 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | sed 's|/.*||' | sort -u | tr '\n' ', ' | sed 's/,$//'
)

# ── Emit advisory warning ────────────────────────────────────────────
echo ""
echo "⚠️  COMMIT REMINDER: ${TOTAL} uncommitted files detected (threshold: ${WARN_THRESHOLD})"
echo "   Affected areas: ${AREAS}"
echo ""
echo "   If the current feature is complete, commit before starting the next one."
echo "   Atomic commits prevent multi-feature bundles and make rollbacks safer."
echo ""
echo "   Suggested: git add -A && git commit -m \"feat(scope): description\""
echo ""

exit 0
