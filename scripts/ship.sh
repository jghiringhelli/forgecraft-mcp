#!/bin/bash
# ship.sh — Automated release: test → version bump → tag → push → PR
#
# Usage:
#   bash scripts/ship.sh [patch|minor|major]
#
# What it does:
#   1. Validates you are not on main/master and have a clean tree
#   2. Runs full test suite + mutation gate + dependency audit
#   3. Bumps version in package.json (no commit yet)
#   4. Pauses for you to update CHANGELOG.md
#   5. Commits version bump + CHANGELOG, creates git tag
#   6. Pushes branch + tag to remote
#   7. Creates PR via gh (if installed)

set -e

BUMP="${1:-patch}"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
RESET='\033[0m'

fail() { echo -e "${RED}❌ $1${RESET}"; exit 1; }
ok()   { echo -e "${GREEN}✅ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $1${RESET}"; }

# ── Validate inputs ──────────────────────────────────────────────────────
if ! echo "$BUMP" | grep -qE '^(patch|minor|major)$'; then
  fail "Invalid bump type: '$BUMP'. Use: patch | minor | major"
fi

# ── Validate branch ──────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if echo "$BRANCH" | grep -qE '^(main|master)$'; then
  fail "Cannot ship from '$BRANCH'. Branch out first:\n   git checkout -b release/$(node -p "require('./package.json').version" 2>/dev/null || echo 'next')"
fi
ok "Branch: $BRANCH"

# ── Validate clean tree ──────────────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "Working tree has uncommitted changes. Commit or stash before shipping."
fi
ok "Working tree clean"

# ── Test gate ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🧪 Running test suite...${RESET}"
npm run test:coverage

echo ""
echo -e "${BOLD}🔬 Running mutation gate (sentinel)...${RESET}"
npm run test:mutation:sentinel

echo ""
echo -e "${BOLD}🔍 Running dependency audit...${RESET}"
npm audit --audit-level=high

# ── Version bump (no commit yet) ─────────────────────────────────────────
PREV_VERSION=$(node -p "require('./package.json').version")
echo ""
echo -e "${BOLD}📦 Bumping $BUMP: $PREV_VERSION → ...${RESET}"
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
TAG="v${NEW_VERSION}"
ok "Version: $PREV_VERSION → $NEW_VERSION"

# ── CHANGELOG pause ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}📝 Update CHANGELOG.md before continuing.${RESET}"
echo "   Add this section at the top of the Unreleased block:"
echo ""
echo "   ## [$NEW_VERSION] — $(date +%Y-%m-%d)"
echo "   ### What changed"
echo "   - <user-facing description — not implementation details>"
echo "   - The numbers that matter (e.g. 'mutation score 84% → 90%')"
echo "   - What this means for users"
echo ""
read -rp "   Press Enter when CHANGELOG.md is updated (Ctrl+C to abort)... "

# ── Commit + tag ─────────────────────────────────────────────────────────
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): bump version to $NEW_VERSION"
git tag -a "$TAG" -m "Release $TAG"
ok "Committed and tagged $TAG"

# ── Push branch + tag ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🚀 Pushing $BRANCH and $TAG...${RESET}"
git push origin "$BRANCH"
git push origin "$TAG"
ok "Pushed $BRANCH + $TAG"

# ── PR creation ──────────────────────────────────────────────────────────
if command -v gh &>/dev/null; then
  echo ""
  echo -e "${BOLD}📬 Creating PR...${RESET}"
  COMMITS=$(git log "origin/main..${BRANCH}" --oneline --no-decorate 2>/dev/null || \
            git log "HEAD~5..HEAD" --oneline --no-decorate)
  gh pr create \
    --title "chore(release): $TAG" \
    --body "$(cat <<EOF
## Release $TAG ($BUMP bump from $PREV_VERSION)

### Commits
$COMMITS

### Release checklist
- [ ] CHANGELOG.md updated with user-facing descriptions
- [ ] Version bump is correct ($BUMP: $PREV_VERSION → $NEW_VERSION)
- [ ] All CI checks pass
- [ ] Tag \`$TAG\` pushed — npm publish triggers automatically on merge

🤖 Generated with [forgecraft-mcp ship](https://forgecraft.tools)
EOF
)" \
    --base main
  ok "PR created"
else
  warn "gh not installed — create the PR manually, then the tag push will trigger npm publish."
  echo "   After merging: git push origin $TAG"
fi

echo ""
echo -e "${BOLD}${GREEN}✅ Ship complete: $PREV_VERSION → $NEW_VERSION${RESET}"
echo "   Merge the PR to trigger npm publish via $TAG."
