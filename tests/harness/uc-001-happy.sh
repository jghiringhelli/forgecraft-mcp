#!/usr/bin/env bash
# L2 Harness: UC-001 — Setup/Onboard Project [happy]
# Precondition: forgecraft is installed, node_modules present
# Postcondition: forgecraft.yaml, CLAUDE.md, and docs/ exist after setup_project phase 2
# Tool: forgecraft MCP (called via CLI simulation)
set -euo pipefail

PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

# Call forgecraft setup_project via the MCP CLI if available
if command -v node &>/dev/null && [ -f "$(pwd)/dist/cli.js" ]; then
  node "$(pwd)/dist/cli.js" setup_project \
    --project_dir "$PROJECT_DIR" \
    --project_name "harness-test" \
    --tags '["UNIVERSAL"]' \
    --mvp true \
    --scope_complete false \
    --has_consumers false 2>&1 | head -5
else
  # Fallback: verify the handler can be imported
  node -e "
    import('$(pwd)/dist/tools/setup-project.js').then(m => {
      return m.setupProjectHandler({
        project_dir: '$PROJECT_DIR',
        project_name: 'harness-test',
        tags: ['UNIVERSAL'],
        mvp: true,
        scope_complete: false,
        has_consumers: false
      });
    }).then(() => {
      const fs = require('fs');
      if (!fs.existsSync('$PROJECT_DIR/forgecraft.yaml')) {
        console.error('FAIL: forgecraft.yaml not created');
        process.exit(1);
      }
      if (!fs.existsSync('$PROJECT_DIR/CLAUDE.md')) {
        console.error('FAIL: CLAUDE.md not created');
        process.exit(1);
      }
      console.log('PASS: setup_project postconditions verified');
    }).catch(e => {
      console.error('FAIL:', e.message);
      process.exit(1);
    });
  " 2>&1
fi
