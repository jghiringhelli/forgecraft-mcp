import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreSelfDescribing } from "../../../src/analyzers/scorers/self-describing-scorer.js";
import {
  MIN_KEYWORD_HITS,
  INSTRUCTION_COVERAGE_KEYWORDS,
} from "../../../src/analyzers/scorers/scorer-utils.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fc-sd-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeInstruction(filename: string, content: string) {
  const full = join(dir, filename);
  const parent = full.substring(
    0,
    full.lastIndexOf("/") === -1
      ? full.lastIndexOf("\\")
      : full.lastIndexOf("/"),
  );
  if (parent !== full) mkdirSync(parent, { recursive: true });
  writeFileSync(full, content, "utf-8");
}

/** Content that hits exactly MIN_KEYWORD_HITS keywords. */
function sentinelContent(): string {
  return INSTRUCTION_COVERAGE_KEYWORDS.slice(0, MIN_KEYWORD_HITS).join("\n");
}

/** Content that hits more than MIN_KEYWORD_HITS keywords but is very short. */
function shortSentinelContent(): string {
  // Sentinel pattern: compact, navigational, keyword-rich.
  return [
    "# Project\n",
    "Architecture: see docs/specs/spec.md",
    "Convention: conventional commits only",
    "Decisions: docs/adrs/",
    "Pattern: see domain.md",
    "Module: src/",
  ].join("\n");
}

describe("score 0 — no instruction file", () => {
  it("returns score 0 when directory is empty", () => {
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(0);
    expect(result.property).toBe("self-describing");
    expect(result.evidence[0]).toMatch(/No AI assistant instruction file/);
  });
});

describe("score 1 — file found but insufficient keyword coverage", () => {
  it("returns score 1 for CLAUDE.md with no architectural keywords", () => {
    writeFileSync(
      join(dir, "CLAUDE.md"),
      "# Project\nA short file.\n",
      "utf-8",
    );
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(1);
    expect(result.evidence[0]).toMatch(/fewer than \d+ architecture/);
  });

  it("returns score 1 when keyword count is exactly MIN_KEYWORD_HITS - 1", () => {
    // Kills GreaterThanOrEqualTo L43: >= MIN_KEYWORD_HITS → > MIN_KEYWORD_HITS
    const content = INSTRUCTION_COVERAGE_KEYWORDS.slice(
      0,
      MIN_KEYWORD_HITS - 1,
    ).join("\n");
    writeFileSync(join(dir, "CLAUDE.md"), content, "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(1);
  });

  it("returns score 1 for .clinerules with no keywords", () => {
    writeFileSync(join(dir, ".clinerules"), "short\n", "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(1);
  });

  it("returns score 1 for .windsurfrules with no keywords", () => {
    writeFileSync(join(dir, ".windsurfrules"), "short\n", "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(1);
  });

  it("returns score 1 for CONVENTIONS.md with no keywords", () => {
    writeFileSync(join(dir, "CONVENTIONS.md"), "short\n", "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(1);
  });

  it("evidence includes suggestion to add missing keywords", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "architecture\n", "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(1);
    expect(
      result.evidence.some(
        (e) => e.includes("Add navigation") || e.includes("referencing"),
      ),
    ).toBe(true);
  });
});

describe("score 2 — sufficient keyword coverage", () => {
  it("returns score 2 for CLAUDE.md with exactly MIN_KEYWORD_HITS keywords", () => {
    // Kills GreaterThanOrEqualTo L43: >= MIN_KEYWORD_HITS → > MIN_KEYWORD_HITS
    writeFileSync(join(dir, "CLAUDE.md"), sentinelContent(), "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(2);
  });

  it("returns score 2 for a short compact sentinel with enough keywords", () => {
    // Core invariant: sentinel files (10–25 lines) with good keyword coverage score 2
    writeFileSync(join(dir, "CLAUDE.md"), shortSentinelContent(), "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(2);
  });

  it("returns score 2 for copilot-instructions.md with enough keywords", () => {
    const ghDir = join(dir, ".github");
    mkdirSync(ghDir, { recursive: true });
    writeFileSync(
      join(ghDir, "copilot-instructions.md"),
      sentinelContent(),
      "utf-8",
    );
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(2);
  });

  it("prefers CLAUDE.md when multiple instruction files exist", () => {
    writeFileSync(join(dir, "CLAUDE.md"), sentinelContent(), "utf-8");
    writeFileSync(join(dir, "CONVENTIONS.md"), sentinelContent(), "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.evidence[0]).toMatch(/CLAUDE\.md/);
  });

  it("evidence names the detected keywords", () => {
    writeFileSync(join(dir, "CLAUDE.md"), sentinelContent(), "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.evidence[0]).toMatch(/covers:/i);
  });

  it("evidence names the file that was found", () => {
    writeFileSync(join(dir, "CLAUDE.md"), sentinelContent(), "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.evidence[0]).toMatch(/CLAUDE\.md found/);
  });
});

describe("score 1 — missing keywords listed in evidence", () => {
  it("lists specific missing keywords", () => {
    // Kills BooleanLiteral: !lower.includes(kw) → false would empty the list
    const content = `architecture\n${INSTRUCTION_COVERAGE_KEYWORDS[0]}\n`;
    writeFileSync(join(dir, "CLAUDE.md"), content, "utf-8");
    const result = scoreSelfDescribing(dir);
    expect(result.score).toBe(1);
    const missing =
      result.evidence.find((e) => e.includes("referencing")) ?? "";
    expect(missing.length).toBeGreaterThan(
      "Add navigation or constraints referencing: ".length,
    );
  });
});
