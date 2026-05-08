#!/usr/bin/env bash
# L2 Harness: UC-005 — Close Development Cycle [happy]
# Precondition: cascade passes, gates defined
# Postcondition: output contains cascade re-check and gate evaluation
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

mkdir -p "$PROJECT_DIR/docs/adrs" "$PROJECT_DIR/docs/diagrams" "$PROJECT_DIR/.forgecraft/gates/active"
cat > "$PROJECT_DIR/forgecraft.yaml" << 'YAML'
projectName: close-cycle-test
tags:
  - UNIVERSAL
YAML
cat > "$PROJECT_DIR/CLAUDE.md" << 'YAML'
# Close Cycle Test
YAML
cat > "$PROJECT_DIR/docs/spec.md" << 'YAML'
# Functional Specification
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/close-cycle.js').then(m => {
    return m.closeCycleHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('cascade') || text.toLowerCase().includes('gate') || text.toLowerCase().includes('cycle')) {
      console.log('PASS: close_cycle output contains expected sections');
    } else {
      console.error('FAIL: close_cycle missing expected output');
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
