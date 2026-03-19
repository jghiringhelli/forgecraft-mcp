// @ts-nocheck
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { checkCompleteness } from "../../src/analyzers/completeness.js";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

function createProject(name: string, files: Record<string, string> = {}): string {
  const dir = join(FIXTURES_DIR, `completeness-${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }

  return dir;
}

describe("completeness analyzer", () => {
  it("should fail when no instruction file exists", () => {
    const dir = createProject("no-instruction-file");
    const result = checkCompleteness(dir, ["UNIVERSAL"]);

    expect(result.failing.some((f) => f.check === "instruction_file_exists")).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("should pass when an instruction file exists", () => {
    const dir = createProject("has-instruction-file", {
      "CLAUDE.md": "# CLAUDE.md\nProject instructions",
    });
    const result = checkCompleteness(dir, ["UNIVERSAL"]);

    expect(result.passing.some((p) => p.check === "instruction_file_exists")).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("should fail when Status.md is missing", () => {
    const dir = createProject("no-status");
    const result = checkCompleteness(dir, ["UNIVERSAL"]);

    expect(result.failing.some((f) => f.check === "status_md_exists")).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("should fail when hooks directory is missing", () => {
    const dir = createProject("no-hooks");
    const result = checkCompleteness(dir, ["UNIVERSAL"]);

    expect(result.failing.some((f) => f.check === "hooks_installed")).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("should pass when shared modules exist", () => {
    const dir = createProject("has-shared", {
      "src/shared/config/index.ts": "export const config = {};",
    });
    const result = checkCompleteness(dir, ["UNIVERSAL"]);

    expect(result.passing.some((p) => p.check === "shared_modules")).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("should check package.json for API/LIBRARY tags", () => {
    const dir = createProject("api-no-pkg");
    const result = checkCompleteness(dir, ["API"]);

    expect(result.failing.some((f) => f.check === "package_json")).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("should pass package.json checks when present with test script", () => {
    const dir = createProject("api-with-pkg", {
      "package.json": JSON.stringify({
        name: "test",
        scripts: { test: "vitest" },
      }),
      "package-lock.json": "{}",
    });
    const result = checkCompleteness(dir, ["API"]);

    expect(result.passing.some((p) => p.check === "test_script")).toBe(true);
    expect(result.passing.some((p) => p.check === "lock_file")).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("should check for docs when UNIVERSAL", () => {
    const dir = createProject("no-docs");
    const result = checkCompleteness(dir, ["UNIVERSAL"]);

    expect(result.failing.some((f) => f.check === "prd_exists")).toBe(true);
    expect(result.failing.some((f) => f.check === "tech_spec_exists")).toBe(true);

    rmSync(dir, { recursive: true });
  });
});
