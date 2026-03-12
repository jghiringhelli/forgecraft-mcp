#!/bin/bash
COVERAGE_MIN=80

# If src/ files are staged the coverage hook (pre-commit-coverage.sh) will run
# the full test + coverage pass. Skip the bare test run here to avoid executing
# 471 tests twice on the same commit.
STAGED=$(git diff --cached --name-only --diff-filter=ACM)
SRC_STAGED=0
while IFS= read -r file; do
  if echo "$file" | grep -qE '^src/'; then
    SRC_STAGED=1
    break
  fi
done <<< "$STAGED"

if [ "$SRC_STAGED" -eq 1 ]; then
  echo "🧪 src/ files staged — tests will run via coverage gate, skipping bare run."
  exit 0
fi

echo "🧪 Running tests..."
if [ -f "package.json" ]; then
  if grep -q '"vitest"' package.json 2>/dev/null; then
    npx vitest run --reporter=verbose 2>&1
    if [ $? -ne 0 ]; then
      echo "❌ Tests failed."
      exit 1
    fi
    echo "  ✅ Tests passed"
  elif grep -q '"jest"' package.json 2>/dev/null; then
    npx jest --passWithNoTests --coverage \
      --coverageThreshold="{\"global\":{\"lines\":$COVERAGE_MIN}}" \
      --silent 2>&1
    if [ $? -ne 0 ]; then
      echo "❌ Jest tests failed or coverage below ${COVERAGE_MIN}%."
      exit 1
    fi
    echo "  ✅ Jest tests passed"
  fi
fi
if [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
  if command -v pytest &> /dev/null; then
    pytest --tb=short --quiet --cov=src --cov-fail-under=$COVERAGE_MIN 2>&1
    if [ $? -ne 0 ]; then
      echo "❌ Tests failed or coverage below ${COVERAGE_MIN}%."
      exit 1
    fi
    echo "  ✅ Python tests passed"
  fi
fi
echo "🧪 All tests passed"
