/**
 * Tests for src/shared/hook-installer.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  auditHookInstallation,
  installGitHooks,
  appendToHookManifest,
} from "../../src/shared/hook-installer.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-hook-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function initGitRepo(dir: string): void {
  mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
}

function addSourceHooks(dir: string): void {
  const hooksDir = join(dir, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(join(hooksDir, "pre-commit-secrets.sh"), "#!/bin/bash\nexit 0");
  writeFileSync(join(hooksDir, "commit-msg.sh"), "#!/bin/bash\nexit 0");
}

describe("auditHookInstallation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports hasHookSource: false when .claude/hooks/ is missing", () => {
    initGitRepo(tempDir);
    const result = auditHookInstallation(tempDir);
    expect(result.hasHookSource).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("reports not-a-git-repo when .git/ is missing", () => {
    addSourceHooks(tempDir);
    const result = auditHookInstallation(tempDir);
    expect(result.allInstalled).toBe(false);
    expect(result.issues.some((i) => i.includes("git"))).toBe(true);
  });

  it("reports missing git hooks when source exists but .git/hooks not installed", () => {
    initGitRepo(tempDir);
    addSourceHooks(tempDir);
    const result = auditHookInstallation(tempDir);
    expect(result.missingGitHooks).toContain("pre-commit");
    expect(result.missingGitHooks).toContain("commit-msg");
    expect(result.allInstalled).toBe(false);
  });

  it("reports allInstalled: true when all expected git hooks are present", () => {
    initGitRepo(tempDir);
    addSourceHooks(tempDir);
    // Place all expected git hooks
    for (const name of [
      "pre-commit",
      "commit-msg",
      "post-commit",
      "prepare-commit-msg",
      "pre-push",
    ]) {
      writeFileSync(
        join(tempDir, ".git", "hooks", name),
        "#!/bin/bash\nexit 0",
      );
    }
    const result = auditHookInstallation(tempDir);
    expect(result.allInstalled).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("counts source hook files", () => {
    initGitRepo(tempDir);
    addSourceHooks(tempDir);
    const result = auditHookInstallation(tempDir);
    expect(result.sourceHookCount).toBe(2);
  });
});

describe("installGitHooks", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns notAGitRepo: true when .git/ does not exist", () => {
    const result = installGitHooks(tempDir);
    expect(result.notAGitRepo).toBe(true);
    expect(result.installed).toHaveLength(0);
  });

  it("installs all five hook types into .git/hooks/", () => {
    initGitRepo(tempDir);
    const result = installGitHooks(tempDir);
    expect(result.notAGitRepo).toBe(false);
    expect(result.installed).toContain("pre-commit");
    expect(result.installed).toContain("commit-msg");
    expect(result.installed).toContain("post-commit");
    expect(result.installed).toContain("prepare-commit-msg");
    expect(result.installed).toContain("pre-push");
  });

  it("writes pre-commit dispatcher that reads from pre-commit.list", () => {
    initGitRepo(tempDir);
    installGitHooks(tempDir);
    const content = readFileSync(
      join(tempDir, ".git", "hooks", "pre-commit"),
      "utf-8",
    );
    expect(content).toContain(".claude/hooks");
    expect(content).toContain("pre-commit.list");
    // Dispatcher is generic — script names live in the manifest, not hardcoded
    expect(content).not.toContain("pre-commit-secrets.sh");
  });

  it("writes commit-msg dispatcher that reads from commit-msg.list", () => {
    initGitRepo(tempDir);
    installGitHooks(tempDir);
    const content = readFileSync(
      join(tempDir, ".git", "hooks", "commit-msg"),
      "utf-8",
    );
    expect(content).toContain("commit-msg.list");
    expect(content).toContain('"$1"');
  });

  it("writes default manifests into .claude/hooks/", () => {
    initGitRepo(tempDir);
    installGitHooks(tempDir);
    const manifest = readFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit.list"),
      "utf-8",
    );
    expect(manifest).toContain("pre-commit-secrets.sh");
    expect(manifest).toContain("pre-commit-test.sh");
  });

  it("does not overwrite existing manifests when force=false", () => {
    initGitRepo(tempDir);
    mkdirSync(join(tempDir, ".claude", "hooks"), { recursive: true });
    writeFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit.list"),
      "# custom\nmy-custom-check.sh\n",
      "utf-8",
    );
    installGitHooks(tempDir, false);
    const content = readFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit.list"),
      "utf-8",
    );
    expect(content).toContain("my-custom-check.sh");
    expect(content).not.toContain("pre-commit-secrets.sh");
  });

  it("skips existing hooks when force=false", () => {
    initGitRepo(tempDir);
    writeFileSync(
      join(tempDir, ".git", "hooks", "pre-commit"),
      "# existing",
      "utf-8",
    );
    installGitHooks(tempDir, false);
    const content = readFileSync(
      join(tempDir, ".git", "hooks", "pre-commit"),
      "utf-8",
    );
    expect(content).toBe("# existing");
  });

  it("overwrites existing hooks when force=true", () => {
    initGitRepo(tempDir);
    writeFileSync(
      join(tempDir, ".git", "hooks", "pre-commit"),
      "# existing",
      "utf-8",
    );
    installGitHooks(tempDir, true);
    const content = readFileSync(
      join(tempDir, ".git", "hooks", "pre-commit"),
      "utf-8",
    );
    expect(content).toContain(".claude/hooks");
  });

  it("returns skipped list for already-present hooks", () => {
    initGitRepo(tempDir);
    writeFileSync(
      join(tempDir, ".git", "hooks", "pre-commit"),
      "# existing",
      "utf-8",
    );
    const result = installGitHooks(tempDir, false);
    expect(result.skipped).toContain("pre-commit");
  });

  it("creates .git/hooks/ directory if it does not exist", () => {
    mkdirSync(join(tempDir, ".git"), { recursive: true });
    // no hooks/ subdirectory
    installGitHooks(tempDir);
    expect(existsSync(join(tempDir, ".git", "hooks"))).toBe(true);
  });
});

describe("appendToHookManifest", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates manifest file and appends script when file does not exist", () => {
    const appended = appendToHookManifest(tempDir, "pre-commit", "my-check.sh");
    expect(appended).toBe(true);
    const content = readFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit.list"),
      "utf-8",
    );
    expect(content).toContain("my-check.sh");
  });

  it("appends to existing manifest file", () => {
    mkdirSync(join(tempDir, ".claude", "hooks"), { recursive: true });
    writeFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit.list"),
      "# existing\npre-commit-secrets.sh\n",
      "utf-8",
    );
    appendToHookManifest(tempDir, "pre-commit", "my-new-check.sh");
    const content = readFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit.list"),
      "utf-8",
    );
    expect(content).toContain("pre-commit-secrets.sh");
    expect(content).toContain("my-new-check.sh");
  });

  it("is idempotent — does not duplicate already-listed scripts", () => {
    appendToHookManifest(tempDir, "pre-commit", "my-check.sh");
    const result = appendToHookManifest(tempDir, "pre-commit", "my-check.sh");
    expect(result).toBe(false);
    const content = readFileSync(
      join(tempDir, ".claude", "hooks", "pre-commit.list"),
      "utf-8",
    );
    const occurrences = content.split("my-check.sh").length - 1;
    expect(occurrences).toBe(1);
  });

  it("creates .claude/hooks/ directory if it does not exist", () => {
    appendToHookManifest(tempDir, "commit-msg", "commit-msg-lint.sh");
    expect(
      existsSync(join(tempDir, ".claude", "hooks", "commit-msg.list")),
    ).toBe(true);
  });

  it("includes default entries from DEFAULT_MANIFEST when creating a new file", () => {
    appendToHookManifest(tempDir, "commit-msg", "my-msg-check.sh");
    const content = readFileSync(
      join(tempDir, ".claude", "hooks", "commit-msg.list"),
      "utf-8",
    );
    // Default manifest for commit-msg includes commit-msg.sh
    expect(content).toContain("commit-msg.sh");
    expect(content).toContain("my-msg-check.sh");
  });
});
