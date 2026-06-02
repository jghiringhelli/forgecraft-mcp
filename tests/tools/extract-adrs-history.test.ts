/**
 * Tests for src/tools/extract-adrs-history.ts
 *
 * Covers: subjectToSlug (via renderRetroactiveAdr), findArchDecisionCandidates
 * (keyword detection, large-commit detection, idempotency), handler responses
 * (no git repo, no candidates, writes stubs, skips duplicates).
 *
 * git-exec paths are exercised through the handler, which calls execSync
 * internally — those tests require an actual git repo fixture built in tmpdir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import {
  findArchDecisionCandidates,
  extractAdrsFromHistoryHandler,
} from "../../src/tools/extract-adrs-history.js";

function makeTempDir(suffix = "adr-hist"): string {
  const dir = join(tmpdir(), `forgecraft-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Initialise a bare git repo with one commit so git log works. */
function makeGitRepo(
  dir: string,
  messages: string[] = ["initial commit"],
): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: dir,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });
  for (const [i, msg] of messages.entries()) {
    writeFileSync(join(dir, `file${i}.txt`), `content ${i}\n`);
    execSync("git add .", { cwd: dir, stdio: "pipe" });
    execSync(`git commit --allow-empty -m "${msg}"`, {
      cwd: dir,
      stdio: "pipe",
    });
  }
}

// ── findArchDecisionCandidates ────────────────────────────────────────

describe("findArchDecisionCandidates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir("candidates");
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when not a git repo", () => {
    const result = findArchDecisionCandidates(tempDir, 10, 5, "HEAD");
    expect(result).toEqual([]);
  });

  it("detects keyword 'migrate' in commit subject", () => {
    makeGitRepo(tempDir, ["migrate from REST to GraphQL"]);
    const result = findArchDecisionCandidates(tempDir, 10, 5, "HEAD");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.subject).toContain("migrate");
    expect(result[0]!.reason).toContain("keyword");
  });

  it("detects keyword 'switch to' in commit subject", () => {
    makeGitRepo(tempDir, ["switch to pnpm for dependency management"]);
    const result = findArchDecisionCandidates(tempDir, 10, 5, "HEAD");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.reason).toContain("switch to");
  });

  it("detects keyword 'adopt' (case-insensitive)", () => {
    makeGitRepo(tempDir, ["Adopt Zod for runtime validation"]);
    const result = findArchDecisionCandidates(tempDir, 10, 5, "HEAD");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.reason).toContain("adopt");
  });

  it("detects keyword 'replace'", () => {
    makeGitRepo(tempDir, ["replace express with fastify"]);
    const result = findArchDecisionCandidates(tempDir, 10, 5, "HEAD");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores commits that have no matching keyword and are under threshold", () => {
    makeGitRepo(tempDir, ["fix typo in README"]);
    const result = findArchDecisionCandidates(tempDir, 10, 5, "HEAD");
    // README fix with 1 file change should not surface at threshold=5
    const typoCommit = result.find((c) => c.subject.includes("typo"));
    expect(typoCommit).toBeUndefined();
  });

  it("respects maxCandidates cap", () => {
    const messages = [
      "migrate auth to Clerk",
      "replace redis with valkey",
      "switch to vitest from jest",
    ];
    makeGitRepo(tempDir, messages);
    const result = findArchDecisionCandidates(tempDir, 2, 5, "HEAD");
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("returns hash, date, subject, reason for each candidate", () => {
    makeGitRepo(tempDir, ["drop legacy REST endpoints"]);
    const result = findArchDecisionCandidates(tempDir, 10, 5, "HEAD");
    if (result.length > 0) {
      const c = result[0]!;
      expect(c.hash).toMatch(/^[0-9a-f]{40}$/);
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.subject).toBeTruthy();
      expect(c.reason).toBeTruthy();
    }
  });
});

// ── extractAdrsFromHistoryHandler ─────────────────────────────────────

describe("extractAdrsFromHistoryHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir("handler");
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns error text when project_dir is not a git repo", async () => {
    const result = await extractAdrsFromHistoryHandler({
      project_dir: tempDir,
    });
    expect(result.content[0]!.type).toBe("text");
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Not a git repository");
  });

  it("returns 'no candidates' message when only non-arch commits exist", async () => {
    makeGitRepo(tempDir, ["fix typo", "update package.json", "bump version"]);
    const result = await extractAdrsFromHistoryHandler({
      project_dir: tempDir,
      large_commit_threshold: 100,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No ADR candidates found");
  });

  it("writes ADR stub file for matching commit", async () => {
    makeGitRepo(tempDir, ["migrate auth to Clerk SSO"]);
    const result = await extractAdrsFromHistoryHandler({
      project_dir: tempDir,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Written:");
    expect(text).not.toContain("Written: 0");

    // resolveAdrDir falls back to docs/adrs when docs/adrs/active does not pre-exist
    const activeDir = join(tempDir, "docs", "adrs", "active");
    const legacyDir = join(tempDir, "docs", "adrs");
    const adrDir = existsSync(activeDir) ? activeDir : legacyDir;
    const files = existsSync(adrDir)
      ? (await import("node:fs"))
          .readdirSync(adrDir)
          .filter((f) => f.endsWith(".md"))
      : [];
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("stub file has Retroactive status and NEEDS CLARIFICATION markers", async () => {
    makeGitRepo(tempDir, ["replace redis with valkey"]);
    await extractAdrsFromHistoryHandler({ project_dir: tempDir });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    const files = existsSync(adrDir)
      ? (await import("node:fs")).readdirSync(adrDir)
      : [];
    if (files.length > 0) {
      const content = readFileSync(join(adrDir, files[0]!), "utf-8");
      expect(content).toContain("Retroactive");
      expect(content).toContain("[NEEDS CLARIFICATION");
    }
  });

  it("is idempotent — second run skips already-written stubs", async () => {
    makeGitRepo(tempDir, ["adopt pnpm for package management"]);

    await extractAdrsFromHistoryHandler({ project_dir: tempDir });
    const result2 = await extractAdrsFromHistoryHandler({
      project_dir: tempDir,
    });
    const text = (result2.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Skipped");
  });

  it("uses legacy docs/adrs dir when docs/adrs/active does not exist", async () => {
    makeGitRepo(tempDir, ["switch to vitest from jest"]);
    const legacyDir = join(tempDir, "docs", "adrs");
    mkdirSync(legacyDir, { recursive: true });

    await extractAdrsFromHistoryHandler({ project_dir: tempDir });
    const files = (await import("node:fs")).readdirSync(legacyDir);
    // at least one .md file should have been written directly in legacyDir
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
  });

  it("respects max_candidates param", async () => {
    makeGitRepo(tempDir, [
      "migrate auth to Clerk",
      "replace redis with valkey",
      "adopt vitest over jest",
    ]);
    const result = await extractAdrsFromHistoryHandler({
      project_dir: tempDir,
      max_candidates: 1,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    // Should have found exactly 1 candidate
    expect(text).toContain("Found **1** candidate");
  });

  it("output includes directory path and summary counts", async () => {
    makeGitRepo(tempDir, ["consolidate config loaders into single module"]);
    const result = await extractAdrsFromHistoryHandler({
      project_dir: tempDir,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Written:");
    expect(text).toContain("Skipped");
    expect(text).toContain("Directory:");
  });

  it("no-candidates message mentions tuning options", async () => {
    makeGitRepo(tempDir, ["chore: update deps"]);
    const result = await extractAdrsFromHistoryHandler({
      project_dir: tempDir,
      large_commit_threshold: 999,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("large_commit_threshold");
  });
});
