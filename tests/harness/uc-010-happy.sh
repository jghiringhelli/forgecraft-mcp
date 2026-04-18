#!/usr/bin/env bash
# L2 Harness: UC-010 — Generate ADR [happy]
# Postcondition: A new ADR file exists in docs/adrs/ with correct sequence number
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

mkdir -p "$PROJECT_DIR/docs/adrs"

RESULT=$(node -e "
  import('$(pwd)/dist/tools/generate-adr.js').then(m => {
    return m.generateAdrHandler({
      project_dir: '$PROJECT_DIR',
      adr_title: 'Use TypeScript for type safety',
      adr_context: 'Need strong typing across the codebase',
      adr_decision: 'Adopt TypeScript as the primary language',
      adr_consequences: 'Improved IDE support and fewer runtime errors'
    });
  }).then(result => {
    const text = result.content[0].text;
    const fs = require('fs');
    const adrs = fs.readdirSync('$PROJECT_DIR/docs/adrs');
    if (adrs.length > 0 && (text.includes('ADR') || text.includes('TypeScript') || text.includes('created'))) {
      console.log('PASS: ADR file created in docs/adrs/ -', adrs[0]);
    } else {
      console.error('FAIL: ADR file not created or output unexpected');
      console.error('Files:', adrs);
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
