import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreAuditable } from "../../../src/analyzers/scorers/auditable-scorer.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fc-aud-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function mkAdr(name = "ADR-0001-init.md") {
  const d = join(dir, "docs", "adrs");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, name), "# ADR", "utf-8");
}

function mkStatus(name = "CHANGELOG.md") {
  writeFileSync(join(dir, name), "# Changelog", "utf-8");
}

function mkCommitConfig() {
  writeFileSync(
    join(dir, "commitlint.config.js"),
    "module.exports = {}",
    "utf-8",
  );
}

function allFiles(): string[] {
  const adrPath = `docs/adrs/ADR-0001-init.md`;
  return [adrPath];
}

describe("score 0 — nothing present", () => {
  it("returns score 0 when project is empty", () => {
    const result = scoreAuditable(dir, []);
    expect(result.score).toBe(0);
    expect(result.property).toBe("auditable");
    expect(result.evidence[0]).toMatch(/No ADRs/);
  });
});

describe("score 1 — partial signals", () => {
  it("returns score 1 with only Status.md", () => {
    mkStatus("Status.md");
    const result = scoreAuditable(dir, []);
    expect(result.score).toBe(1);
    expect(result.evidence.some((e) => e.includes("Status.md"))).toBe(true);
    expect(result.evidence.some((e) => e.includes("Missing"))).toBe(true);
  });

  it("returns score 1 with only CHANGELOG.md", () => {
    mkStatus("CHANGELOG.md");
    const result = scoreAuditable(dir, []);
    expect(result.score).toBe(1);
  });

  it("returns score 1 with only ADRs", () => {
    mkAdr();
    const result = scoreAuditable(dir, allFiles());
    expect(result.score).toBe(1);
    expect(result.evidence.some((e) => e.includes("ADR"))).toBe(true);
  });

  it("returns score 1 with only commit config", () => {
    mkCommitConfig();
    const result = scoreAuditable(dir, []);
    expect(result.score).toBe(1);
  });

  it("returns score 1 with ADRs + Status but no commit config", () => {
    mkAdr();
    mkStatus();
    const result = scoreAuditable(dir, allFiles());
    expect(result.score).toBe(1);
    expect(result.evidence.some((e) => e.includes("Missing"))).toBe(true);
  });
});

describe("score 2 — all three signals", () => {
  it("returns score 2 with ADRs + Status + commit config", () => {
    mkAdr();
    mkStatus();
    mkCommitConfig();
    const result = scoreAuditable(dir, allFiles());
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/ADR file/);
    expect(result.evidence[1]).toMatch(/Status\.md/);
    expect(result.evidence[2]).toMatch(/commit/i);
  });

  it("counts multiple ADR files in evidence", () => {
    mkAdr("ADR-0001.md");
    mkAdr("ADR-0002.md");
    mkStatus();
    mkCommitConfig();
    const files = ["docs/adrs/ADR-0001.md", "docs/adrs/ADR-0002.md"];
    const result = scoreAuditable(dir, files);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toContain("2 ADR");
  });

  it("accepts .husky/commit-msg as commit config", () => {
    mkAdr();
    mkStatus();
    const huskyDir = join(dir, ".husky");
    mkdirSync(huskyDir, { recursive: true });
    writeFileSync(join(huskyDir, "commit-msg"), "#!/bin/sh", "utf-8");
    const result = scoreAuditable(dir, allFiles());
    expect(result.score).toBe(2);
  });

  it("recognises docs/decisions/ as ADR directory", () => {
    const d = join(dir, "docs", "decisions");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "001-init.md"), "# Decision", "utf-8");
    mkStatus();
    mkCommitConfig();
    const result = scoreAuditable(dir, ["docs/decisions/001-init.md"]);
    expect(result.score).toBe(2);
  });

  it("recognises docs/adr/ (singular) as ADR directory", () => {
    // Kills Regex: adrs? → adrs (singular 'adr/' would stop matching)
    const d = join(dir, "docs", "adr");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "0001-init.md"), "# ADR", "utf-8");
    mkStatus();
    mkCommitConfig();
    const result = scoreAuditable(dir, ["docs/adr/0001-init.md"]);
    expect(result.score).toBe(2);
    expect(result.evidence[0]).toMatch(/ADR/);
  });

  it("recognises docs/decision/ (singular) as ADR directory", () => {
    // Kills Regex: decisions? → decisions (singular 'decision/' would stop matching)
    const d = join(dir, "docs", "decision");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "001.md"), "# Decision", "utf-8");
    mkStatus();
    mkCommitConfig();
    const result = scoreAuditable(dir, ["docs/decision/001.md"]);
    expect(result.score).toBe(2);
  });

  it("recognises docs/rfc/ (singular) as ADR directory", () => {
    // Kills Regex: rfcs? → rfcs (singular 'rfc/' would stop matching)
    const d = join(dir, "docs", "rfc");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "001.md"), "# RFC", "utf-8");
    mkStatus();
    mkCommitConfig();
    const result = scoreAuditable(dir, ["docs/rfc/001.md"]);
    expect(result.score).toBe(2);
  });
});

describe("evidence content — partial signals", () => {
  it("absent items appear under Missing: label, not Present:", () => {
    // Kills ConditionalExpression L45/L47/L49 and ArrayDeclaration L43/L44
    mkStatus();
    const result = scoreAuditable(dir, []);
    expect(result.score).toBe(1);
    const presentLine =
      result.evidence.find((e) => e.startsWith("Present:")) ?? "";
    const missingLine =
      result.evidence.find((e) => e.startsWith("Missing:")) ?? "";
    expect(presentLine).toContain("Status.md");
    expect(missingLine).toContain("ADR");
    expect(missingLine).toContain("commitlint");
    expect(presentLine).not.toContain("ADR");
  });

  it("non-ADR markdown files do not inflate ADR count", () => {
    // Kills LogicalOperator L17: && → || (any .md file would count as ADR)
    mkStatus();
    mkCommitConfig();
    const result = scoreAuditable(dir, ["README.md", "CHANGELOG.md"]);
    expect(result.score).toBe(1);
    const missingLine =
      result.evidence.find((e) => e.startsWith("Missing:")) ?? "";
    expect(missingLine).toContain("ADR");
  });
});
