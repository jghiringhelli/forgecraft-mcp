import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkFileExists,
  checkAnyFileExists,
} from "../../src/analyzers/completeness-helpers.js";
import type { AuditCheck } from "../../src/shared/types.js";

const TMP = join(tmpdir(), `forgecraft-helpers-${Date.now()}`);

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("checkFileExists", () => {
  it("adds to passing when file exists", () => {
    writeFileSync(join(TMP, "exists.md"), "x");
    const passing: AuditCheck[] = [];
    const failing: AuditCheck[] = [];
    checkFileExists(TMP, "exists.md", "exists_check", "desc", passing, failing);
    expect(passing).toHaveLength(1);
    expect(failing).toHaveLength(0);
    expect(passing[0]?.check).toBe("exists_check");
  });

  it("adds to failing when file is absent", () => {
    const passing: AuditCheck[] = [];
    const failing: AuditCheck[] = [];
    checkFileExists(
      TMP,
      "missing.md",
      "missing_check",
      "needed for X",
      passing,
      failing,
    );
    expect(passing).toHaveLength(0);
    expect(failing).toHaveLength(1);
    expect(failing[0]?.message).toContain("needed for X");
    expect(failing[0]?.severity).toBe("error");
  });
});

describe("checkAnyFileExists", () => {
  it("passes when first candidate exists (canonical wins)", () => {
    writeFileSync(join(TMP, "canonical.md"), "x");
    writeFileSync(join(TMP, "legacy.md"), "x");
    const passing: AuditCheck[] = [];
    const failing: AuditCheck[] = [];
    checkAnyFileExists(
      TMP,
      ["canonical.md", "legacy.md"],
      "any_check",
      "desc",
      passing,
      failing,
    );
    expect(passing).toHaveLength(1);
    expect(passing[0]?.message).toContain("canonical.md");
    expect(failing).toHaveLength(0);
  });

  it("passes when only the second candidate (legacy) exists", () => {
    rmSync(join(TMP, "canonical.md"), { force: true });
    writeFileSync(join(TMP, "fallback.md"), "x");
    const passing: AuditCheck[] = [];
    const failing: AuditCheck[] = [];
    checkAnyFileExists(
      TMP,
      ["canonical.md", "fallback.md"],
      "any_check",
      "desc",
      passing,
      failing,
    );
    expect(passing).toHaveLength(1);
    expect(passing[0]?.message).toContain("fallback.md");
    expect(failing).toHaveLength(0);
  });

  it("fails when none of the candidates exist", () => {
    const passing: AuditCheck[] = [];
    const failing: AuditCheck[] = [];
    checkAnyFileExists(
      TMP,
      ["missing-a.md", "missing-b.md"],
      "any_check",
      "the canonical or legacy spec",
      passing,
      failing,
    );
    expect(passing).toHaveLength(0);
    expect(failing).toHaveLength(1);
    expect(failing[0]?.message).toContain("missing-a.md");
    expect(failing[0]?.message).toContain("missing-b.md");
    expect(failing[0]?.message).toContain("the canonical or legacy spec");
    expect(failing[0]?.severity).toBe("error");
  });

  it("works with a single-candidate array", () => {
    writeFileSync(join(TMP, "only.md"), "x");
    const passing: AuditCheck[] = [];
    const failing: AuditCheck[] = [];
    checkAnyFileExists(TMP, ["only.md"], "single", "desc", passing, failing);
    expect(passing).toHaveLength(1);
    expect(failing).toHaveLength(0);
  });
});
