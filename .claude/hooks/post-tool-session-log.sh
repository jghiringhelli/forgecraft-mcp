#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# PostToolUse Session Logger
#
# Fires after every AI tool call. Appends a minimal structured record
# to .session-log/{date}.jsonl — tool name, timestamp, and a short
# digest of the input (file path or command, truncated).
#
# The log is the raw material for stop-session-summary.sh and can be
# consumed by Chronicle for episodic memory population.
#
# Trigger: PostToolUse (all tools) — Claude Code hook
# Exit: Always 0 (logging — never blocks)
# ──────────────────────────────────────────────────────────────────────

LOG_DIR=".session-log"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

SESSION_DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)
LOG_FILE="${LOG_DIR}/${SESSION_DATE}.jsonl"

# Read tool event from stdin (JSON from Claude Code)
INPUT=$(cat 2>/dev/null)

# Extract tool name — try jq first, fall back to grep
if command -v jq &>/dev/null; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")
  # Best-effort digest: file path or command, first 80 chars
  DIGEST=$(echo "$INPUT" | jq -r '
    .tool_input.path //
    .tool_input.command //
    .tool_input.query //
    .tool_input.file_path //
    "" ' 2>/dev/null | head -c 80 | tr -d '\n"')
else
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | sed 's/"tool_name":"//;s/"//' | head -1)
  DIGEST=""
fi

[ -z "$TOOL_NAME" ] && TOOL_NAME="unknown"

# Write log entry
printf '{"ts":"%s","tool":"%s","digest":"%s"}\n' \
  "$TIMESTAMP" "$TOOL_NAME" "$DIGEST" >> "$LOG_FILE" 2>/dev/null

exit 0
