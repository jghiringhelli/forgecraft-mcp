#!/bin/bash
# pre-commit-eslint.sh — Blocking eslint gate (FC-2 static-analyzer set).
# eslint is not format: it catches unused vars, no-explicit-any, shadowing, etc.
# that formatters ignore. Runs only when staged TS/JS files exist and an eslint
# config is present; a project without eslint is not failed. On failure it writes
# to .forgecraft/gate-violations.jsonl (the iterate-to-green substrate) exactly
# like pre-commit-audit.sh, so close_cycle's static-analyzer gate sees the red.
_fc_write_violation() {
  local hook_name="$1" severity="${2:-error}" message="$3"
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || return 0
  local dir="$repo_root/.forgecraft"
  mkdir -p "$dir" 2>/dev/null || return 0
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || printf "unknown")"
  local esc_msg
  esc_msg="$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '{"hook":"%s","severity":"%s","message":"%s","timestamp":"%s"}\n' \
    "$hook_name" "$severity" "$esc_msg" "$ts" \
    >> "$dir/gate-violations.jsonl" 2>/dev/null || true
}

STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
[ -z "$STAGED" ] && exit 0

if ! echo "$STAGED" | grep -qE '\.(ts|tsx|js|jsx)$'; then
  exit 0
fi

_fc_has_eslint() {
  compgen -G ".eslintrc*" >/dev/null 2>&1 && return 0
  compgen -G "eslint.config.*" >/dev/null 2>&1 && return 0
  grep -q '"eslintConfig"' package.json 2>/dev/null && return 0
  return 1
}

if ! _fc_has_eslint; then
  echo "  ⊘ No eslint config for staged TS/JS files — skipping eslint gate."
  exit 0
fi

echo "🧹 Running eslint gate..."
FILES=$(echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx)$' | tr '\n' ' ')
if ! npx eslint --max-warnings=0 $FILES 2>&1; then
  echo "❌ eslint reported errors/warnings (--max-warnings=0). Fix or run: npx eslint --fix"
  _fc_write_violation "pre-commit-eslint" "error" "eslint failed on staged TS/JS files (max-warnings=0)"
  exit 1
fi
echo "  ✅ eslint clean"
exit 0
