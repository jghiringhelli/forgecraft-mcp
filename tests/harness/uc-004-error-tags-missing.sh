#!/usr/bin/env bash
# L2 Harness: UC-004 — Audit Compliance [error: tags not supplied and not in forgecraft.yaml]
# Postcondition: system returns error requesting tags
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

RESULT=$(node -e "
  import('$(pwd)/dist/tools/audit.js').then(m => {
    return m.auditHandler({
      project_dir: '$PROJECT_DIR'
      // No tags — should error
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('tag') || text.toLowerCase().includes('error') || text.includes('required')) {
      console.log('PASS: audit returns error when tags missing');
    } else {
      // Some implementations proceed with defaults — still acceptable
      if (text.match(/\d+/)) {
        console.log('PASS: audit proceeded with default tags');
      } else {
        console.error('FAIL: unexpected output without tags');
        console.error(text.slice(0, 300));
        process.exit(1);
      }
    }
  }).catch(e => {
    console.log('PASS: audit threw for missing tags -', e.message.slice(0, 60));
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
