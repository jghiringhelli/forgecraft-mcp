#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# ForgeCraft Session Advisor — Claude Code hook variant
#
# Injects a brief project-state summary before every prompt so the
# assistant can give contextual advice without being asked.
#
# SCOPE: This hook uses Claude Code's UserPromptSubmit mechanism.
#        For other agents, see the equivalent instructions below.
#
# ── Claude Code (this file) ───────────────────────────────────────────
# Add to .claude/settings.json:
#
#   "hooks": {
#     "UserPromptSubmit": [{
#       "matcher": "",
#       "hooks": [{ "type": "command", "command": "bash .claude/hooks/session-advisor.sh" }]
#     }]
#   }
#
# ── All other MCP-capable agents ─────────────────────────────────────
# Add this instruction to your rules file and forgecraft will advise
# automatically at the start of each session:
#
#   CLAUDE.md / .clinerules / .windsurfrules / copilot-instructions.md:
#
#   > At the start of every session, call:
#   >   forgecraft_actions { action: "advise_session", project_dir: "<absolute path>" }
#   > Surface the response to the user before proceeding.
#
# Any MCP-capable agent (Cursor, Cline, Windsurf, Copilot with MCP,
# Aider with MCP) can call forgecraft_actions directly — no hook needed.
#
# ── Output ────────────────────────────────────────────────────────────
# Pure shell, no Node.js startup. Outputs a compact state block that
# Claude reads as injected context before the user's prompt.
# ──────────────────────────────────────────────────────────────────────

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

out() { echo "$1"; }

out "<!-- forgecraft:session-context"

# ── Constitution (agent-agnostic check) ───────────────────────────
CONST_FOUND=no
for path in CLAUDE.md .clinerules .windsurfrules CONVENTIONS.md \
            ".cursor/rules/project-standards.mdc" \
            ".github/copilot-instructions.md"; do
  if [ -e "$DIR/$path" ]; then
    CONST_FOUND=yes
    break
  fi
done
if [ "$CONST_FOUND" = "yes" ]; then
  out "constitution: yes"
else
  out "constitution: no  (no AI rules file — assistant has no project rules)"
fi

# ── forgecraft config ──────────────────────────────────────────────
if [ -f "$DIR/forgecraft.yaml" ]; then
  out "config: yes"
else
  out "config: no  (call forgecraft_actions { action: setup_project } to configure)"
fi

# ── Tests ─────────────────────────────────────────────────────────
if [ -d "$DIR/tests" ] || [ -d "$DIR/test" ] || \
   [ -d "$DIR/spec" ] || [ -d "$DIR/__tests__" ]; then
  out "tests: yes"
else
  out "tests: no  (no test directory — bugs accumulate silently)"
fi

# ── Schema ────────────────────────────────────────────────────────
SCHEMA_FOUND=no
for path in openapi.yaml openapi.yml openapi.json "prisma/schema.prisma" \
            schema.graphql "docs/schema.md" "docs/schemas" "src/schema" "src/schemas"; do
  if [ -e "$DIR/$path" ]; then
    SCHEMA_FOUND=yes
    break
  fi
done
[ "$SCHEMA_FOUND" = "yes" ] && out "schema: yes" || \
  out "schema: no  (API/DB contracts are implicit)"

# ── Gate violations ───────────────────────────────────────────────
VIOLATIONS_FILE="$DIR/.forgecraft/gate-violations.jsonl"
if [ -f "$VIOLATIONS_FILE" ]; then
  COUNT=$(grep -c . "$VIOLATIONS_FILE" 2>/dev/null || echo 0)
  if [ "$COUNT" -gt 0 ]; then
    out "gate-violations: $COUNT active"
    LATEST=$(tail -1 "$VIOLATIONS_FILE" 2>/dev/null | \
      grep -o '"message":"[^"]*"' | head -1 | sed 's/"message":"//;s/"//')
    [ -n "$LATEST" ] && out "latest-violation: $LATEST"
  else
    out "gate-violations: 0"
  fi
else
  out "gate-violations: 0"
fi

# ── Recent activity ───────────────────────────────────────────────
if command -v git > /dev/null 2>&1 && git -C "$DIR" rev-parse --git-dir > /dev/null 2>&1; then
  RECENT=$(git -C "$DIR" log --oneline -1 --format="%s" 2>/dev/null | head -c 80)
  [ -n "$RECENT" ] && out "last-commit: $RECENT"
fi

out "-->"
