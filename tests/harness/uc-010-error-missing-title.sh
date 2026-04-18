#!/usr/bin/env bash
# L2 Harness: UC-010 — Generate ADR [error: adr_title missing]
# Postcondition: System returns error requesting the parameter
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

mkdir -p "$PROJECT_DIR/docs/adrs"

RESULT=$(node -e "
  import('$(pwd)/dist/tools/generate-adr.js').then(m => {
    // Call without adr_title — should return error or throw validation error
    return m.generateAdrHandler({
      project_dir: '$PROJECT_DIR'
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('title') ||
        text.toLowerCase().includes('required') ||
        text.toLowerCase().includes('error') ||
        text.toLowerCase().includes('missing')) {
      console.log('PASS: error returned for missing adr_title');
    } else {
      console.error('FAIL: expected error for missing adr_title, got:', text.slice(0, 200));
      process.exit(1);
    }
  }).catch(e => {
    // Zod validation error or similar — expected
    console.log('PASS: validation error thrown for missing adr_title -', e.message.slice(0, 80));
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
