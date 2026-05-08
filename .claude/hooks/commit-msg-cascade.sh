#!/bin/bash
# commit-msg-cascade.sh — Enforces doc cascade based on conventional commit type.
#
# Runs at commit-msg stage (after pre-commit, before commit is finalized).
# Reads the conventional-commit type from the message and checks staged files
# against the cascade rules in docs/manifest.yaml.
#
# Severity model:
#   error    — exit 1, blocks commit
#   warning  — exit 0, prints notice
#   info     — exit 0, silent on pass
#
# Reads severity from docs/manifest.yaml `cascade_overrides:` block, otherwise
# defaults to 'warning' (legacy-friendly).

set -e

MSG_FILE="$1"
[ -z "$MSG_FILE" ] && exit 0
[ ! -f "$MSG_FILE" ] && exit 0

# Skip merge/squash/fixup messages
if head -1 "$MSG_FILE" | grep -qE '^(Merge|Revert|fixup!|squash!|amend!)'; then
  exit 0
fi

# ── Extract conventional commit type ──────────────────────────────────
TYPE=$(head -1 "$MSG_FILE" | grep -oE '^(feat|fix|refactor|docs|test|chore|ci|perf|revert)' || echo "")
[ -z "$TYPE" ] && exit 0     # commit-msg.sh handles malformed messages

# ── Collect staged files ──────────────────────────────────────────────
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
[ -z "$STAGED" ] && exit 0

SRC_TOUCHED=$(echo "$STAGED" | grep -E '^src/' || true)
SPEC_TOUCHED=$(echo "$STAGED" | grep -E '^docs/(specs/|PRD\.md|spec\.md|forgecraft-spec\.md|forgekit-spec\.md)' || true)
USECASE_TOUCHED=$(echo "$STAGED" | grep -E '^docs/(use-cases/|use-cases\.md)' || true)
ADR_TOUCHED=$(echo "$STAGED" | grep -E '^docs/(adrs?/)' || true)
SCHEMA_TOUCHED=$(echo "$STAGED" | grep -E '^docs/(schemas/|schema\.md|diagrams/)' || true)
DECISION_TOUCHED=$(echo "$STAGED" | grep -E '^docs/decisions/' || true)
TEST_TOUCHED=$(echo "$STAGED" | grep -E '(test|spec|__tests__|\.test\.|\.spec\.)' | grep -v '^docs/' || true)

# ── Read severity from manifest (very simple grep, no YAML parser) ────
SEVERITY="warning"
if [ -f "docs/manifest.yaml" ]; then
  # Look for cascade_overrides.<type>.severity
  S=$(grep -E "^\s*${TYPE}\.severity:" docs/manifest.yaml 2>/dev/null | head -1 | sed -E 's/.*:\s*//' | tr -d ' "' || true)
  [ -n "$S" ] && SEVERITY="$S"
fi

# ── Apply cascade rules ───────────────────────────────────────────────
VIOLATIONS=()
ENCOURAGED=()

case "$TYPE" in
  feat)
    if [ -n "$SRC_TOUCHED" ] && [ -z "$SPEC_TOUCHED" ]; then
      VIOLATIONS+=("feat: requires a spec touch (docs/specs/* or legacy docs/PRD.md)")
    fi
    if [ -z "$USECASE_TOUCHED" ]; then
      ENCOURAGED+=("docs/use-cases/UC-*.md — describe the actor + outcome")
    fi
    if [ -z "$SCHEMA_TOUCHED" ]; then
      ENCOURAGED+=("docs/schemas/ — if data model or API surface changed")
    fi
    ;;
  fix)
    if [ -n "$SRC_TOUCHED" ] && [ -z "$TEST_TOUCHED" ]; then
      VIOLATIONS+=("fix: requires a regression test (no test file staged)")
    fi
    if [ -z "$DECISION_TOUCHED" ]; then
      ENCOURAGED+=("docs/decisions/YYYY-MM-DD-*.md — if behavior was intentionally redefined")
    fi
    ;;
  refactor)
    if [ -z "$ADR_TOUCHED" ] && [ -z "$DECISION_TOUCHED" ]; then
      ENCOURAGED+=("docs/adrs/active/ or docs/decisions/ — if an architectural choice was made")
    fi
    ;;
  perf)
    if [ -z "$DECISION_TOUCHED" ]; then
      ENCOURAGED+=("docs/decisions/ — record the perf decision and benchmark")
    fi
    ;;
esac

# ── Report ────────────────────────────────────────────────────────────
if [ ${#VIOLATIONS[@]} -eq 0 ] && [ ${#ENCOURAGED[@]} -eq 0 ]; then
  exit 0
fi

echo ""
echo "📋 Doc-cascade check  [type=$TYPE, severity=$SEVERITY]"
echo ""

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  for v in "${VIOLATIONS[@]}"; do
    echo "  ❌ $v"
  done
  echo ""
fi

if [ ${#ENCOURAGED[@]} -gt 0 ]; then
  echo "  Encouraged (not blocking):"
  for e in "${ENCOURAGED[@]}"; do
    echo "    · $e"
  done
  echo ""
fi

# ── Block only if severity=error AND there are violations ─────────────
if [ "$SEVERITY" = "error" ] && [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo "  Severity is 'error' — commit blocked. Address the violations above"
  echo "  or set cascade_overrides.${TYPE}.severity to 'warning' in docs/manifest.yaml"
  echo "  during transitional/legacy phases."
  echo ""
  echo "  Skip (emergency): git commit --no-verify"
  echo ""
  exit 1
fi

exit 0
