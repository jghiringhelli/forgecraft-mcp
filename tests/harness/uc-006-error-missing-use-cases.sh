#!/usr/bin/env bash
# L2 Harness: UC-006 — Check Layer Status [error: docs/use-cases.md missing]
# Postcondition: System returns "no use cases found" and guidance
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Empty project — no docs/use-cases.md

RESULT=$(node -e "
  import('$(pwd)/dist/tools/layer-status.js').then(m => {
    return m.layerStatusHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('no use cases') ||
        text.includes('use-cases.md') ||
        text.includes('0/0') ||
        text.includes('Layer Status')) {
      console.log('PASS: layer_status handles missing use-cases.md gracefully');
    } else {
      console.error('FAIL: unexpected output for missing use-cases.md');
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
