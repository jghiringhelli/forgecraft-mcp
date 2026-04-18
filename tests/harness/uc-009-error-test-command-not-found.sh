#!/usr/bin/env bash
# L2 Harness: UC-009 — Verify GS Properties [error: test command not found]
# Postcondition: System returns non-throwing result for timeout/failure case
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

RESULT=$(node -e "
  import('$(pwd)/dist/tools/verify.js').then(m => {
    return m.verifyHandler({
      project_dir: '$PROJECT_DIR',
      test_command: 'nonexistent-command-that-does-not-exist',
      pass_threshold: 0
    });
  }).then(result => {
    const text = result.content[0].text;
    // Should return non-throwing result, possibly with error/low score info
    if (text.toLowerCase().includes('score') ||
        text.toLowerCase().includes('error') ||
        text.toLowerCase().includes('fail') ||
        text.toLowerCase().includes('not found') ||
        text.toLowerCase().includes('verif')) {
      console.log('PASS: verify handles missing test command without throwing');
    } else {
      console.error('FAIL: unexpected output for missing test command');
      console.error(text.slice(0, 300));
      process.exit(1);
    }
  }).catch(e => {
    console.error('FAIL: verify threw instead of returning result:', e.message);
    process.exit(1);
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
