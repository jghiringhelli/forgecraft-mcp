/**
 * Tests for scanAntiPatterns — production code anti-pattern detection.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanAntiPatterns } from "../../src/analyzers/anti-pattern.js";

const TMP_DIR = join(tmpdir(), `forgecraft-test-antipattern-${Date.now()}`);
const SRC_DIR = join(TMP_DIR, "src");

beforeAll(() => {
  mkdirSync(SRC_DIR, { recursive: true });
  mkdirSync(join(TMP_DIR, "tests"), { recursive: true });
});

afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

describe("scanAntiPatterns", () => {
  describe("return shape", () => {
    it("returns violations and warnings arrays for empty project", () => {
      const result = scanAntiPatterns(TMP_DIR);
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("returns empty arrays for a clean file", () => {
      writeFileSync(
        join(SRC_DIR, "clean.ts"),
        "export function add(a: number, b: number): number { return a + b; }\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const cleanViolations = result.violations.filter((v) =>
        v.message.includes("clean.ts"),
      );
      const cleanWarnings = result.warnings.filter((w) =>
        w.message.includes("clean.ts"),
      );
      expect(cleanViolations).toHaveLength(0);
      expect(cleanWarnings).toHaveLength(0);
    });
  });

  describe("file_length warning", () => {
    it("warns when file exceeds maxFileLength", () => {
      const longContent = Array.from(
        { length: 350 },
        (_, i) => `const x${i} = ${i};`,
      ).join("\n");
      writeFileSync(join(SRC_DIR, "long-file.ts"), longContent);
      const result = scanAntiPatterns(TMP_DIR);
      const warning = result.warnings.find(
        (w) => w.check === "file_length" && w.message.includes("long-file.ts"),
      );
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
    });

    it("does not warn when file is under the limit", () => {
      const shortContent = Array.from(
        { length: 50 },
        (_, i) => `const y${i} = ${i};`,
      ).join("\n");
      writeFileSync(join(SRC_DIR, "short-file.ts"), shortContent);
      const result = scanAntiPatterns(TMP_DIR);
      const warning = result.warnings.find(
        (w) => w.check === "file_length" && w.message.includes("short-file.ts"),
      );
      expect(warning).toBeUndefined();
    });

    it("respects custom maxFileLength config", () => {
      const content = Array.from(
        { length: 60 },
        (_, i) => `const z${i} = ${i};`,
      ).join("\n");
      writeFileSync(join(SRC_DIR, "medium-file.ts"), content);
      const result = scanAntiPatterns(TMP_DIR, { maxFileLength: 50 });
      const warning = result.warnings.find(
        (w) =>
          w.check === "file_length" && w.message.includes("medium-file.ts"),
      );
      expect(warning).toBeDefined();
    });
  });

  describe("hardcoded_url violation", () => {
    it("detects localhost in non-config source files", () => {
      writeFileSync(
        join(SRC_DIR, "api-client.ts"),
        "const BASE = 'http://localhost:3000/api';\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "hardcoded_url" && v.message.includes("api-client.ts"),
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe("error");
    });

    it("does not flag localhost in a test file", () => {
      writeFileSync(
        join(TMP_DIR, "tests", "api.test.ts"),
        "const url = 'http://localhost:3000/api';\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) => v.check === "hardcoded_url" && v.message.includes("api.test.ts"),
      );
      expect(violation).toBeUndefined();
    });

    it("does not flag localhost in a commented line", () => {
      writeFileSync(
        join(SRC_DIR, "commented.ts"),
        "// const url = 'http://localhost:3000';\nexport {};\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "hardcoded_url" && v.message.includes("commented.ts"),
      );
      expect(violation).toBeUndefined();
    });
  });

  describe("mock_in_source violation", () => {
    it("detects mock_data in production source", () => {
      writeFileSync(
        join(SRC_DIR, "user-service.ts"),
        "const mock_data = [{ id: 1 }];\nexport { mock_data };\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "mock_in_source" && v.message.includes("user-service.ts"),
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe("error");
    });

    it("detects fake_data in production source", () => {
      writeFileSync(
        join(SRC_DIR, "data-helper.ts"),
        "const fake_data = {};\nexport default fake_data;\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "mock_in_source" && v.message.includes("data-helper.ts"),
      );
      expect(violation).toBeDefined();
    });

    it("does not flag mock in test file path", () => {
      writeFileSync(
        join(TMP_DIR, "tests", "mock-helper.ts"),
        "export const fake_data = {};\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "mock_in_source" && v.message.includes("mock-helper.ts"),
      );
      expect(violation).toBeUndefined();
    });

    it("does not flag mock in tests/ file without mock keyword in name (Windows path)", () => {
      // Regression: path.relative() on Windows returns backslash-separated paths.
      // 'tests\qa-walkthrough.ts' must be excluded even though the filename
      // contains no test/mock/spec keyword — the directory name 'tests' is enough.
      mkdirSync(join(TMP_DIR, "tests"), { recursive: true });
      writeFileSync(
        join(TMP_DIR, "tests", "qa-walkthrough.ts"),
        "const fake_data = [{ id: 1 }];\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "mock_in_source" &&
          v.message.includes("qa-walkthrough.ts"),
      );
      expect(violation).toBeUndefined();
    });
  });

  describe("bare_exception warning", () => {
    it("warns on bare catch() in TypeScript file", () => {
      writeFileSync(
        join(SRC_DIR, "risky.ts"),
        "try { doSomething(); } catch() { }\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const warning = result.warnings.find(
        (w) => w.check === "bare_exception" && w.message.includes("risky.ts"),
      );
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("warning");
    });

    it("does not warn on catch with parameter", () => {
      writeFileSync(
        join(SRC_DIR, "safe-catch.ts"),
        "try { doSomething(); } catch(err) { console.error(err); }\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const warning = result.warnings.find(
        (w) =>
          w.check === "bare_exception" && w.message.includes("safe-catch.ts"),
      );
      expect(warning).toBeUndefined();
    });
  });

  describe("hardcoded_credential violation", () => {
    it("detects hardcoded password in source", () => {
      writeFileSync(
        join(SRC_DIR, "db-connect.ts"),
        "const password = 'Sup3rS3cr3t!';\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "hardcoded_credential" &&
          v.message.includes("db-connect.ts"),
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe("error");
    });

    it("does not flag password in a comment", () => {
      writeFileSync(
        join(SRC_DIR, "auth-notes.ts"),
        "// password should come from env\nexport {};\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "hardcoded_credential" &&
          v.message.includes("auth-notes.ts"),
      );
      expect(violation).toBeUndefined();
    });

    it("does not flag password in an env variable read", () => {
      writeFileSync(
        join(SRC_DIR, "config.ts"),
        "const password = process.env['DB_PASSWORD'];\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "hardcoded_credential" && v.message.includes("config.ts"),
      );
      expect(violation).toBeUndefined();
    });
  });

  describe("non-source files", () => {
    it("ignores .md files", () => {
      writeFileSync(
        join(SRC_DIR, "README.md"),
        "const mock_data = 'localhost:3000';\npassword = 'secret'\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const mdViolations = result.violations.filter((v) =>
        v.message.includes("README.md"),
      );
      expect(mdViolations).toHaveLength(0);
    });
  });

  describe("regex literal false-positive exclusions", () => {
    it("[RED] does not flag localhost inside a regex literal pattern", () => {
      // Scanner source code contains the detection regex — must not flag itself
      writeFileSync(
        join(SRC_DIR, "url-detector.ts"),
        "const urlPattern = /(localhost|127\\.0\\.0\\.1)/;\nexport { urlPattern };\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "hardcoded_url" && v.message.includes("url-detector.ts"),
      );
      expect(violation).toBeUndefined();
    });

    it("[RED] does not flag mock_data inside a regex literal pattern", () => {
      // Scanner source code contains the mock detection regex — must not flag itself
      writeFileSync(
        join(SRC_DIR, "mock-detector.ts"),
        "const mockPattern = /\\b(mock_data|fake_data|dummy_data)/i;\nexport { mockPattern };\n",
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "mock_in_source" &&
          v.message.includes("mock-detector.ts"),
      );
      expect(violation).toBeUndefined();
    });

    it("[RED] does not flag localhost used as env-var fallback default", () => {
      // Template generators legitimately use localhost as a fallback example
      writeFileSync(
        join(SRC_DIR, "template-gen.ts"),
        `const url = process.env['BASE_URL'] ?? 'http://localhost:3000';\nexport { url };\n`,
      );
      const result = scanAntiPatterns(TMP_DIR);
      const violation = result.violations.find(
        (v) =>
          v.check === "hardcoded_url" && v.message.includes("template-gen.ts"),
      );
      expect(violation).toBeUndefined();
    });
  });
});
