#!/usr/bin/env bash
# L2 Harness: UC-002 — Verify GS Cascade [happy]
# Precondition: project is scaffolded (has forgecraft.yaml, CLAUDE.md, docs/)
# Postcondition: cascade output shown with functional_spec and constitution steps
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Scaffold minimal project structure
mkdir -p "$PROJECT_DIR/docs/adrs" "$PROJECT_DIR/docs/diagrams"
cat > "$PROJECT_DIR/forgecraft.yaml" << 'YAML'
projectName: cascade-test
tags:
  - UNIVERSAL
YAML
cat > "$PROJECT_DIR/CLAUDE.md" << 'YAML'
# Cascade Test Project
YAML
cat > "$PROJECT_DIR/docs/spec.md" << 'YAML'
# Functional Specification
## Use Cases
- UC-001: Test cascade
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/check-cascade.js').then(m => {
    return m.checkCascadeHandler({ project_dir: '$PROJECT_DIR' });
  }).then(result => {
    const text = result.content[0].text;
    if (text.includes('functional_spec') || text.includes('constitution')) {
      console.log('PASS: cascade output contains expected steps');
    } else {
      console.error('FAIL: cascade output missing expected steps');
      console.error(text.slice(0, 200));
      process.exit(1);
    }
  }).catch(e => {
    console.error('FAIL:', e.message);
    process.exit(1);
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
