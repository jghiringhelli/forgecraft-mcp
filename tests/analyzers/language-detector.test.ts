import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectLanguage } from "../../src/analyzers/language-detector.js";

describe("language-detector", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-lang-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should detect python from pyproject.toml", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), "[project]\nname = 'test'\n");
    expect(detectLanguage(tempDir)).toBe("python");
  });

  it("should detect python from requirements.txt", () => {
    writeFileSync(join(tempDir, "requirements.txt"), "flask==2.0\n");
    expect(detectLanguage(tempDir)).toBe("python");
  });

  it("should detect python from setup.py", () => {
    writeFileSync(join(tempDir, "setup.py"), "from setuptools import setup\n");
    expect(detectLanguage(tempDir)).toBe("python");
  });

  it("should detect typescript from tsconfig.json", () => {
    writeFileSync(join(tempDir, "tsconfig.json"), "{}");
    expect(detectLanguage(tempDir)).toBe("typescript");
  });

  it("should detect typescript from package.json", () => {
    writeFileSync(join(tempDir, "package.json"), '{"name":"test"}');
    expect(detectLanguage(tempDir)).toBe("typescript");
  });

  it("should return typescript as default for empty directory", () => {
    expect(detectLanguage(tempDir)).toBe("typescript");
  });

  it("should count files when both languages present", () => {
    // Both indicators present
    writeFileSync(join(tempDir, "pyproject.toml"), "[project]");
    writeFileSync(join(tempDir, "package.json"), "{}");

    // More Python files in src/
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src", "app.py"), "");
    writeFileSync(join(tempDir, "src", "models.py"), "");
    writeFileSync(join(tempDir, "src", "utils.py"), "");
    writeFileSync(join(tempDir, "src", "index.ts"), "");

    expect(detectLanguage(tempDir)).toBe("python");
  });

  it("should prefer typescript when file counts are equal in mixed project", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), "[project]");
    writeFileSync(join(tempDir, "package.json"), "{}");

    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src", "app.py"), "");
    writeFileSync(join(tempDir, "src", "index.ts"), "");

    // Equal count → typescript wins (default)
    expect(detectLanguage(tempDir)).toBe("typescript");
  });

  it("should default to typescript when both indicators present but no src/", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), "[project]");
    writeFileSync(join(tempDir, "package.json"), "{}");

    expect(detectLanguage(tempDir)).toBe("typescript");
  });
});
