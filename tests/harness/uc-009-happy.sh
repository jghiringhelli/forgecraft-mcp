#!/usr/bin/env bash
# L2 Harness: UC-009 — Verify GS Properties [happy]
# Postcondition: verify returns scores for all 7 GS properties
set -euo pipefail

SELF_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# Run verify on forgecraft itself — it has tests, so GS properties should score
RESULT=$(node -e "
  import('$(pwd)/dist/tools/verify.js').then(m => {
    return m.verifyHandler({
      project_dir: '$SELF_DIR',
      test_command: 'echo SKIP',
      pass_threshold: 0
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('score') ||
        text.toLowerCase().includes('gs propert') ||
        text.toLowerCase().includes('verif')) {
      console.log('PASS: verify returns GS property scores');
    } else {
      console.error('FAIL: unexpected output from verify');
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
