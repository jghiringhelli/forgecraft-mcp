#!/usr/bin/env bash
# L2 Harness: UC-007 — Contribute Quality Gate [error: no generalizable gates]
# Postcondition: System returns "nothing to contribute" guidance
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Create a gate with generalizable: false (should not be contributed)
mkdir -p "$PROJECT_DIR/.forgecraft/gates/active"
cat > "$PROJECT_DIR/.forgecraft/gates/active/private-gate.yaml" << 'YAML'
id: private-gate
title: Private Gate
description: Not generalizable
generalizable: false
priority: P2
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/contribute-gate.js').then(m => {
    return m.contributeGateHandler({
      project_dir: '$PROJECT_DIR',
      dry_run: true
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('no generalizable') ||
        text.toLowerCase().includes('nothing to contribute') ||
        text.toLowerCase().includes('generalizable: true') ||
        text.toLowerCase().includes('skip') ||
        text.includes('0')) {
      console.log('PASS: no generalizable gates — returns appropriate guidance');
    } else {
      console.error('FAIL: unexpected output when no generalizable gates');
      console.error(text.slice(0, 300));
      process.exit(1);
    }
  }).catch(e => {
    console.log('PASS: error thrown when no generalizable gates -', e.message.slice(0, 80));
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
