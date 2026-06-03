#!/bin/bash
# pre-push-doc-cascade.sh — Block pushes where public surface changed without docs.
#
# Checks all commits being pushed. If public-surface src/ files changed
# without any corresponding docs/ update, push is blocked.
#
# Escape hatch: add docs/change-manifest.md explaining the code-only change.
#   Format: ## Change YYYY-MM-DD
#           Why no docs update: <reason>
#
# Only triggers when docs/manifest.yaml or docs/adrs/ exists (GS opted-in project).

# ── Skip if project hasn't opted into GS ─────────────────────────────
if [ ! -f "docs/manifest.yaml" ] && [ ! -d "docs/adrs" ]; then
  exit 0
fi

VIOLATIONS=0

while read -r local_ref local_sha remote_ref remote_sha; do
  # Skip branch deletions
  [ "$local_sha" = "0000000000000000000000000000000000000000" ] && continue

  # Determine the commit range to inspect
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    # New branch — compare against merge base with main/master
    BASE=$(git merge-base "$local_sha" main 2>/dev/null \
        || git merge-base "$local_sha" master 2>/dev/null \
        || true)
    [ -z "$BASE" ] && continue
    RANGE="${BASE}..${local_sha}"
  else
    RANGE="${remote_sha}..${local_sha}"
  fi

  # Aggregate all files changed across every commit in this push
  ALL_CHANGED=$(git log "$RANGE" --name-only --format="" 2>/dev/null | sort -u || true)
  [ -z "$ALL_CHANGED" ] && continue

  # Public-surface: tools, registry, entry points
  SRC_PUBLIC=$(echo "$ALL_CHANGED" | grep -E '^src/(tools|registry|index\.ts|cli)' || true)
  DOCS_CHANGED=$(echo "$ALL_CHANGED" | grep -E '^docs/' || true)

  [ -z "$SRC_PUBLIC" ] && continue   # no public surface touched — nothing to check
  [ -n "$DOCS_CHANGED" ] && continue # docs were updated — all good

  # Check escape hatch: docs/change-manifest.md present in the pushed tip
  if git show "${local_sha}:docs/change-manifest.md" &>/dev/null; then
    echo "📝 Doc-cascade: docs/change-manifest.md found — escape hatch accepted for ${local_ref}"
    continue
  fi

  echo ""
  echo "❌ Doc-cascade: public surface changed without docs update"
  echo "   Branch: ${local_ref}"
  echo ""
  echo "   Public files in this push (first 10):"
  echo "$SRC_PUBLIC" | head -10 | sed 's/^/     /'
  echo ""
  echo "   Fix one of:"
  echo "   1. Touch the relevant docs/ artifact alongside your code change:"
  echo "      - New behaviour   → docs/specs/ or docs/use-cases/"
  echo "      - Arch change     → docs/adrs/active/ + docs/architecture/"
  echo "      - Schema change   → docs/architecture/data-model.md"
  echo "   2. Add docs/change-manifest.md explaining why docs don't need updating:"
  echo "      ## Change $(date +%Y-%m-%d)"
  echo "      Why no docs update: <reason>"
  echo ""
  echo "   Emergency bypass: git push --no-verify"
  VIOLATIONS=$((VIOLATIONS + 1))
done

[ "$VIOLATIONS" -gt 0 ] && exit 1
exit 0
