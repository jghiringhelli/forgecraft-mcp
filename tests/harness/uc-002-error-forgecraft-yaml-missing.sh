#!/usr/bin/env bash
# L2 Harness: UC-002 — Verify GS Cascade [error: forgecraft.yaml missing]
# Postcondition: cascade shown as unconfigured; all steps FAIL
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

RESULT=$(node -e "
  import('$(pwd)/dist/tools/check-cascade.js').then(m => {
    return m.checkCascadeHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.includes('FAIL') || text.toLowerCase().includes('missing') || text.toLowerCase().includes('not found')) {
      console.log('PASS: cascade returns failures when forgecraft.yaml missing');
    } else {
      console.error('FAIL: cascade did not return expected failure state');
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
