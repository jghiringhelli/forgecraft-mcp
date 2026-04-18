#!/usr/bin/env bash
# L2 Harness: UC-006 — Check Layer Status [happy]
# Postcondition: layer_status output contains L1, L2, L3, and L4 sections
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Scaffold minimal project with use-cases.md and harness spec
mkdir -p "$PROJECT_DIR/docs" "$PROJECT_DIR/.forgecraft/harness"
cat > "$PROJECT_DIR/docs/use-cases.md" << 'MD'
# Use Cases

## UC-001: Test Setup

**Actor**: Developer
**Precondition**: forgecraft is installed
**Postcondition**: forgecraft.yaml exists
MD

cat > "$PROJECT_DIR/.forgecraft/harness/uc-001.yaml" << 'YAML'
uc: UC-001
title: Test Setup
probes:
  - id: probe-1
    type: mcp_call
    scenario: happy
    description: test
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/layer-status.js').then(m => {
    return m.layerStatusHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.includes('L1') && text.includes('L2') && text.includes('L3') && text.includes('L4')) {
      console.log('PASS: layer_status output contains all four layer sections');
    } else {
      console.error('FAIL: missing layer sections in output');
      console.error(text.slice(0, 400));
      process.exit(1);
    }
  }).catch(e => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
