#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# PreToolUse Context Builder: Session health injector
#
# Fires before any AI tool call. On the FIRST call of a new session,
# outputs a brief project health summary so the AI starts with current
# state rather than having to discover it by reading files.
#
# Health summary includes: branch, uncommitted files, complexity state,
# open Executable Sprint gates, and last commit.
#
# Uses a session flag in /tmp to emit only once per session (30-min TTL).
#
# Trigger: PreToolUse (all tools) — Claude Code hook
# Exit: 0 always (context injection, never blocks)
# ──────────────────────────────────────────────────────────────────────

# Derive a stable session ID from the project root path
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SESSION_ID=$(echo "$PROJECT_ROOT" | md5sum 2>/dev/null | cut -c1-8 || echo "default")
SESSION_FLAG="/tmp/.forgecraft-session-${SESSION_ID}"

# Emit only once per 30-minute window
if [ -f "$SESSION_FLAG" ]; then
  FLAG_AGE=$(( $(date +%s) - $(date -r "$SESSION_FLAG" +%s 2>/dev/null || echo 0) ))
  [ "$FLAG_AGE" -lt 1800 ] && exit 0
fi

# Only emit for ForgeCraft-initialized projects
[ -f "forgecraft.yaml" ] || exit 0

touch "$SESSION_FLAG" 2>/dev/null

# ── Gather health signals ─────────────────────────────────────────────

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
LAST_COMMIT=$(git log -1 --pretty="%h %s" 2>/dev/null || echo "none")

# Complexity state
COMPLEXITY_STATE="no baseline (run: pip install lizard)"
if [ -f ".complexity/latest.json" ]; then
  COMPLEXITY_STATE=$(python3 - <<'PYEOF' 2>/dev/null
import json
try:
    data = json.load(open('.complexity/latest.json'))
    fns = data.get('function_list', [])
    if fns:
        avg = sum(f['cyclomatic_complexity'] for f in fns) / len(fns)
        high = len([f for f in fns if f['cyclomatic_complexity'] > 10])
        print(f"avg CCN {avg:.1f}, {high} fn(s) above threshold")
    else:
        print("baseline empty")
except:
    print("unreadable")
PYEOF
  )
fi

# Open Executable Sprint gates
EX_GATES=""
if [ -d "docs/session-prompts" ]; then
  EX_COUNT=$(ls docs/session-prompts/EX-*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$EX_COUNT" -gt 0 ] && EX_GATES="${EX_COUNT} EX gate(s) pending in docs/session-prompts/"
fi

# Gate violations
VIOLATIONS=""
if [ -f ".forgecraft/gate-violations.jsonl" ]; then
  V_COUNT=$(wc -l < ".forgecraft/gate-violations.jsonl" | tr -d ' ')
  [ "$V_COUNT" -gt 0 ] && VIOLATIONS="${V_COUNT} active gate violation(s) in .forgecraft/gate-violations.jsonl"
fi

# ── Emit summary ──────────────────────────────────────────────────────

echo ""
echo "╔══ 🔍 Project Health ═══════════════════════════════════════════╗"
printf "  Branch: %-20s  Uncommitted files: %s\n" "$BRANCH" "$UNCOMMITTED"
printf "  Complexity: %s\n" "$COMPLEXITY_STATE"
[ -n "$EX_GATES" ]   && printf "  Sprint:     %s\n" "$EX_GATES"
[ -n "$VIOLATIONS" ] && printf "  ⚠️  Gates:   %s\n" "$VIOLATIONS"
printf "  Last commit: %s\n" "$LAST_COMMIT"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

exit 0
