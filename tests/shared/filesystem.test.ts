import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileIfMissing, checkGitSafety, mergeInstructionFiles, writeInstructionFileWithMerge } from "../../src/shared/filesystem.js";

describe("filesystem", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-fs-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("writeFileIfMissing", () => {
    it("should create a new file and return 'created'", () => {
      const filePath = join(tempDir, "new-file.txt");
      const result = writeFileIfMissing(filePath, "hello");
      expect(result).toBe("created");
      expect(readFileSync(filePath, "utf-8")).toBe("hello");
    });

    it("should skip existing file and return 'skipped'", () => {
      const filePath = join(tempDir, "existing.txt");
      writeFileSync(filePath, "original");
      const result = writeFileIfMissing(filePath, "new content");
      expect(result).toBe("skipped");
      expect(readFileSync(filePath, "utf-8")).toBe("original");
    });

    it("should overwrite existing file when force is true", () => {
      const filePath = join(tempDir, "existing.txt");
      writeFileSync(filePath, "original");
      const result = writeFileIfMissing(filePath, "new content", true);
      expect(result).toBe("overwritten");
      expect(readFileSync(filePath, "utf-8")).toBe("new content");
    });

    it("should create parent directories", () => {
      const filePath = join(tempDir, "a", "b", "c", "deep.txt");
      const result = writeFileIfMissing(filePath, "deep content");
      expect(result).toBe("created");
      expect(readFileSync(filePath, "utf-8")).toBe("deep content");
    });
  });

  describe("checkGitSafety", () => {
    it("should return null for non-git directory", () => {
      const result = checkGitSafety(tempDir);
      expect(result).toBeNull();
    });

    it("should return null for clean git repo", () => {
      // Initialize a clean git repo
      const { execSync } = require("node:child_process");
      execSync("git init", { cwd: tempDir, stdio: "pipe" });
      execSync("git config user.email test@test.com", { cwd: tempDir, stdio: "pipe" });
      execSync("git config user.name Test", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "README.md"), "test");
      execSync("git add . && git commit -m init", { cwd: tempDir, stdio: "pipe" });

      const result = checkGitSafety(tempDir);
      expect(result).toBeNull();
    });

    it("should return warning for dirty git repo", () => {
      const { execSync } = require("node:child_process");
      execSync("git init", { cwd: tempDir, stdio: "pipe" });
      execSync("git config user.email test@test.com", { cwd: tempDir, stdio: "pipe" });
      execSync("git config user.name Test", { cwd: tempDir, stdio: "pipe" });
      writeFileSync(join(tempDir, "README.md"), "test");
      execSync("git add . && git commit -m init", { cwd: tempDir, stdio: "pipe" });

      // Create uncommitted change
      writeFileSync(join(tempDir, "dirty.txt"), "uncommitted");

      const result = checkGitSafety(tempDir);
      expect(result).not.toBeNull();
      expect(result).toContain("uncommitted change");
    });
  });

  describe("mergeInstructionFiles", () => {
    it("preserves_existing_content_for_matching_sections", () => {
      const existing = "## Code Standards\nHandwritten content";
      const generated = "## Code Standards\nTemplate prose";
      const result = mergeInstructionFiles(existing, generated);
      expect(result).toContain("Handwritten content");
      expect(result).not.toContain("Template prose");
    });

    it("appends_new_sections_from_generated_not_in_existing", () => {
      const existing = "## Code Standards\nHandwritten content";
      const generated = "## Code Standards\nTemplate prose\n\n## New Section\nBrand new content";
      const result = mergeInstructionFiles(existing, generated);
      expect(result).toContain("Handwritten content");
      expect(result).toContain("## New Section");
      expect(result).toContain("Brand new content");
      expect(result).not.toContain("Template prose");
    });

    it("preserves_custom_sections_not_in_generated_output", () => {
      const existing = "## Code Standards\nHandwritten standards\n\n## My Custom Rules\nDo not use var.\nAlways use strict mode.";
      const generated = "## Code Standards\nTemplate prose";
      const result = mergeInstructionFiles(existing, generated);
      // Existing section wins over template prose
      expect(result).toContain("Handwritten standards");
      expect(result).not.toContain("Template prose");
      // Custom-only section preserved
      expect(result).toContain("## My Custom Rules");
      expect(result).toContain("Do not use var.");
      expect(result).toContain("Always use strict mode.");
    });

    it("should preserve multiple custom sections", () => {
      const existing = "## Generated\nContent\n\n## My Preferences\nPrefs\n\n## Team Conventions\nConventions";
      const generated = "## Generated\nNew content";
      const result = mergeInstructionFiles(existing, generated);
      expect(result).toContain("## My Preferences");
      expect(result).toContain("## Team Conventions");
    });

    it("existing_wins_when_sections_present_in_both", () => {
      const existing = "## Code Standards\nHandwritten\n\n## Testing\nHandwritten tests";
      const generated = "## Code Standards\nTemplate\n\n## Testing\nTemplate tests";
      const result = mergeInstructionFiles(existing, generated);
      expect(result).toContain("Handwritten");
      expect(result).toContain("Handwritten tests");
      expect(result).not.toContain("Template\n");
      expect(result).not.toContain("Template tests");
    });
  });

  describe("writeInstructionFileWithMerge", () => {
    it("should create new file when none exists", () => {
      const filePath = join(tempDir, "CLAUDE.md");
      writeInstructionFileWithMerge(filePath, "## Standards\nContent");
      expect(readFileSync(filePath, "utf-8")).toBe("## Standards\nContent");
    });

    it("preserves_existing_content_and_appends_new_generated_sections", () => {
      const filePath = join(tempDir, "CLAUDE.md");
      writeFileSync(filePath, "## Standards\nHandwritten\n\n## My Custom\nKeep this");
      // Generated has updated Standards (should NOT overwrite) and a new section
      writeInstructionFileWithMerge(filePath, "## Standards\nTemplate\n\n## New Section\nNewly added");
      const result = readFileSync(filePath, "utf-8");
      // Existing content wins
      expect(result).toContain("Handwritten");
      expect(result).not.toContain("Template");
      // Custom section preserved
      expect(result).toContain("## My Custom");
      expect(result).toContain("Keep this");
      // New generated section appended
      expect(result).toContain("## New Section");
      expect(result).toContain("Newly added");
    });

    it("should create parent directories", () => {
      const filePath = join(tempDir, "a", "b", "CLAUDE.md");
      writeInstructionFileWithMerge(filePath, "content");
      expect(existsSync(filePath)).toBe(true);
    });
  });
});
