#!/bin/bash
# pre-commit-audit.sh — Block HIGH/CRITICAL CVEs at commit time.
# Protocols mandate: "If audit is not in pre-commit, the gate does not exist."
# Only runs when package manifests or src/ files are staged.

STAGED=$(git diff --cached --name-only 2>/dev/null)

if ! echo "$STAGED" | grep -qE '(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|src/)'; then
  exit 0
fi

echo "🔍 Running dependency audit..."

# ── npm ──────────────────────────────────────────────────────────────────
if [ -f "package.json" ] && command -v npm &>/dev/null; then
  AUDIT_OUT=$(npm audit --audit-level=high 2>&1)
  AUDIT_EXIT=$?
  if [ $AUDIT_EXIT -ne 0 ]; then
    echo "❌ npm audit: HIGH or CRITICAL vulnerabilities found."
    echo "$AUDIT_OUT" | grep -E "(High|Critical|high|critical)" | head -20
    echo ""
    echo "   Fix: npm audit fix"
    echo "   Breaking changes: npm audit fix --force  (review carefully)"
    exit 1
  fi
  echo "  ✅ No HIGH/CRITICAL CVEs (npm)"
fi

# ── Python ───────────────────────────────────────────────────────────────
if [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
  if command -v pip-audit &>/dev/null; then
    pip-audit 2>&1
    if [ $? -ne 0 ]; then
      echo "❌ pip-audit: vulnerabilities found"
      exit 1
    fi
    echo "  ✅ No CVEs (Python)"
  fi
fi

# ── Rust ─────────────────────────────────────────────────────────────────
if [ -f "Cargo.toml" ]; then
  if command -v cargo-audit &>/dev/null; then
    cargo audit 2>&1
    if [ $? -ne 0 ]; then
      echo "❌ cargo audit: vulnerabilities found"
      exit 1
    fi
    echo "  ✅ No CVEs (Rust)"
  fi
fi

echo "🔍 Dependency audit passed"
exit 0
