/**
 * Tests for the generate_decision tool handler.
 *
 * Covers: file creation, slug generation, date-prefixed filename,
 * placeholder handling, chronicle session linking, related ADR linking,
 * directory creation, duplicate protection.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateDecisionHandler,
  renderDecision,
  titleToSlug,
} from "../../src/tools/generate-decision.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-decision-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const today = new Date().toISOString().slice(0, 10);

describe("titleToSlug", () => {
  it("kebab-cases and lowercases", () => {
    expect(titleToSlug("Drop duplicate task_id rows")).toBe(
      "drop-duplicate-task-id-rows",
    );
  });

  it("strips punctuation", () => {
    expect(titleToSlug("Fix: NPE in /api/users!")).toBe("fix-npe-in-apiusers");
  });

  it("truncates to 60 chars", () => {
    const long = "a".repeat(100);
    expect(titleToSlug(long).length).toBeLessThanOrEqual(60);
  });
});

describe("renderDecision", () => {
  it("uses provided fields verbatim", () => {
    const out = renderDecision({
      date: "2026-05-11",
      title: "Drop duplicate task_id rows",
      trigger: "Import retry created duplicates.",
      root_cause: "No unique constraint on task_id.",
      fix: "Added migration 0042 with UNIQUE(task_id).",
      regression_test: "tests/integration/import.test.ts:test_idempotent_retry",
    });
    expect(out).toContain("# Drop duplicate task_id rows");
    expect(out).toContain("Import retry created duplicates.");
    expect(out).toContain("No unique constraint on task_id.");
    expect(out).toContain("Added migration 0042 with UNIQUE(task_id).");
    expect(out).toContain("test_idempotent_retry");
  });

  it("writes NEEDS CLARIFICATION placeholders when fields omitted", () => {
    const out = renderDecision({
      date: "2026-05-11",
      title: "Untriaged bug",
    });
    expect(out).toContain("[NEEDS CLARIFICATION:");
    expect(out.match(/\[NEEDS CLARIFICATION:/g)!.length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("flags regression_test placeholder as REQUIRED", () => {
    const out = renderDecision({ date: today, title: "x" });
    expect(out).toMatch(/Regression Test[\s\S]*REQUIRED/);
  });

  it("links chronicle session when provided", () => {
    const out = renderDecision({
      date: today,
      title: "x",
      chronicle_session_id: "sess-2026-05-11-abc123",
    });
    expect(out).toContain("**Chronicle session:**");
    expect(out).toContain("sess-2026-05-11-abc123");
  });

  it("links related ADR when provided", () => {
    const out = renderDecision({
      date: today,
      title: "x",
      related_adr: "ADR-0007",
    });
    expect(out).toContain("**Related ADR:** ADR-0007");
  });

  it("omits chronicle/ADR headers when not provided", () => {
    const out = renderDecision({ date: today, title: "x" });
    expect(out).not.toContain("**Chronicle session:**");
    expect(out).not.toContain("**Related ADR:**");
  });
});

describe("generateDecisionHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates docs/decisions/ if missing", async () => {
    await generateDecisionHandler({
      project_dir: tempDir,
      title: "Drop duplicate rows",
    });
    expect(existsSync(join(tempDir, "docs", "decisions"))).toBe(true);
  });

  it("writes file with YYYY-MM-DD-slug.md pattern", async () => {
    await generateDecisionHandler({
      project_dir: tempDir,
      title: "Drop duplicate rows",
    });
    const expected = join(
      tempDir,
      "docs",
      "decisions",
      `${today}-drop-duplicate-rows.md`,
    );
    expect(existsSync(expected)).toBe(true);
  });

  it("returns text with file path and date", async () => {
    const result = await generateDecisionHandler({
      project_dir: tempDir,
      title: "Drop duplicate rows",
    });
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain("docs/decisions/");
    expect(result.content[0]!.text).toContain(today);
  });

  it("writes provided trigger / fix / regression_test into content", async () => {
    await generateDecisionHandler({
      project_dir: tempDir,
      title: "Drop duplicate rows",
      trigger: "Retry created duplicates",
      fix: "Added UNIQUE constraint",
      regression_test: "import.test.ts::idempotent",
    });
    const file = join(
      tempDir,
      "docs",
      "decisions",
      `${today}-drop-duplicate-rows.md`,
    );
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("Retry created duplicates");
    expect(content).toContain("Added UNIQUE constraint");
    expect(content).toContain("import.test.ts::idempotent");
  });

  it("links chronicle session id when provided", async () => {
    await generateDecisionHandler({
      project_dir: tempDir,
      title: "x",
      chronicle_session_id: "sess-abc",
    });
    const content = readFileSync(
      join(tempDir, "docs", "decisions", `${today}-x.md`),
      "utf-8",
    );
    expect(content).toContain("sess-abc");
    expect(content).toContain(
      "Investigation recorded in chronicle session `sess-abc`",
    );
  });

  it("blocks rewrite when file already exists for the same date+slug", async () => {
    await generateDecisionHandler({
      project_dir: tempDir,
      title: "Drop duplicate rows",
    });
    const result = await generateDecisionHandler({
      project_dir: tempDir,
      title: "Drop duplicate rows",
    });
    expect(result.content[0]!.text).toContain("already exists");
  });

  it("response prompts to add chronicle session id when omitted", async () => {
    const result = await generateDecisionHandler({
      project_dir: tempDir,
      title: "Drop duplicate rows",
    });
    expect(result.content[0]!.text).toContain("chronicle_session_id");
  });
});
