#!/bin/bash
# pre-commit-complexity.sh — Blocking cyclomatic-complexity gate (FC-2 set).
# Threshold: 10 (override with FC_COMPLEXITY_MAX). Stack-dispatched; skips (does
# not fail) when no complexity tool is installed for the staged stack — install
# the tool to make the gate block. On a real violation it writes to
# .forgecraft/gate-violations.jsonl (the iterate-to-green substrate) exactly like
# pre-commit-audit.sh, so close_cycle's static-analyzer gate sees the red. This
# materializes the hook referenced by cyclomatic-complexity-max-10.yaml.
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
MAX="${FC_COMPLEXITY_MAX:-10}"
echo "🔬 Cyclomatic complexity gate (max $MAX)..."
RAN=0

# ── Python — radon ────────────────────────────────────────────────
if echo "$STAGED" | grep -qE '\.py$' && command -v radon &>/dev/null; then
  PYF=$(echo "$STAGED" | grep -E '\.py$' | grep -vE '(_test\.py|test_)' | tr '\n' ' ')
  if [ -n "$PYF" ]; then
    if radon cc -j $PYF 2>/dev/null | python -c "import sys,json; d=json.load(sys.stdin); bad=[b for fns in d.values() for b in fns if b.get('complexity',0)>$MAX]; sys.exit(1 if bad else 0)"; then
      RAN=1; echo "  ✅ radon: all functions ≤ $MAX"
    else
      echo "❌ radon: functions exceed cyclomatic complexity $MAX"
      radon cc -s -n C $PYF 2>&1 | head -20
      _fc_write_violation "pre-commit-complexity" "error" "Python function exceeds cyclomatic complexity $MAX (radon)"
      exit 1
    fi
  fi
fi

# ── Go — gocyclo ──────────────────────────────────────────────────
if echo "$STAGED" | grep -qE '\.go$' && command -v gocyclo &>/dev/null; then
  OVER=$(gocyclo -over $MAX . 2>/dev/null)
  if [ -n "$OVER" ]; then
    echo "❌ gocyclo: functions over complexity $MAX:"; echo "$OVER" | head -20
    _fc_write_violation "pre-commit-complexity" "error" "Go function exceeds cyclomatic complexity $MAX (gocyclo)"
    exit 1
  fi
  RAN=1; echo "  ✅ gocyclo: all functions ≤ $MAX"
fi

# ── TS/JS — eslint complexity rule (only if eslint present) ───────
_fc_has_eslint() {
  compgen -G ".eslintrc*" >/dev/null 2>&1 && return 0
  compgen -G "eslint.config.*" >/dev/null 2>&1 && return 0
  return 1
}
if echo "$STAGED" | grep -qE '\.(ts|tsx|js|jsx)$' && _fc_has_eslint; then
  FILES=$(echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx)$' | tr '\n' ' ')
  if npx eslint $FILES 2>&1 | grep -qi "complexity"; then
    echo "❌ eslint complexity rule exceeded (max $MAX)"
    _fc_write_violation "pre-commit-complexity" "error" "TS/JS function exceeds cyclomatic complexity $MAX (eslint)"
    exit 1
  fi
  RAN=1; echo "  ✅ eslint complexity ≤ $MAX (or not configured)"
fi

if [ "$RAN" -eq 0 ]; then
  echo "  ⊘ No complexity tool for staged files — skipping (install radon/gocyclo or eslint complexity rule to enforce)."
fi
exit 0
