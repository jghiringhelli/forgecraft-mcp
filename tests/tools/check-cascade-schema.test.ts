/**
 * Tests for checkSchemaDefinitions (Step 6) in check-cascade-contracts.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkSchemaDefinitions } from "../../src/tools/check-cascade.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `cascade-schema-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(
    join(
      dir,
      relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : "",
    ),
    {
      recursive: true,
    },
  );
  writeFileSync(fullPath, content, "utf-8");
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTempDir();
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("checkSchemaDefinitions (step 6)", () => {
  it("returns PASS when prisma/schema.prisma exists", () => {
    write(
      tmpDir,
      "prisma/schema.prisma",
      'datasource db { provider = "postgresql" }',
    );
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.step).toBe(6);
    expect(result.status).toBe("PASS");
    expect(result.detail).toContain("prisma/schema.prisma");
  });

  it("returns PASS when openapi.yaml exists", () => {
    write(
      tmpDir,
      "openapi.yaml",
      "openapi: 3.0.0\ninfo:\n  title: Test API\n  version: 1.0.0\n",
    );
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.status).toBe("PASS");
    expect(result.detail).toContain("openapi.yaml");
  });

  it("returns PASS when schema.graphql exists", () => {
    write(tmpDir, "schema.graphql", "type Query { hello: String }");
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.status).toBe("PASS");
  });

  it("returns PASS when docs/schema.md exists", () => {
    write(tmpDir, "docs/schema.md", "# Schema\n## Users table\n");
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.status).toBe("PASS");
  });

  it("returns WARN for JS/TS project with no schema artifact", () => {
    write(
      tmpDir,
      "package.json",
      JSON.stringify({ name: "my-api", scripts: { test: "vitest" } }),
    );
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.status).toBe("WARN");
    expect(result.detail).toContain("No schema artifact found");
    expect(result.action).toContain("openapi.yaml");
  });

  it("returns WARN for Python project with no schema artifact", () => {
    write(tmpDir, "requirements.txt", "fastapi\nsqlalchemy\n");
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.status).toBe("WARN");
  });

  it("returns SKIP when no build file exists (not an app project)", () => {
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.status).toBe("SKIP");
  });

  it("has step number 6", () => {
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.step).toBe(6);
    expect(result.name).toBe("Schema Definitions");
  });

  it("returns PASS when database/schema.sql exists", () => {
    write(
      tmpDir,
      "database/schema.sql",
      "CREATE TABLE users (id INT PRIMARY KEY);",
    );
    const result = checkSchemaDefinitions(tmpDir);
    expect(result.status).toBe("PASS");
    expect(result.detail).toContain("database/schema.sql");
  });
});
