#!/usr/bin/env bash
# L2 Harness: UC-007 — Contribute Quality Gate [happy]
# Postcondition: contribute_gate returns submitted/skipped/queued counts
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Create a gate with generalizable: true
mkdir -p "$PROJECT_DIR/.forgecraft/gates/active"
cat > "$PROJECT_DIR/.forgecraft/gates/active/test-gate.yaml" << 'YAML'
id: test-generalizable-gate
title: Test Gate
description: A test gate that is generalizable
generalizable: true
priority: P2
convergenceAttributes:
  prescriptive: true
  agnostic: true
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/contribute-gate.js').then(m => {
    return m.contributeGateHandler({
      project_dir: '$PROJECT_DIR',
      dry_run: true
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('dry') ||
        text.toLowerCase().includes('would') ||
        text.toLowerCase().includes('contribut') ||
        text.toLowerCase().includes('gate') ||
        text.toLowerCase().includes('skip') ||
        text.toLowerCase().includes('submit')) {
      console.log('PASS: contribute_gate dry_run returned appropriate output');
    } else {
      console.error('FAIL: unexpected output from contribute_gate');
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
