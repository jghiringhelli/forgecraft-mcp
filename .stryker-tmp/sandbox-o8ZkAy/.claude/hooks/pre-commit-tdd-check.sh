#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Pre-Commit Hook: TDD Phase Gate Enforcement
#
# Enforces:
#   RED gate:    Test-only commits must have at least one failing test.
#                A test-only commit where all tests pass means the test
#                was written after the implementation — TDD phase violated.
#
#   Source gate: Implementation commits with no test changes emit a
#                warning. Legitimate for config/infra; violation for
#                feature/fix commits.
#
# Note: This hook cannot read the commit message (pre-commit runs before
# commit-msg). It infers the commit type from the file pattern instead.
#
# Trigger: git pre-commit (via scripts/setup-hooks.sh)
# Exit: 1 blocks commit (RED gate violation), 0 allows (with warnings)
# ──────────────────────────────────────────────────────────────────────

STAGED=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED" ]; then
  exit 0
fi

# ── Detect source vs test pattern ─────────────────────────────────────
# Patterns are intentionally broad to work across JS/TS/Python/Go/etc.
SRC_PATTERNS='^(src|lib|app|server|client|pkg|internal|cmd)/'
TEST_PATTERNS='^(tests?|spec|__tests__)/'
TEST_FILE_PATTERNS='\.(test|spec)\.(ts|tsx|js|jsx|mjs|py|go|rb|java|kt)$'

SRC_FILES=()
TEST_FILES=()

while IFS= read -r file; do
  if echo "$file" | grep -qE "$SRC_PATTERNS"; then
    SRC_FILES+=("$file")
  elif echo "$file" | grep -qE "$TEST_PATTERNS"; then
    TEST_FILES+=("$file")
  elif echo "$file" | grep -qE "$TEST_FILE_PATTERNS"; then
    TEST_FILES+=("$file")
  fi
done <<< "$STAGED"

SRC_COUNT=${#SRC_FILES[@]}
TEST_COUNT=${#TEST_FILES[@]}

# ── Scenario 1: Test-only commit — RED gate ──────────────────────────
# If only test files are staged, run them. All passing = RED gate fail.
if [ "$TEST_COUNT" -gt 0 ] && [ "$SRC_COUNT" -eq 0 ]; then
  echo "🔴 TDD gate: test-only commit detected — running staged tests..."

  # Detect test runner
  RUN_CMD=""
  if [ -f "package.json" ]; then
    if grep -q '"vitest"' package.json 2>/dev/null; then
      RUN_CMD="npx vitest run"
    elif grep -q '"jest"' package.json 2>/dev/null; then
      RUN_CMD="npx jest --passWithNoTests"
    else
      RUN_CMD="npm test --"
    fi
  elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
    RUN_CMD="python -m pytest"
  fi

  if [ -z "$RUN_CMD" ]; then
    echo "  ⚠️  Cannot detect test runner — skipping RED gate check"
    exit 0
  fi

  # Build the list of test files to run
  TEST_ARGS=()
  for f in "${TEST_FILES[@]}"; do
    TEST_ARGS+=("$f")
  done

  # Run the staged tests and capture exit code
  # Exit 0 = all pass (VIOLATION in RED phase)
  # Exit non-zero = at least one fails (CORRECT for RED phase)
  $RUN_CMD "${TEST_ARGS[@]}" > /tmp/tdd-check-output.txt 2>&1
  TEST_EXIT=$?

  if [ $TEST_EXIT -eq 0 ]; then
    echo ""
    echo "❌ TDD RED gate violation: all staged tests PASS"
    echo ""
    echo "   A test-only commit where all tests pass means either:"
    echo "     (a) The tests were written after the implementation already exists"
    echo "     (b) The tests are vacuously true (testing nothing real)"
    echo ""
    echo "   A RED commit must contain at least one FAILING test."
    echo "   If (a) is true: this was written test-after — reconsider the approach."
    echo "   If (b) is true: the test assertions need to be strengthened."
    echo ""
    echo "   Test output:"
    cat /tmp/tdd-check-output.txt | head -40
    echo ""
    echo "   To bypass (only if you are committing improvements to an existing"
    echo "   passing test without a corresponding implementation change):"
    echo "   git commit --no-verify"
    echo ""
    exit 1
  else
    echo "  ✅ RED gate satisfied — staged tests fail as expected"
    # Print a 1-line summary of which tests failed
    grep -E 'FAIL|failed|Error|✕|×' /tmp/tdd-check-output.txt | head -5 || true
    echo ""
  fi
fi

# ── Scenario 2: Source-only commit — implementation without tests ─────
# This is a warning, not a block: config, infra, and refactor commits are
# legitimate source-only commits. Feature and fix commits are not.
if [ "$SRC_COUNT" -gt 0 ] && [ "$TEST_COUNT" -eq 0 ]; then
  echo ""
  echo "⚠️  TDD warning: implementation files committed without test changes"
  echo "   Changed source files:"
  for f in "${SRC_FILES[@]}"; do
    echo "     $f"
  done
  echo ""
  echo "   If this is a feature or bug fix: a preceding test(scope): [RED] commit"
  echo "   should exist in this branch's history. Verify with:"
  echo "     git log --oneline -10"
  echo ""
  echo "   Legitimate source-only commits: config, environment, CI, migration scripts."
  echo "   Continuing — this is a warning only."
  echo ""
fi

exit 0
