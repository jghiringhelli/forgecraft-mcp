#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Post-commit Generator: Complexity baseline updater
#
# Fires after every commit touching src/ files. Runs lizard on the src/
# directory and stores a timestamped baseline in .complexity/.
# Enables Complexity-Watch MCP tool and diff_baseline queries.
#
# Requires: lizard (pip install lizard) — silently skips if absent
#
# Trigger: post-commit git hook
# Exit: Always 0 (advisory — never blocks)
# ──────────────────────────────────────────────────────────────────────

# Only run if src/ files were part of this commit
SRC_CHANGED=$(git diff-tree --no-commit-id -r --name-only HEAD 2>/dev/null | grep -c "^src/" || true)
if [ "$SRC_CHANGED" -eq 0 ]; then
  exit 0
fi

# Require lizard
if ! command -v lizard &>/dev/null; then
  echo "💡 Complexity baseline skipped — install lizard to enable: pip install lizard"
  exit 0
fi

BASELINE_DIR=".complexity"
mkdir -p "$BASELINE_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
HASH=$(git log -1 --pretty=%h 2>/dev/null)
BASELINE_FILE="${BASELINE_DIR}/baseline-${TIMESTAMP}-${HASH}.json"

# Run lizard, capture JSON output
lizard src/ --json > "$BASELINE_FILE" 2>/dev/null
LIZARD_EXIT=$?

if [ $LIZARD_EXIT -ne 0 ] || [ ! -s "$BASELINE_FILE" ]; then
  rm -f "$BASELINE_FILE"
  exit 0
fi

# Update latest pointer
cp "$BASELINE_FILE" "${BASELINE_DIR}/latest.json"

# Compute summary stats using python (lizard's own runtime dependency)
STATS=$(python3 - <<'PYEOF' 2>/dev/null
import json, sys
try:
    data = json.load(open('.complexity/latest.json'))
    fns = data.get('function_list', [])
    if not fns:
        print('no functions found')
        sys.exit(0)
    ccns = [f['cyclomatic_complexity'] for f in fns]
    avg = sum(ccns) / len(ccns)
    high = [f for f in fns if f['cyclomatic_complexity'] > 10]
    critical = [f for f in fns if f['cyclomatic_complexity'] > 15]
    print(f'avg={avg:.1f}, {len(fns)} functions, {len(high)} above 10, {len(critical)} critical (>15)')
except Exception as e:
    print(f'parse error: {e}')
PYEOF
)

echo "📊 Complexity baseline saved — ${STATS}"
echo "   → ${BASELINE_FILE}"
exit 0
