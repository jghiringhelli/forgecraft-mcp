import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileIfMissing, checkGitSafety } from "../../src/shared/filesystem.js";

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
});
