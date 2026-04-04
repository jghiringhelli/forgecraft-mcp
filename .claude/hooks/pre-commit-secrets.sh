#!/bin/bash
PATTERNS=(
  'AKIA[0-9A-Z]{16}'
  'password\s*=\s*["\x27][^"\x27]+'
  'BEGIN RSA PRIVATE KEY'
  'sk-[a-zA-Z0-9]{48}'
  'ghp_[a-zA-Z0-9]{36}'
)
# Directories that legitimately contain pattern definitions as examples
EXEMPT_PREFIXES=("templates/" ".forgecraft/gates/" "tests/" ".claude/hooks/")

STAGED=$(git diff --cached --name-only)
for file in $STAGED; do
  skip=0
  for prefix in "${EXEMPT_PREFIXES[@]}"; do
    if [[ "$file" == ${prefix}* ]]; then skip=1; break; fi
  done
  [[ $skip -eq 1 ]] && continue
  for pattern in "${PATTERNS[@]}"; do
    if grep -qE "$pattern" "$file" 2>/dev/null; then
      echo "❌ Potential secret found in $file matching pattern"
      exit 1
    fi
  done
done
