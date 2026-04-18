#!/usr/bin/env bash
# L2 Harness: UC-005 — Close Development Cycle [error: cascade fails required step]
# Postcondition: cycle blocked; system lists which steps must pass first
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Empty project — cascade will fail required steps

RESULT=$(node -e "
  import('$(pwd)/dist/tools/close-cycle.js').then(m => {
    return m.closeCycleHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('blocked') || text.toLowerCase().includes('fail') ||
        text.toLowerCase().includes('cascade') || text.toLowerCase().includes('required')) {
      console.log('PASS: close_cycle indicates blocked or failing cascade');
    } else {
      console.error('FAIL: close_cycle should indicate cascade failure on empty project');
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
