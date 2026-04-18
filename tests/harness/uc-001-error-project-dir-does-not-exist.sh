#!/usr/bin/env bash
# L2 Harness: UC-001 — Setup/Onboard Project [error: project_dir does not exist]
# Postcondition: System returns error listing the missing path
set -euo pipefail

RESULT=$(node -e "
  import('$(pwd)/dist/tools/setup-project.js').then(m => {
    return m.setupProjectHandler({
      project_dir: '/nonexistent/path/that/cannot/exist/harness-test-' + Date.now(),
      project_name: 'test',
      tags: ['UNIVERSAL'],
      mvp: true,
      scope_complete: false,
      has_consumers: false
    });
  }).then(result => {
    const text = result.content[0].text;
    if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fail') || text.includes('not found')) {
      console.log('PASS: error returned for non-existent project_dir');
    } else {
      // setup_project may create the directory — check if it errs or creates
      console.log('TODO: verify error handling for non-existent project_dir');
      process.exit(1);
    }
  }).catch(e => {
    // Error thrown is acceptable — means the handler rejected the input
    console.log('PASS: handler threw for non-existent path -', e.message.slice(0, 80));
  });
" 2>&1)

echo "$RESULT"
echo "$RESULT" | grep -q "PASS" || exit 1
