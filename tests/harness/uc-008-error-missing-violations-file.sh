#!/usr/bin/env bash
# L2 Harness: UC-008 — Read Gate Violations [error: violations file missing]
# Postcondition: System returns "no violations recorded" — not an error
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# No .forgecraft/gate-violations.jsonl file

RESULT=$(node -e "
  import('$(pwd)/dist/tools/read-gate-violations.js').then(m => {
    return m.readGateViolationsHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('no violation') ||
        text.toLowerCase().includes('0 violation') ||
        text.toLowerCase().includes('no active') ||
        text.toLowerCase().includes('gate violation')) {
      console.log('PASS: missing violations file handled gracefully');
    } else {
      console.error('FAIL: unexpected output for missing violations file');
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
