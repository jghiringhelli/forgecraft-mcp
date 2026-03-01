import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectProjectContext } from "../../src/analyzers/project-context.js";
import type { Tag } from "../../src/shared/types.js";

describe("project-context", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-ctx-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return basic context for empty directory", () => {
    const ctx = detectProjectContext(tempDir, "TestProject", "typescript", ["UNIVERSAL"]);
    expect(ctx.projectName).toBe("TestProject");
    expect(ctx.language).toBe("typescript");
    expect(ctx.tags).toContain("UNIVERSAL");
    expect(ctx.sensitiveData).toBe("NO");
  });

  it("should detect framework from package.json", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { next: "14.0.0", react: "18.0.0" } }),
    );
    const ctx = detectProjectContext(tempDir, "Test", "typescript", ["UNIVERSAL"]);
    expect(ctx.framework).toBe("Next.js");
  });

  it("should detect python framework from pyproject.toml", () => {
    writeFileSync(
      join(tempDir, "pyproject.toml"),
      '[project]\ndependencies = ["fastapi>=0.100"]\n',
    );
    const ctx = detectProjectContext(tempDir, "Test", "python", ["UNIVERSAL"]);
    expect(ctx.framework).toBe("FastAPI");
  });

  it("should detect python framework from requirements.txt", () => {
    writeFileSync(join(tempDir, "requirements.txt"), "streamlit==1.30\nanthropic>=0.20\n");
    const ctx = detectProjectContext(tempDir, "Test", "python", ["UNIVERSAL"]);
    expect(ctx.framework).toBe("Streamlit");
  });

  it("should set sensitive data YES for healthcare tags", () => {
    const tags: Tag[] = ["UNIVERSAL", "HEALTHCARE"];
    const ctx = detectProjectContext(tempDir, "Test", "python", tags);
    expect(ctx.sensitiveData).toBe("YES");
  });

  it("should set sensitive data YES for fintech tags", () => {
    const tags: Tag[] = ["UNIVERSAL", "FINTECH"];
    const ctx = detectProjectContext(tempDir, "Test", "typescript", tags);
    expect(ctx.sensitiveData).toBe("YES");
  });

  it("should use description as domain when provided", () => {
    const ctx = detectProjectContext(
      tempDir, "Test", "typescript", ["UNIVERSAL"],
      "A healthcare patient management system",
    );
    expect(ctx.domain).toBe("A healthcare patient management system");
  });

  it("should leave domain undefined when no description", () => {
    const ctx = detectProjectContext(tempDir, "Test", "typescript", ["UNIVERSAL"]);
    expect(ctx.domain).toBeUndefined();
  });

  it("should detect repo URL from git remote", () => {
    const { execSync } = require("node:child_process");
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    execSync("git remote add origin https://github.com/test/project.git", {
      cwd: tempDir,
      stdio: "pipe",
    });
    const ctx = detectProjectContext(tempDir, "Test", "typescript", ["UNIVERSAL"]);
    expect(ctx.repoUrl).toBe("https://github.com/test/project");
  });

  it("should return empty repoUrl for non-git directory", () => {
    const ctx = detectProjectContext(tempDir, "Test", "typescript", ["UNIVERSAL"]);
    expect(ctx.repoUrl).toBe("");
  });
});
