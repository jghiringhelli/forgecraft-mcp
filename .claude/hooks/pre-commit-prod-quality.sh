#!/bin/bash
STAGED=$(git diff --cached --name-only --diff-filter=ACM)

# Mutation gate: only on release/* or rc/* branches at pre-release phase
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if echo "$CURRENT_BRANCH" | grep -qE '^(release|rc)/'; then
  MUTATION_TOOL=$(node -e "
    const fs = require('fs');
    if (!fs.existsSync('forgecraft.yaml')) process.exit(0);
    const raw = fs.readFileSync('forgecraft.yaml', 'utf-8');
    const m = raw.match(/mutation:\s*(.+)/);
    if (m) console.log(m[1].trim());
  " 2>/dev/null)
  if [ -n "$MUTATION_TOOL" ]; then
    echo "🧬 Pre-release branch detected — running mutation gate..."
    if ! eval "$MUTATION_TOOL" 2>/dev/null; then
      echo "❌ Mutation testing failed — MSI below threshold. Fix before releasing."
      VIOLATIONS=$((VIOLATIONS + 1))
    else
      echo "✅ Mutation gate passed"
    fi
  else
    echo "⚠️  Pre-release branch — mutation tool not configured in forgecraft.yaml tools.mutation"
    WARNINGS=$((WARNINGS + 1))
  fi
fi
SOURCE_FILES=$(echo "$STAGED" | grep -E '\.(py|ts|tsx|js|jsx)$' | grep -vE '(test_|\.test\.|\.spec\.|__tests__|tests/|fixtures/|mock|conftest)')
if [ -z "$SOURCE_FILES" ]; then exit 0; fi
VIOLATIONS=0
WARNINGS=0

# Check if a file is covered by a hook exception in .forgecraft/exceptions.json
# Usage: is_excepted "layer-boundary" "src/migrations/001.ts"
is_excepted() {
  local hook_name="$1"
  local file_path="$2"
  if [ ! -f ".forgecraft/exceptions.json" ]; then return 1; fi
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('.forgecraft/exceptions.json', 'utf-8'));
    const exc = (data.exceptions || []).find(e => {
      if (e.hook !== '$hook_name') return false;
      const pat = e.pattern.replace(/\\/g, '/').replace(/\./g, '\\\\.').replace(/\*\*/g, '<<<D>>>').replace(/\*/g, '[^/]*').replace(/<<<D>>>/g, '.*');
      return new RegExp('^' + pat + '$').test('$file_path'.replace(/\\\\/g, '/'));
    });
    if (exc) { console.log('EXCEPTED: ' + exc.reason); process.exit(0); }
    process.exit(1);
  " 2>/dev/null
}

echo "🔍 Scanning for production code anti-patterns..."
for file in $SOURCE_FILES; do
  if echo "$file" | grep -vqE '(config|settings|\.env)'; then
    if grep -nE '(localhost|127\.0\.0\.1|0\.0\.0\.0)' "$file" | grep -vE '(#|//|""")' > /tmp/violations 2>/dev/null; then
      if [ -s /tmp/violations ]; then
        echo "  ❌ $file — hardcoded URL/host"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    fi
  fi
  if ! is_excepted "anti-pattern/mock-data" "$file"; then
    if grep -nEi '\b(mock_data|fake_data|dummy_data|stub_response)' "$file" > /tmp/violations 2>/dev/null; then
      if [ -s /tmp/violations ]; then
        echo "  ❌ $file — mock/stub data in production code"
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    fi
  fi

  # Layer boundary: no direct DB/ORM imports from route handlers / controllers
  if echo "$file" | grep -qE '(routes|controllers|handlers|endpoints)'; then
    if ! is_excepted "layer-boundary" "$file"; then
      if grep -nE '\b(prisma\.|knex\(|mongoose\.|sequelize\.|db\.query|pool\.query)' "$file" > /tmp/violations 2>/dev/null; then
        if [ -s /tmp/violations ]; then
          echo "  ❌ $file — direct DB call in route/controller (layer violation)"
          VIOLATIONS=$((VIOLATIONS + 1))
        fi
      fi
    fi
  fi

  # Bare Error throws in business logic (not test files)
  if ! is_excepted "error-hierarchy" "$file"; then
    if grep -nE 'throw new Error\(' "$file" > /tmp/violations 2>/dev/null; then
      if [ -s /tmp/violations ]; then
        echo "  ⚠️  $file — bare 'throw new Error()' found — use custom error hierarchy"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  fi

  # Line count is not a SOLID metric — a focused 500-line file is better than
  # two unfocused 200-line files. Responsibility drift is caught in code review.
done
rm -f /tmp/violations

# .env drift detection
if [ -f ".env.example" ] && [ -f ".env" ]; then
  MISSING_VARS=""
  while IFS= read -r line; do
    # Extract variable name from .env.example (skip comments and empty lines)
    if echo "$line" | grep -qE '^[A-Z_]+='; then
      VAR_NAME=$(echo "$line" | cut -d= -f1)
      if ! grep -qE "^${VAR_NAME}=" .env 2>/dev/null; then
        MISSING_VARS="$MISSING_VARS $VAR_NAME"
      fi
    fi
  done < .env.example
  if [ -n "$MISSING_VARS" ]; then
    echo "  ⚠️  .env is missing variables from .env.example:$MISSING_VARS"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

if [ $VIOLATIONS -gt 0 ]; then
  echo "❌ $VIOLATIONS violation(s) found — commit blocked."
  exit 1
fi
if [ $WARNINGS -gt 0 ]; then
  echo "⚠️  $WARNINGS warning(s) found — review recommended."
fi
echo "🔍 Production quality scan passed"
