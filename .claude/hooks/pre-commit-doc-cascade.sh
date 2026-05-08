#!/bin/bash
# pre-commit-doc-cascade.sh — Advisory anti-drift gate.
#
# Detects when staged source changes lack a corresponding docs touch and
# emits a contextual checklist. Always exits 0 — the actual enforcement
# happens in:
#   - commit-msg-cascade.sh   (knows the conventional commit type)
#   - .github/workflows/validate-pr.yml  (blocks merge)
#
# Reads docs/manifest.yaml for severity overrides. Falls back to defaults
# from templates/docs-manifest.yaml when no manifest is present.

set -e

# ── Skip if no manifest and no docs/ at all (project hasn't opted in) ──
if [ ! -f "docs/manifest.yaml" ] && [ ! -d "docs/" ]; then
  exit 0
fi

# ── Collect staged files ──────────────────────────────────────────────
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
[ -z "$STAGED" ] && exit 0

SRC_TOUCHED=$(echo "$STAGED" | grep -E '^src/' || true)
DOCS_TOUCHED=$(echo "$STAGED" | grep -E '^docs/' || true)
TEST_TOUCHED=$(echo "$STAGED" | grep -E '(test|spec|__tests__|\.test\.|\.spec\.)' || true)

# Nothing to advise on — no src/ staged
[ -z "$SRC_TOUCHED" ] && exit 0

# ── Heuristic: detect public-surface changes ──────────────────────────
PUBLIC_SURFACE=""
for f in $SRC_TOUCHED; do
  case "$f" in
    src/index.ts|src/cli/*|src/tools/*|src/types/*)
      PUBLIC_SURFACE="$PUBLIC_SURFACE $f"
      ;;
  esac
done
PUBLIC_SURFACE=$(echo "$PUBLIC_SURFACE" | sed 's/^ //')

# ── Build advisory message ────────────────────────────────────────────
ADVICE=""

if [ -n "$SRC_TOUCHED" ] && [ -z "$DOCS_TOUCHED" ]; then
  ADVICE="src/ changed but docs/ untouched"
fi

if [ -n "$PUBLIC_SURFACE" ] && [ -z "$DOCS_TOUCHED" ]; then
  ADVICE="public surface changed but no spec/ADR/schema updated"
fi

[ -z "$ADVICE" ] && exit 0

# ── Emit contextual checklist ─────────────────────────────────────────
echo ""
echo "📝 Doc-cascade advisory: $ADVICE"
echo ""
echo "   If this is a feat: → touch docs/specs/ (and probably docs/use-cases/)"
echo "   If this is a fix:  → ensure a regression test is staged"
echo "   If this is a refactor: → consider docs/adrs/active/ if a decision was made"
echo ""

if [ -n "$PUBLIC_SURFACE" ]; then
  echo "   Public-surface files touched:"
  for f in $PUBLIC_SURFACE; do
    echo "     - $f"
  done
  echo ""
fi

if [ -z "$TEST_TOUCHED" ] && [ -n "$SRC_TOUCHED" ]; then
  echo "   ⚠️  No tests staged — fix: requires a regression test."
  echo ""
fi

echo "   Cascade reference:  templates/docs-manifest.yaml"
echo "   Skip (emergency):   git commit --no-verify"
echo ""

exit 0
