import { describe, it, expect } from "vitest";
import {
  gs,
  isSourceCodeFile,
  isTestOrFixtureFile,
  isConfigOrDeclaration,
  isRouteFile,
  collectDbViolations,
  stripExtension,
  testFileExists,
  DB_CALL_PATTERNS,
  ROUTE_DIRS,
  MIN_KEYWORD_HITS,
} from "../../../src/analyzers/scorers/scorer-utils.js";
import type { LayerViolation } from "../../../src/shared/types.js";

describe("gs builder", () => {
  it("builds a score record with all fields", () => {
    const result = gs("bounded", 2, ["clean"]);
    expect(result).toEqual({
      property: "bounded",
      score: 2,
      evidence: ["clean"],
    });
  });

  it("preserves score 0", () => {
    expect(gs("verifiable", 0, []).score).toBe(0);
  });

  it("preserves multiple evidence lines", () => {
    const e = ["line1", "line2", "line3"];
    expect(gs("auditable", 1, e).evidence).toEqual(e);
  });
});

describe("isSourceCodeFile", () => {
  it.each([".ts", ".tsx", ".js", ".jsx", ".py", ".kt", ".rs"])(
    "returns true for %s",
    (ext) => expect(isSourceCodeFile(`file${ext}`)).toBe(true),
  );

  it.each([".md", ".json", ".yaml", ".txt", ".sh"])(
    "returns false for %s",
    (ext) => expect(isSourceCodeFile(`file${ext}`)).toBe(false),
  );
});

describe("isTestOrFixtureFile", () => {
  it("detects .test.ts", () =>
    expect(isTestOrFixtureFile("foo.test.ts")).toBe(true));
  it("detects .spec.ts", () =>
    expect(isTestOrFixtureFile("foo.spec.ts")).toBe(true));
  it("detects __tests__ directory", () =>
    expect(isTestOrFixtureFile("__tests__/foo.ts")).toBe(true));
  it("detects /tests/ directory", () =>
    expect(isTestOrFixtureFile("/tests/tools/foo.ts")).toBe(true));
  it("detects /fixtures/ path", () =>
    expect(isTestOrFixtureFile("tests/fixtures/stub.ts")).toBe(true));
  it("detects /mocks/ path", () =>
    expect(isTestOrFixtureFile("src/mocks/fake.ts")).toBe(true));
  it("detects /mock/ path (singular)", () =>
    expect(isTestOrFixtureFile("src/mock/stub.ts")).toBe(true));
  it("detects .d.ts", () =>
    expect(isTestOrFixtureFile("types.d.ts")).toBe(true));
  it("detects test_ prefix (underscore)", () =>
    expect(isTestOrFixtureFile("test_utils.ts")).toBe(true));
  it("returns false for normal source", () =>
    expect(isTestOrFixtureFile("src/tools/audit.ts")).toBe(false));
  it("handles Windows backslashes", () =>
    expect(isTestOrFixtureFile("tests\\tools\\foo.test.ts")).toBe(true));
});

describe("isConfigOrDeclaration", () => {
  it("detects .d.ts", () =>
    expect(isConfigOrDeclaration("types.d.ts")).toBe(true));
  it("detects config. prefix", () =>
    expect(isConfigOrDeclaration("config.ts")).toBe(true));
  it("detects .config. infix", () =>
    expect(isConfigOrDeclaration("vitest.config.ts")).toBe(true));
  it("detects index.ts", () =>
    expect(isConfigOrDeclaration("src/tools/index.ts")).toBe(true));
  it("detects schema.prisma", () =>
    expect(isConfigOrDeclaration("schema.prisma")).toBe(true));
  it("returns false for regular source", () =>
    expect(isConfigOrDeclaration("src/tools/audit.ts")).toBe(false));
});

describe("isRouteFile", () => {
  it("detects /routes/ directory", () =>
    expect(isRouteFile("src/routes/user.ts")).toBe(true));
  it("detects /controllers/ directory", () =>
    expect(isRouteFile("src/controllers/user.ts")).toBe(true));
  it("detects /handlers/ directory", () =>
    expect(isRouteFile("src/handlers/user.ts")).toBe(true));
  it("detects /api/ directory", () =>
    expect(isRouteFile("src/api/user.ts")).toBe(true));
  it("detects /endpoints/ directory", () =>
    expect(isRouteFile("src/endpoints/user.ts")).toBe(true));
  it("returns false for service file", () =>
    expect(isRouteFile("src/services/user.ts")).toBe(false));
  it("handles Windows backslashes", () =>
    expect(isRouteFile("src\\routes\\user.ts")).toBe(true));
  it("is case-insensitive", () =>
    expect(isRouteFile("src/Routes/foo.ts")).toBe(true));
});

describe("collectDbViolations", () => {
  it("detects prisma call", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["const u = prisma.user.findMany()"],
      "routes/user.ts",
      violations,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.line).toBe(1);
    expect(violations[0]!.file).toBe("routes/user.ts");
  });

  it("detects mongoose.model", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["const M = mongoose.model('User', schema)"],
      "controllers/c.ts",
      violations,
    );
    expect(violations).toHaveLength(1);
  });

  it("skips comment lines", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["// prisma.user.findMany()"],
      "routes/user.ts",
      violations,
    );
    expect(violations).toHaveLength(0);
  });

  it("skips comment without leading space", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["//prisma.user.findMany()"],
      "routes/user.ts",
      violations,
    );
    expect(violations).toHaveLength(0);
  });

  it("flags db call with inline trailing comment (not a comment line)", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["const u = prisma.user.findMany() // fetch all"],
      "routes/user.ts",
      violations,
    );
    expect(violations).toHaveLength(1);
  });

  it("skips import lines", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["import { prisma } from './db'"],
      "routes/user.ts",
      violations,
    );
    expect(violations).toHaveLength(0);
  });

  it("collects multiple violations from different lines", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["prisma.user.findMany()", "const x = 1", "db.posts.query()"],
      "routes/user.ts",
      violations,
    );
    expect(violations).toHaveLength(2);
    expect(violations[0]!.line).toBe(1);
    expect(violations[1]!.line).toBe(3);
  });

  it("truncates snippet to 120 chars", () => {
    const violations: LayerViolation[] = [];
    const longLine = "prisma.user.findMany(" + "x".repeat(200) + ")";
    collectDbViolations([longLine], "routes/r.ts", violations);
    expect(violations[0]!.snippet.length).toBe(120);
  });

  it("collects nothing from clean lines", () => {
    const violations: LayerViolation[] = [];
    collectDbViolations(
      ["const x = userService.getUser(id)"],
      "routes/r.ts",
      violations,
    );
    expect(violations).toHaveLength(0);
  });
});

describe("stripExtension", () => {
  it("strips .ts", () => expect(stripExtension("foo.ts")).toBe("foo"));
  it("strips .test.ts", () =>
    expect(stripExtension("foo.test.ts")).toBe("foo.test"));
  it("strips .js", () => expect(stripExtension("foo.js")).toBe("foo"));
  it("handles no extension", () => expect(stripExtension("foo")).toBe("foo"));
});

describe("testFileExists", () => {
  const files = [
    "tests/tools/audit.test.ts",
    "src/tools/audit.ts",
    "tests/shared/errors.test.ts",
  ];

  it("finds a test file by base name", () => {
    expect(testFileExists("audit", files)).toBe(true);
  });

  it("returns false when no matching test", () => {
    expect(testFileExists("refresh", files)).toBe(false);
  });

  it("matches by base name regardless of path", () => {
    expect(testFileExists("errors", files)).toBe(true);
  });

  it("preserves base names with .test not at the end", () => {
    // Kills the mutation that removes the $ end-anchor from /\.(test|spec)$/
    // Without $, "foo.test.bar" → replace first .test → "foo.bar" ≠ "foo.test.bar"
    const testFiles = ["tests/foo.test.bar.ts"];
    expect(testFileExists("foo.test.bar", testFiles)).toBe(true);
  });
});

describe("constants", () => {
  it("MIN_KEYWORD_HITS is 3", () => expect(MIN_KEYWORD_HITS).toBe(3));
  it("DB_CALL_PATTERNS is non-empty", () =>
    expect(DB_CALL_PATTERNS.length).toBeGreaterThan(0));
  it("ROUTE_DIRS includes routes and controllers", () => {
    expect(ROUTE_DIRS).toContain("routes");
    expect(ROUTE_DIRS).toContain("controllers");
  });
});
