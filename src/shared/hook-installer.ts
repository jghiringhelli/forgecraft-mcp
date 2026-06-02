/**
 * Git hook installation and audit utilities.
 *
 * Architecture: manifest-driven dispatchers.
 *
 *   .git/hooks/<type>       — generic dispatcher, installed once, never changes.
 *                             Reads the ordered list from .claude/hooks/<type>.list
 *                             and runs each script in sequence.
 *
 *   .claude/hooks/<type>.list — versioned manifest, one script filename per line.
 *                              add_hook appends here; no re-scaffold needed.
 *
 *   .claude/hooks/*.sh      — the actual check scripts.
 *
 * Public API:
 *   auditHookInstallation   — synchronous audit of installation state.
 *   installGitHooks         — write dispatchers + default manifests.
 *   appendToHookManifest    — append a script to a manifest (used by add_hook).
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────

export interface HookInstallationResult {
  readonly hasHookSource: boolean;
  readonly sourceHookCount: number;
  readonly installedGitHooks: string[];
  readonly missingGitHooks: string[];
  readonly allInstalled: boolean;
  readonly issues: string[];
}

export interface HookInstallResult {
  readonly installed: string[];
  readonly skipped: string[];
  readonly notAGitRepo: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────

const EXPECTED_GIT_HOOKS = [
  "pre-commit",
  "commit-msg",
  "post-commit",
  "prepare-commit-msg",
  "pre-push",
] as const;

type GitHookType = (typeof EXPECTED_GIT_HOOKS)[number];

/** Default ordered scripts per hook type. Only scripts that exist are run. */
const DEFAULT_MANIFEST: Record<GitHookType, string[]> = {
  "pre-commit": [
    "pre-commit-no-temp-files.sh",
    "pre-commit-secrets.sh",
    "pre-commit-prod-quality.sh",
    "pre-commit-branch-check.sh",
    "pre-commit-format.sh",
    "pre-commit-compile.sh",
    "pre-commit-import-cycles.sh",
    "pre-commit-tdd-check.sh",
    "pre-commit-test.sh",
    "pre-commit-coverage.sh",
    "pre-commit-audit.sh",
    "pre-commit-doc-cascade.sh",
  ],
  "commit-msg": ["commit-msg.sh", "commit-msg-cascade.sh"],
  "post-commit": [
    "post-commit-changelog.sh",
    "post-commit-complexity-baseline.sh",
  ],
  "prepare-commit-msg": ["prepare-commit-msg-usecase.sh"],
  "pre-push": [],
};

// ── Audit ─────────────────────────────────────────────────────────────

export function auditHookInstallation(
  projectDir: string,
): HookInstallationResult {
  const hooksSourceDir = join(projectDir, ".claude", "hooks");
  const gitHooksDir = join(projectDir, ".git", "hooks");

  const hasHookSource = existsSync(hooksSourceDir);
  let sourceHookCount = 0;
  if (hasHookSource) {
    try {
      sourceHookCount = readdirSync(hooksSourceDir).filter((f) =>
        f.endsWith(".sh"),
      ).length;
    } catch {
      sourceHookCount = 0;
    }
  }

  const isGitRepo = existsSync(join(projectDir, ".git"));
  const installedGitHooks: string[] = [];
  const missingGitHooks: string[] = [];

  if (isGitRepo) {
    for (const hookType of EXPECTED_GIT_HOOKS) {
      if (existsSync(join(gitHooksDir, hookType))) {
        installedGitHooks.push(hookType);
      } else {
        missingGitHooks.push(hookType);
      }
    }
  }

  const issues: string[] = [];
  if (!hasHookSource || sourceHookCount === 0) {
    issues.push(
      ".claude/hooks/ missing or empty — run forgecraft scaffold first",
    );
  } else if (!isGitRepo) {
    issues.push("Not a git repository — hook installation requires git init");
  } else if (missingGitHooks.length > 0) {
    issues.push(
      `Git hooks not installed (${missingGitHooks.join(", ")}) — run: bash scripts/setup-hooks.sh`,
    );
  }

  return {
    hasHookSource,
    sourceHookCount,
    installedGitHooks,
    missingGitHooks,
    allInstalled: isGitRepo && missingGitHooks.length === 0 && hasHookSource,
    issues,
  };
}

// ── Manifest helpers ──────────────────────────────────────────────────

function manifestPath(projectDir: string, hookType: string): string {
  return join(projectDir, ".claude", "hooks", `${hookType}.list`);
}

function buildManifestContent(hookType: string, scripts: string[]): string {
  return [
    `# ForgeCraft hook manifest — ${hookType}`,
    `# One script filename per line. Comments (#) and blank lines are ignored.`,
    `# Add hooks: forgecraft add_hook — scripts are appended here automatically.`,
    `# Reorder lines to change execution sequence.`,
    ``,
    ...scripts,
    ``,
  ].join("\n");
}

/**
 * Write default manifest files to .claude/hooks/<type>.list.
 * Skips existing manifests unless force=true — preserves user customizations.
 *
 * @param projectDir - Absolute path to project root
 * @param force - Overwrite existing manifest files (default false)
 */
function writeHookManifests(projectDir: string, force = false): void {
  const hooksDir = join(projectDir, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  for (const hookType of EXPECTED_GIT_HOOKS) {
    const path = manifestPath(projectDir, hookType);
    if (existsSync(path) && !force) continue;
    writeFileSync(
      path,
      buildManifestContent(hookType, DEFAULT_MANIFEST[hookType]),
      "utf-8",
    );
  }
}

/**
 * Append a script filename to the manifest for a given hook type.
 * Idempotent — skips if the script is already listed.
 * Creates the manifest file if it does not exist.
 *
 * @param projectDir - Absolute path to project root
 * @param hookType   - Git hook type (e.g. "pre-commit", "commit-msg")
 * @param scriptName - Filename to append (e.g. "pre-commit-i18n.sh")
 * @returns true if appended, false if already present
 */
export function appendToHookManifest(
  projectDir: string,
  hookType: string,
  scriptName: string,
): boolean {
  const path = manifestPath(projectDir, hookType);

  let existing = "";
  if (existsSync(path)) {
    existing = readFileSync(path, "utf-8");
  } else {
    // Create fresh manifest for this hook type
    const defaults = DEFAULT_MANIFEST[hookType as GitHookType] ?? [];
    existing = buildManifestContent(hookType, defaults);
  }

  // Idempotency check — scan non-comment lines
  const alreadyListed = existing
    .split("\n")
    .some((l) => l.trim() === scriptName);
  if (alreadyListed) return false;

  // Append before trailing blank line if present, otherwise just append
  const trimmed = existing.trimEnd();
  const updated = `${trimmed}\n${scriptName}\n`;

  mkdirSync(join(projectDir, ".claude", "hooks"), { recursive: true });
  writeFileSync(path, updated, "utf-8");
  return true;
}

// ── Dispatcher content builders ───────────────────────────────────────

/**
 * Generic manifest-reading dispatcher for fail-fast hooks (pre-commit, commit-msg, prepare-commit-msg).
 * If the script fails (non-zero exit), the hook chain aborts immediately.
 *
 * @param hookType   - Hook type (used to locate <hookType>.list)
 * @param passArgs   - Extra args to forward to each script (e.g. "$1" for commit-msg)
 */
function buildManifestDispatcher(hookType: string, passArgs = ""): string {
  const argSuffix = passArgs ? ` ${passArgs}` : "";
  return [
    "#!/bin/bash",
    `# Auto-generated by ForgeCraft — do not edit by hand.`,
    `# To add a hook: run \`forgecraft add_hook\` or append to .claude/hooks/${hookType}.list`,
    `HOOKS_DIR="$(git rev-parse --show-toplevel)/.claude/hooks"`,
    `LIST="$HOOKS_DIR/${hookType}.list"`,
    "",
    '[ -f "$LIST" ] || exit 0',
    'while IFS= read -r hook || [ -n "$hook" ]; do',
    '  [[ -z "$hook" || "$hook" == \\#* ]] && continue',
    '  script="$HOOKS_DIR/$hook"',
    '  [ -f "$script" ] || continue',
    `  bash "$script"${argSuffix}`,
    "  rc=$?",
    "  if [ $rc -ne 0 ]; then",
    '    echo "❌ Hook failed: $hook (exit $rc)"',
    "    exit $rc",
    "  fi",
    'done < "$LIST"',
    "exit 0",
  ].join("\n");
}

/**
 * Generic manifest-reading dispatcher for fire-and-forget hooks (post-commit).
 * Script failures are ignored — hook chain always continues.
 */
function buildPostCommitDispatcher(): string {
  return [
    "#!/bin/bash",
    "# Auto-generated by ForgeCraft — do not edit by hand.",
    "# To add a hook: run `forgecraft add_hook` or append to .claude/hooks/post-commit.list",
    `HOOKS_DIR="$(git rev-parse --show-toplevel)/.claude/hooks"`,
    `LIST="$HOOKS_DIR/post-commit.list"`,
    "",
    '[ -f "$LIST" ] || exit 0',
    'while IFS= read -r hook || [ -n "$hook" ]; do',
    '  [[ -z "$hook" || "$hook" == \\#* ]] && continue',
    '  script="$HOOKS_DIR/$hook"',
    '  [ -f "$script" ] && bash "$script"',
    'done < "$LIST"',
    "exit 0",
  ].join("\n");
}

/**
 * Pre-push dispatcher: built-in main/master deletion guard + manifest hooks.
 * stdin is captured once so it can be re-fed to each manifest hook.
 */
function buildPrePushDispatcher(): string {
  return [
    "#!/bin/bash",
    "# Auto-generated by ForgeCraft — do not edit by hand.",
    "# To add a hook: run `forgecraft add_hook` or append to .claude/hooks/pre-push.list",
    `HOOKS_DIR="$(git rev-parse --show-toplevel)/.claude/hooks"`,
    `LIST="$HOOKS_DIR/pre-push.list"`,
    "",
    "# Capture stdin so we can re-feed it to each hook",
    "stdin_content=$(cat)",
    "",
    "# Built-in guard: block deletion of main/master on the remote",
    "while IFS= read -r line; do",
    "  local_sha=$(echo \"$line\" | awk '{print $2}')",
    "  remote_ref=$(echo \"$line\" | awk '{print $3}')",
    '  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then',
    "    if echo \"$remote_ref\" | grep -qE '/(main|master)$'; then",
    '      echo "❌ Deleting remote main/master branch is blocked."',
    "      exit 1",
    "    fi",
    "  fi",
    'done <<< "$stdin_content"',
    "",
    "# Manifest hooks — stdin is piped in from the captured content",
    '[ -f "$LIST" ] || exit 0',
    'while IFS= read -r hook || [ -n "$hook" ]; do',
    '  [[ -z "$hook" || "$hook" == \\#* ]] && continue',
    '  script="$HOOKS_DIR/$hook"',
    '  [ -f "$script" ] || continue',
    '  echo "$stdin_content" | bash "$script"',
    "  rc=$?",
    "  if [ $rc -ne 0 ]; then",
    '    echo "❌ Hook failed: $hook (exit $rc)"',
    "    exit $rc",
    "  fi",
    'done < "$LIST"',
    "exit 0",
  ].join("\n");
}

// ── Installer ─────────────────────────────────────────────────────────

/**
 * Write .git/hooks/* manifest-driven dispatcher scripts and default
 * .claude/hooks/<type>.list manifest files.
 *
 * Dispatchers: installed once, never need to change again.
 * Manifests: versioned in .claude/hooks/, updated by add_hook.
 *
 * Skips existing hooks/manifests unless force=true.
 *
 * @param projectDir - Absolute path to project root
 * @param force - Overwrite existing git hooks and manifests (default false)
 */
export function installGitHooks(
  projectDir: string,
  force = false,
): HookInstallResult {
  const gitDir = join(projectDir, ".git");
  if (!existsSync(gitDir)) {
    return { installed: [], skipped: [], notAGitRepo: true };
  }

  const gitHooksDir = join(gitDir, "hooks");
  mkdirSync(gitHooksDir, { recursive: true });

  const hooks: Array<{ name: string; content: string }> = [
    { name: "pre-commit", content: buildManifestDispatcher("pre-commit") },
    {
      name: "commit-msg",
      content: buildManifestDispatcher("commit-msg", '"$1"'),
    },
    { name: "post-commit", content: buildPostCommitDispatcher() },
    {
      name: "prepare-commit-msg",
      content: buildManifestDispatcher("prepare-commit-msg", '"$1" "$2"'),
    },
    { name: "pre-push", content: buildPrePushDispatcher() },
  ];

  const installed: string[] = [];
  const skipped: string[] = [];

  for (const { name, content } of hooks) {
    const hookPath = join(gitHooksDir, name);
    if (existsSync(hookPath) && !force) {
      skipped.push(name);
      continue;
    }
    writeFileSync(hookPath, content, "utf-8");
    try {
      chmodSync(hookPath, 0o755);
    } catch {
      /* non-fatal on Windows */
    }
    installed.push(name);
  }

  // Write default manifests — skips existing unless force=true
  writeHookManifests(projectDir, force);

  return { installed, skipped, notAGitRepo: false };
}
