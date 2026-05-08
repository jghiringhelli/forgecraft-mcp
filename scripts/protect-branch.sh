#!/bin/bash
# protect-branch.sh — Apply GitHub branch protection rules via gh CLI.
# Falls back to step-by-step manual instructions when gh is not installed.
#
# Usage:
#   bash scripts/protect-branch.sh [options]
#   npm run protect              # shorthand
#
# Options:
#   --solo              0 required reviewers (solo project — still enforces PR flow)
#   --branches LIST     Comma-separated branches to protect (default: main,develop)
#   --dry-run           Print what would be applied; make no changes
#
# Prerequisites (automated path):
#   gh auth login       Authenticate once, then re-run this script

set -e

# ── Parse args ───────────────────────────────────────────────────────────
SOLO=0
DRY_RUN=0
BRANCHES="main,develop"
MIN_REVIEWERS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --solo)        SOLO=1; MIN_REVIEWERS=0; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    --branches)    BRANCHES="$2"; shift 2 ;;
    *)             echo "Unknown flag: $1  (use --solo | --branches LIST | --dry-run)"; exit 1 ;;
  esac
done

# ── Colours ──────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
BOLD='\033[1m'; RESET='\033[0m'
fail() { echo -e "${RED}❌ $1${RESET}"; exit 1; }
ok()   { echo -e "${GREEN}✅ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $1${RESET}"; }

# ── Manual instructions (always available, also printed as fallback) ──────
print_manual() {
  local branch="$1"
  echo ""
  echo -e "${BOLD}  Branch: $branch${RESET}"
  echo "  GitHub → repo → Settings → Branches → Add branch ruleset"
  echo ""
  echo "  Branch name pattern:  $branch"
  echo ""
  echo "  ✓ Require a pull request before merging"
  echo "      Required approvals:                        $MIN_REVIEWERS"
  echo "      Dismiss stale reviews on new commits:      YES"
  echo ""
  echo "  ✓ Require status checks to pass before merging"
  echo "      Require branches to be up to date:         YES"
  echo "      Required checks (add both):"
  echo "        ci"
  echo "        validate-pr"
  echo ""
  echo "  ✓ Allow force pushes:  NO"
  echo "  ✓ Allow deletions:     NO"
}

# ── No gh — print manual instructions and exit cleanly ───────────────────
if ! command -v gh &>/dev/null; then
  warn "gh CLI not found. Install from https://cli.github.com or follow manual steps:"
  IFS=',' read -ra BLIST <<< "$BRANCHES"
  for b in "${BLIST[@]}"; do print_manual "$b"; done
  echo ""
  echo "  After installing gh, run:  gh auth login"
  echo "  Then re-run:               npm run protect"
  exit 0
fi

# ── Not authenticated — guide the user ───────────────────────────────────
if ! gh auth status &>/dev/null 2>&1; then
  echo ""
  echo -e "${BOLD}gh is installed but not authenticated.${RESET}"
  echo ""
  echo "  Run this command in your terminal, then re-run 'npm run protect':"
  echo ""
  echo "    ! gh auth login"
  echo ""
  echo "  (The '!' prefix runs it directly in your Claude Code session)"
  exit 1
fi

# ── Detect owner/repo from remote ────────────────────────────────────────
REMOTE_URL=$(git remote get-url origin 2>/dev/null) \
  || fail "No 'origin' remote found. Push the repo to GitHub first."

if ! echo "$REMOTE_URL" | grep -q "github.com"; then
  fail "Remote origin is not a GitHub URL: $REMOTE_URL"
fi

# Handle both HTTPS (https://github.com/owner/repo.git) and SSH (git@github.com:owner/repo.git)
REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
OWNER=$(echo "$REPO" | cut -d/ -f1)
REPONAME=$(echo "$REPO" | cut -d/ -f2)

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🔒 GitHub Branch Protection${RESET}"
echo "   Repo:         $OWNER/$REPONAME"
echo "   Branches:     $BRANCHES"
echo "   Min reviewers: $MIN_REVIEWERS$([ $SOLO -eq 1 ] && echo ' (solo mode — PR required, no reviewer needed)' || true)"
echo "   Mode:         $([ $DRY_RUN -eq 1 ] && echo 'DRY RUN (no changes)' || echo 'APPLY')"
echo ""

# ── Apply protection to one branch ───────────────────────────────────────
protect_branch() {
  local branch="$1"

  # Skip if branch doesn't exist on remote
  if ! gh api "repos/$OWNER/$REPONAME/branches/$branch" &>/dev/null 2>&1; then
    warn "Branch '$branch' not found on remote — skipping."
    return 0
  fi

  if [ $DRY_RUN -eq 1 ]; then
    echo "  Would apply to: $branch"
    print_manual "$branch"
    return 0
  fi

  gh api "repos/$OWNER/$REPONAME/branches/$branch/protection" \
    --method PUT \
    --input - << EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci", "validate-pr"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": $MIN_REVIEWERS
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

  ok "$branch — requires PR, ci + validate-pr checks, $MIN_REVIEWERS reviewer(s), no force push"
}

# ── Run for each branch ───────────────────────────────────────────────────
IFS=',' read -ra BLIST <<< "$BRANCHES"
for b in "${BLIST[@]}"; do
  protect_branch "$b"
done

echo ""
if [ $DRY_RUN -eq 0 ]; then
  ok "Done."
  echo ""
  echo "   Verify: https://github.com/$OWNER/$REPONAME/settings/branches"
fi
