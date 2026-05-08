#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Stop Hook: Session summary writer
#
# Fires when the AI session ends. Reads today's session log and writes
# a human-readable summary to .session-log/summaries/. Cleans up the
# session flag used by pre-exec-health-injector.sh.
#
# The summary can be manually fed to Chronicle for episodic memory, or
# read at the start of the next session as context.
#
# Trigger: Stop — Claude Code hook
# Exit: Always 0
# ──────────────────────────────────────────────────────────────────────

SESSION_DATE=$(date +%Y-%m-%d)
SESSION_TIME=$(date +%H%M%S)
LOG_DIR=".session-log"
LOG_FILE="${LOG_DIR}/${SESSION_DATE}.jsonl"
SUMMARY_DIR="${LOG_DIR}/summaries"

mkdir -p "$SUMMARY_DIR" 2>/dev/null

# Clean up session flag so next session gets a fresh health injection
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SESSION_ID=$(echo "$PROJECT_ROOT" | md5sum 2>/dev/null | cut -c1-8 || echo "default")
rm -f "/tmp/.forgecraft-session-${SESSION_ID}" 2>/dev/null

# Nothing to summarize if no log exists
[ -f "$LOG_FILE" ] || exit 0

TOTAL=$(wc -l < "$LOG_FILE" | tr -d ' ')
[ "$TOTAL" -eq 0 ] && exit 0

# Tool call frequency
if command -v jq &>/dev/null; then
  TOOL_FREQ=$(jq -r '.tool' "$LOG_FILE" 2>/dev/null \
    | sort | uniq -c | sort -rn \
    | awk '{printf "  %-6s %s\n", $1, $2}' \
    | head -10)
else
  TOOL_FREQ=$(grep -o '"tool":"[^"]*"' "$LOG_FILE" \
    | sed 's/"tool":"//;s/"//' \
    | sort | uniq -c | sort -rn | head -10)
fi

# Files touched this session (from log digests)
if command -v jq &>/dev/null; then
  FILES_TOUCHED=$(jq -r 'select(.digest != "") | .digest' "$LOG_FILE" 2>/dev/null \
    | grep -E '\.(ts|js|md|json|sh|yaml)$' \
    | sort -u | head -15 | sed 's/^/  /')
else
  FILES_TOUCHED="  (install jq for file tracking)"
fi

# Git activity this session
COMMITS=$(git log --since="$(date +%Y-%m-%d) 00:00:00" --oneline 2>/dev/null \
  | head -10 | sed 's/^/  /')
[ -z "$COMMITS" ] && COMMITS="  (none)"

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

SUMMARY_FILE="${SUMMARY_DIR}/${SESSION_DATE}-${SESSION_TIME}.md"

cat > "$SUMMARY_FILE" << SUMMARY
# Session Summary — ${SESSION_DATE} ${SESSION_TIME}

## Stats
- Total tool calls: ${TOTAL}
- Branch: ${BRANCH}
- Uncommitted files at end: ${UNCOMMITTED}

## Tool Usage (calls)
${TOOL_FREQ}

## Files Referenced
${FILES_TOUCHED}

## Commits This Session
${COMMITS}

## Chronicle Prompt
> Paste into Chronicle to store episodic memory:
> "On ${SESSION_DATE}, session of ${TOTAL} tool calls on branch ${BRANCH}.
> Commits: $(git log --since="$(date +%Y-%m-%d) 00:00:00" --pretty="%s" 2>/dev/null | head -3 | tr '\n' '; ')"
SUMMARY

echo "📋 Session summary → ${SUMMARY_FILE}"
exit 0
