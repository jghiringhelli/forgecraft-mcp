/**
 * Tests for the exceptions module.
 *
 * Tests cover: addException, readExceptions, findMatchingException,
 * file creation, ID sequencing, and glob pattern matching.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addException,
  readExceptions,
  findMatchingException,
} from "../../src/shared/exceptions.js";
import type { HookException } from "../../src/shared/exceptions.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-exceptions-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("exceptions module", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, ".forgecraft"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("addException", () => {
    it("creates the file if absent and returns exception with generated id", () => {
      const result = addException(tempDir, {
        hook: "layer-boundary",
        pattern: "src/migrations/**",
        reason: "Migration files legitimately access DB directly",
        addedBy: "AI",
      });

      expect(result.id).toBe("exc-001");
      expect(result.hook).toBe("layer-boundary");
      expect(result.pattern).toBe("src/migrations/**");
      expect(result.reason).toBe("Migration files legitimately access DB directly");
      expect(result.addedBy).toBe("AI");
      expect(result.addedAt).toBeTruthy();
      expect(existsSync(join(tempDir, ".forgecraft", "exceptions.json"))).toBe(true);
    });

    it("appends to existing file and increments id counter", () => {
      addException(tempDir, {
        hook: "layer-boundary",
        pattern: "src/migrations/**",
        reason: "First exception",
        addedBy: "AI",
      });

      const second = addException(tempDir, {
        hook: "anti-pattern/mock-data",
        pattern: "src/config/defaults.ts",
        reason: "Second exception",
        addedBy: "human",
      });

      expect(second.id).toBe("exc-002");

      const raw = JSON.parse(
        readFileSync(join(tempDir, ".forgecraft", "exceptions.json"), "utf-8")
      );
      expect(raw.exceptions).toHaveLength(2);
      expect(raw.exceptions[0].id).toBe("exc-001");
      expect(raw.exceptions[1].id).toBe("exc-002");
    });

    it("generates sequential IDs: exc-001, exc-002, exc-003", () => {
      const ids = [
        addException(tempDir, { hook: "h", pattern: "a", reason: "r1", addedBy: "AI" }).id,
        addException(tempDir, { hook: "h", pattern: "b", reason: "r2", addedBy: "AI" }).id,
        addException(tempDir, { hook: "h", pattern: "c", reason: "r3", addedBy: "AI" }).id,
      ];
      expect(ids).toEqual(["exc-001", "exc-002", "exc-003"]);
    });

    it("stores the adr field when provided", () => {
      const result = addException(tempDir, {
        hook: "layer-boundary",
        pattern: "src/admin/**",
        reason: "Admin routes have direct DB access by design",
        addedBy: "human",
        adr: "docs/adrs/0001-admin-db-access.md",
      });

      expect(result.adr).toBe("docs/adrs/0001-admin-db-access.md");
    });
  });

  describe("readExceptions", () => {
    it("returns empty array for missing file", () => {
      const exceptions = readExceptions(tempDir);
      expect(exceptions).toEqual([]);
    });

    it("returns empty array for missing .forgecraft directory", () => {
      const emptyDir = join(tmpdir(), `forgecraft-no-dir-test-${Date.now()}`);
      mkdirSync(emptyDir, { recursive: true });
      try {
        const exceptions = readExceptions(emptyDir);
        expect(exceptions).toEqual([]);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it("returns all exceptions from a valid file", () => {
      addException(tempDir, { hook: "layer-boundary", pattern: "src/migrations/**", reason: "r1", addedBy: "AI" });
      addException(tempDir, { hook: "anti-pattern/mock-data", pattern: "src/seeds/**", reason: "r2", addedBy: "human" });

      const exceptions = readExceptions(tempDir);
      expect(exceptions).toHaveLength(2);
      expect(exceptions[0].hook).toBe("layer-boundary");
      expect(exceptions[1].hook).toBe("anti-pattern/mock-data");
    });

    it("returns empty array for malformed JSON", () => {
      writeFileSync(
        join(tempDir, ".forgecraft", "exceptions.json"),
        "{ not valid json",
        "utf-8"
      );
      const exceptions = readExceptions(tempDir);
      expect(exceptions).toEqual([]);
    });
  });

  describe("findMatchingException", () => {
    const exceptions: HookException[] = [
      {
        id: "exc-001",
        hook: "layer-boundary",
        pattern: "src/migrations/**",
        reason: "Migrations need direct DB",
        addedAt: "2024-01-01T00:00:00.000Z",
        addedBy: "AI",
      },
      {
        id: "exc-002",
        hook: "anti-pattern/mock-data",
        pattern: "src/config/defaults.ts",
        reason: "Config has literal defaults",
        addedAt: "2024-01-01T00:00:00.000Z",
        addedBy: "human",
      },
      {
        id: "exc-003",
        hook: "error-hierarchy",
        pattern: "src/legacy/*.ts",
        reason: "Legacy module has bare Error throws",
        addedAt: "2024-01-01T00:00:00.000Z",
        addedBy: "AI",
      },
    ];

    it("returns exception when hook and pattern match exactly", () => {
      const match = findMatchingException(
        exceptions,
        "anti-pattern/mock-data",
        "src/config/defaults.ts"
      );
      expect(match).toBeDefined();
      expect(match?.id).toBe("exc-002");
    });

    it("returns undefined for wrong hook name", () => {
      const match = findMatchingException(
        exceptions,
        "wrong-hook",
        "src/migrations/001-init.ts"
      );
      expect(match).toBeUndefined();
    });

    it("handles ** glob pattern — matches nested paths", () => {
      const match = findMatchingException(
        exceptions,
        "layer-boundary",
        "src/migrations/001-init.ts"
      );
      expect(match).toBeDefined();
      expect(match?.id).toBe("exc-001");
    });

    it("handles ** glob pattern — matches deeply nested paths", () => {
      const match = findMatchingException(
        exceptions,
        "layer-boundary",
        "src/migrations/2024/01/add-users.ts"
      );
      expect(match).toBeDefined();
      expect(match?.id).toBe("exc-001");
    });

    it("handles * single-segment wildcard", () => {
      const match = findMatchingException(
        exceptions,
        "error-hierarchy",
        "src/legacy/user-service.ts"
      );
      expect(match).toBeDefined();
      expect(match?.id).toBe("exc-003");
    });

    it("does not match * wildcard across path separators", () => {
      const match = findMatchingException(
        exceptions,
        "error-hierarchy",
        "src/legacy/sub/deep.ts"
      );
      expect(match).toBeUndefined();
    });

    it("returns undefined when no exceptions are present", () => {
      const match = findMatchingException([], "layer-boundary", "src/anything.ts");
      expect(match).toBeUndefined();
    });
  });
});
