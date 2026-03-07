import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AdrArtifact, ADR_ARTIFACT_ID } from "../../src/artifacts/adr.js";

const WELL_FORMED_ADR = `# ADR-0001: Example Decision

## Status
Accepted

## Context
We needed to decide something important.

## Decision
We chose option A.

## Consequences
Things will be better.
`;

describe("AdrArtifact", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-adr-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("GenerativeSpec identity", () => {
    it("has_correct_specId", () => {
      const artifact = new AdrArtifact(tempDir);
      expect(artifact.specId).toBe(ADR_ARTIFACT_ID);
    });

    it("has_non_empty_covers_and_excludes", () => {
      const artifact = new AdrArtifact(tempDir);
      expect(artifact.covers.length).toBeGreaterThan(0);
      expect(artifact.excludes.length).toBeGreaterThan(0);
    });

    it("exposes_three_quality_gates", () => {
      const artifact = new AdrArtifact(tempDir);
      expect(artifact.gates.length).toBe(3);
    });
  });

  describe("isInScope", () => {
    const artifact = new AdrArtifact("/some/project");

    it("matches_adr_markdown_files", () => {
      expect(artifact.isInScope("docs/adrs/0001-init.md")).toBe(true);
    });

    it("rejects_files_outside_adr_dir", () => {
      expect(artifact.isInScope("README.md")).toBe(false);
      expect(artifact.isInScope("docs/spec.md")).toBe(false);
    });

    it("rejects_non_markdown_in_adr_dir", () => {
      expect(artifact.isInScope("docs/adrs/0001-init.ts")).toBe(false);
    });
  });

  describe("gates", () => {
    it("adr_dir_exists_gate_fails_when_missing", async () => {
      const artifact = new AdrArtifact(tempDir);
      const gate = artifact.gates.find((g) => g.id === "adr-dir-exists")!;
      const result = await gate.run();
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain("missing");
    });

    it("adr_dir_exists_gate_passes_when_present", async () => {
      mkdirSync(join(tempDir, "docs", "adrs"), { recursive: true });
      const artifact = new AdrArtifact(tempDir);
      const gate = artifact.gates.find((g) => g.id === "adr-dir-exists")!;
      const result = await gate.run();
      expect(result.exitCode).toBe(0);
    });

    it("naming_convention_gate_passes_for_valid_names", async () => {
      const adrDir = join(tempDir, "docs", "adrs");
      mkdirSync(adrDir, { recursive: true });
      writeFileSync(join(adrDir, "0001-initial-decision.md"), WELL_FORMED_ADR);
      const artifact = new AdrArtifact(tempDir);
      const gate = artifact.gates.find((g) => g.id === "adr-naming-convention")!;
      const result = await gate.run();
      expect(result.exitCode).toBe(0);
    });

    it("naming_convention_gate_fails_for_invalid_names", async () => {
      const adrDir = join(tempDir, "docs", "adrs");
      mkdirSync(adrDir, { recursive: true });
      writeFileSync(join(adrDir, "decision.md"), WELL_FORMED_ADR);
      const artifact = new AdrArtifact(tempDir);
      const gate = artifact.gates.find((g) => g.id === "adr-naming-convention")!;
      const result = await gate.run();
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain("decision.md");
    });

    it("naming_convention_gate_ignores_template_md", async () => {
      const adrDir = join(tempDir, "docs", "adrs");
      mkdirSync(adrDir, { recursive: true });
      writeFileSync(join(adrDir, "template.md"), "## Status\n## Context\n## Decision\n## Consequences");
      const artifact = new AdrArtifact(tempDir);
      const gate = artifact.gates.find((g) => g.id === "adr-naming-convention")!;
      const result = await gate.run();
      expect(result.exitCode).toBe(0);
    });

    it("required_sections_gate_passes_for_well_formed_adr", async () => {
      const adrDir = join(tempDir, "docs", "adrs");
      mkdirSync(adrDir, { recursive: true });
      writeFileSync(join(adrDir, "0001-test.md"), WELL_FORMED_ADR);
      const artifact = new AdrArtifact(tempDir);
      const gate = artifact.gates.find((g) => g.id === "adr-required-sections")!;
      const result = await gate.run();
      expect(result.exitCode).toBe(0);
    });

    it("required_sections_gate_fails_for_missing_section", async () => {
      const adrDir = join(tempDir, "docs", "adrs");
      mkdirSync(adrDir, { recursive: true });
      writeFileSync(join(adrDir, "0001-test.md"), "# ADR\n## Status\nAccepted\n## Context\n...");
      const artifact = new AdrArtifact(tempDir);
      const gate = artifact.gates.find((g) => g.id === "adr-required-sections")!;
      const result = await gate.run();
      expect(result.exitCode).toBe(1);
      expect(result.message).toContain("Decision");
    });
  });

  describe("verify", () => {
    it("returns_failure_for_missing_file", async () => {
      const artifact = new AdrArtifact(tempDir);
      const results = await artifact.verify("docs/adrs/0001-missing.md");
      expect(results[0]?.passed).toBe(false);
    });

    it("verifies_all_four_required_sections", async () => {
      const adrDir = join(tempDir, "docs", "adrs");
      mkdirSync(adrDir, { recursive: true });
      writeFileSync(join(adrDir, "0001-test.md"), WELL_FORMED_ADR);
      const artifact = new AdrArtifact(tempDir);
      const results = await artifact.verify("docs/adrs/0001-test.md");
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it("reports_missing_section_as_failed", async () => {
      const adrDir = join(tempDir, "docs", "adrs");
      mkdirSync(adrDir, { recursive: true });
      writeFileSync(join(adrDir, "0001-test.md"), "## Status\nAccepted\n## Context\n...\n## Decision\nChosen.");
      const artifact = new AdrArtifact(tempDir);
      const results = await artifact.verify("docs/adrs/0001-test.md");
      const consequencesResult = results.find((r) => r.criterion === "has-consequences");
      expect(consequencesResult?.passed).toBe(false);
    });
  });

  describe("defend", () => {
    it("resolves_and_returns_gate_results", async () => {
      const artifact = new AdrArtifact(tempDir);
      const report = await artifact.defend();
      expect(typeof report.allPassed).toBe("boolean");
      expect(report.results.length).toBe(3);
    });
  });
});
