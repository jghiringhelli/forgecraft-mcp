#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Pre-Commit Hook: Block Temporary Files & Unofficial Reports
#
# Prevents accidental commits of:
#   - Scratch/temp files  (*.tmp, *.bak, *.swp, *.orig, ~*)
#   - Draft/unofficial report files (*draft*, *unofficial*, *wip-*)
#   - Raw test output dumps  (*.out, test-results.*, coverage-raw.*)
#   - Debug/dump files  (*.dump, *.heap, *.cpuprofile)
#   - Local override configs  (*.local.*, local-config.*)
#
# Trigger: git pre-commit (via scripts/setup-hooks.sh)
# Exit: 1 blocks commit, 0 allows
# ──────────────────────────────────────────────────────────────────────

STAGED=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED" ]; then
  exit 0
fi

VIOLATIONS=0

# ── Temp / scratch patterns ───────────────────────────────────────────
TEMP_PATTERNS=(
  '\.tmp$'
  '\.bak$'
  '\.swp$'
  '\.swo$'
  '\.orig$'
  '~$'
  '^\.#'
)

# ── Draft / unofficial report patterns ───────────────────────────────
REPORT_PATTERNS=(
  '[-_\.]draft[-_\.]'
  '[-_\.]draft$'
  '^draft[-_\.]'
  '[-_\.]unofficial[-_\.]'
  '[-_\.]unofficial$'
  '^unofficial[-_\.]'
  '[-_\.]wip[-_\.]'
  '^wip[-_\.]'
  '[-_\.]temp-report'
)

# ── Debug / profiling artifacts ───────────────────────────────────────
DEBUG_PATTERNS=(
  '\.dump$'
  '\.heap$'
  '\.cpuprofile$'
  '\.heapsnapshot$'
  '^npm-debug\.log'
  '^yarn-error\.log'
)

# ── Raw test / coverage output ────────────────────────────────────────
OUTPUT_PATTERNS=(
  '\.out$'
  '^test-results\.'
  '^coverage-raw\.'
  '^junit.*\.xml$'
)

check_patterns() {
  local file="$1"
  shift
  local patterns=("$@")
  for pattern in "${patterns[@]}"; do
    basename=$(basename "$file")
    if echo "$basename" | grep -qiE "$pattern"; then
      return 0  # match found
    fi
  done
  return 1  # no match
}

echo "🚫 Checking for temporary / unofficial files..."

for file in $STAGED; do
  if check_patterns "$file" "${TEMP_PATTERNS[@]}"; then
    echo "  ❌ $file — temp/scratch file (remove or add to .gitignore)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  if check_patterns "$file" "${REPORT_PATTERNS[@]}"; then
    echo "  ❌ $file — draft/unofficial/WIP file (finalize or exclude)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  if check_patterns "$file" "${DEBUG_PATTERNS[@]}"; then
    echo "  ❌ $file — debug/profiling artifact (add to .gitignore)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  if check_patterns "$file" "${OUTPUT_PATTERNS[@]}"; then
    echo "  ❌ $file — raw test/coverage output (add to .gitignore)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi
done

if [ $VIOLATIONS -gt 0 ]; then
  echo ""
  echo "❌ $VIOLATIONS file(s) blocked — commit aborted."
  echo "   To bypass (not recommended): git commit --no-verify"
  exit 1
fi

echo "  ✅ No temporary or unofficial files staged"
exit 0
