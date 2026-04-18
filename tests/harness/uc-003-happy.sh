#!/usr/bin/env bash
# L2 Harness: UC-003 — Generate Bound Session Prompt [happy]
# Precondition: project scaffolded, cascade ready
# Postcondition: session prompt contains item_description and acceptance criteria
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Minimal scaffold
mkdir -p "$PROJECT_DIR/docs"
cat > "$PROJECT_DIR/forgecraft.yaml" << 'YAML'
projectName: session-test
tags:
  - UNIVERSAL
YAML
cat > "$PROJECT_DIR/CLAUDE.md" << 'YAML'
# Session Test
YAML

RESULT=$(node -e "
  import('$(pwd)/dist/tools/generate-session-prompt.js').then(m => {
    return m.generateSessionPromptHandler({
      project_dir: '$PROJECT_DIR',
      item_description: 'Implement the login endpoint with JWT authentication'
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.includes('login') || text.includes('JWT') || text.includes('authentication')) {
      console.log('PASS: session prompt contains item_description content');
    } else {
      console.error('FAIL: session prompt missing item_description content');
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
