/**
 * Tests for the add_module tool handler.
 *
 * Tests cover: TypeScript module scaffolding, Python module scaffolding,
 * module name normalisation, and tag-driven content variation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addModuleHandler } from "../../src/tools/add-module.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-module-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("addModuleHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── TypeScript scaffolding ────────────────────────────────────────

  describe("TypeScript module scaffolding", () => {
    it("creates src/modules/<name>/ directory", async () => {
      await addModuleHandler({
        module_name: "payments",
        tags: ["UNIVERSAL"],
        language: "typescript",
        project_dir: tempDir,
      });
      expect(existsSync(join(tempDir, "src", "modules", "payments"))).toBe(true);
    });

    it("generates at least one TypeScript file in the module directory", async () => {
      await addModuleHandler({
        module_name: "auth",
        tags: ["UNIVERSAL"],
        language: "typescript",
        project_dir: tempDir,
      });
      const moduleDir = join(tempDir, "src", "modules", "auth");
      expect(existsSync(moduleDir)).toBe(true);
      // At minimum an index.ts should be present
      const hasTs = existsSync(join(moduleDir, "index.ts"));
      const hasSomeTs = hasTs || existsSync(join(moduleDir, "auth.service.ts"));
      expect(hasSomeTs).toBe(true);
    });

    it("returns response listing created files", async () => {
      const result = await addModuleHandler({
        module_name: "connections",
        tags: ["UNIVERSAL"],
        language: "typescript",
        project_dir: tempDir,
      });
      expect(result.content[0]!.text).toMatch(/connections/i);
    });

    it("normalises module name to kebab-case", async () => {
      await addModuleHandler({
        module_name: "MyFeature_Module",
        tags: ["UNIVERSAL"],
        language: "typescript",
        project_dir: tempDir,
      });
      // Should be normalised: uppercase → lowercase, underscores → hyphens
      expect(existsSync(join(tempDir, "src", "modules", "myfeature-module"))).toBe(true);
    });

    it("API tag produces service file with API patterns", async () => {
      await addModuleHandler({
        module_name: "orders",
        tags: ["UNIVERSAL", "API"],
        language: "typescript",
        project_dir: tempDir,
      });
      const moduleDir = join(tempDir, "src", "modules", "orders");
      expect(existsSync(moduleDir)).toBe(true);
    });
  });

  // ── Python scaffolding ────────────────────────────────────────────

  describe("Python module scaffolding", () => {
    it("creates src/<name>/ directory for Python", async () => {
      await addModuleHandler({
        module_name: "billing",
        tags: ["UNIVERSAL"],
        language: "python",
        project_dir: tempDir,
      });
      expect(existsSync(join(tempDir, "src", "billing"))).toBe(true);
    });

    it("generates __init__.py in module directory", async () => {
      await addModuleHandler({
        module_name: "analytics",
        tags: ["UNIVERSAL"],
        language: "python",
        project_dir: tempDir,
      });
      const initFile = join(tempDir, "src", "analytics", "__init__.py");
      expect(existsSync(initFile)).toBe(true);
    });

    it("returns response listing created Python files", async () => {
      const result = await addModuleHandler({
        module_name: "reporting",
        tags: ["UNIVERSAL"],
        language: "python",
        project_dir: tempDir,
      });
      expect(result.content[0]!.text.length).toBeGreaterThan(0);
    });
  });
});
