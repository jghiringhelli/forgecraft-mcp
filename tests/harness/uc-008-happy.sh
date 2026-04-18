#!/usr/bin/env bash
# L2 Harness: UC-008 — Read Gate Violations [happy]
# Postcondition: read_gate_violations returns structured violation list
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

mkdir -p "$PROJECT_DIR/.forgecraft"
cat > "$PROJECT_DIR/.forgecraft/gate-violations.jsonl" << 'JSONL'
{"hookName":"pre-commit","gateId":"test-gate","message":"Test violation","timestamp":"2026-04-17T00:00:00.000Z","resolved":false}
JSONL

RESULT=$(node -e "
  import('$(pwd)/dist/tools/read-gate-violations.js').then(m => {
    return m.readGateViolationsHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.includes('violation') || text.includes('gate') || text.includes('Test violation')) {
      console.log('PASS: read_gate_violations returns violation data');
    } else {
      console.error('FAIL: no violation data in output');
      console.error(text.slice(0, 300));
      process.exit(1);
    }
  }).catch(e => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
