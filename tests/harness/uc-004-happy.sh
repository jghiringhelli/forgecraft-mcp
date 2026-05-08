#!/usr/bin/env bash
# L2 Harness: UC-004 — Audit Compliance [happy]
# Precondition: project scaffolded with tags
# Postcondition: output contains numeric score and passing/failing sections
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

mkdir -p "$PROJECT_DIR/src" "$PROJECT_DIR/docs"
cat > "$PROJECT_DIR/forgecraft.yaml" << 'YAML'
projectName: audit-test
tags:
  - UNIVERSAL
  - API
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/audit.js').then(m => {
    return m.auditHandler({
      project_dir: '$PROJECT_DIR',
      tags: ['UNIVERSAL', 'API']
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.match(/\d+/) && (text.includes('Passing') || text.includes('Failing') || text.includes('score') || text.includes('Score'))) {
      console.log('PASS: audit output contains score and sections');
    } else {
      console.error('FAIL: audit missing expected score/sections');
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
