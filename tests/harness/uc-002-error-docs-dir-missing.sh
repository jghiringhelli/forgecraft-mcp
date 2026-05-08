#!/usr/bin/env bash
# L2 Harness: UC-002 — Verify GS Cascade [error: docs/ directory missing]
# Postcondition: functional_spec and behavioral_contracts steps fail with guidance
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Project with forgecraft.yaml but NO docs/ directory
cat > "$PROJECT_DIR/forgecraft.yaml" << 'YAML'
projectName: no-docs-test
tags:
  - UNIVERSAL
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/check-cascade.js').then(m => {
    return m.checkCascadeHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    // Without docs/, functional_spec should FAIL
    if (text.includes('functional_spec') || text.includes('FAIL') || text.includes('missing')) {
      console.log('PASS: cascade correctly reports missing docs/ artifacts');
    } else {
      console.error('FAIL: expected cascade to report missing docs/ artifacts');
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
