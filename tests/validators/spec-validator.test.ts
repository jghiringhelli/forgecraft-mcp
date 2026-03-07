import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateSpecs, formatValidationReport } from "../../src/validators/spec-validator.js";
import { CommitHistoryArtifact } from "../../src/artifacts/commit-history.js";
import { AdrArtifact } from "../../src/artifacts/adr.js";

describe("validateSpecs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-validator-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns_correct_structure_for_empty_spec_set", async () => {
    const report = await validateSpecs([], tempDir);
    expect(report.allPassed).toBe(true);
    expect(report.artifactResults).toHaveLength(0);
    expect(report.summary.total).toBe(0);
    expect(report.summary.passed).toBe(0);
    expect(report.summary.failed).toBe(0);
    expect(report.projectDir).toBe(tempDir);
    expect(typeof report.timestamp).toBe("string");
  });

  it("runs_commit_history_artifact_gates", async () => {
    const artifact = new CommitHistoryArtifact(tempDir);
    const report = await validateSpecs([artifact], tempDir);
    expect(report.artifactResults).toHaveLength(1);
    expect(report.artifactResults[0]?.specId).toBe("artifact:commit-history");
  });

  it("marks_allPassed_false_when_gate_fails", async () => {
    // ADR artifact with no docs/adrs/ directory — gate should fail
    const adr = new AdrArtifact(tempDir);
    const report = await validateSpecs([adr], tempDir);
    expect(report.allPassed).toBe(false);
    expect(report.summary.failed).toBe(1);
  });

  it("marks_allPassed_true_when_all_gates_pass", async () => {
    // Set up a valid ADR directory
    const adrDir = join(tempDir, "docs", "adrs");
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, "0001-initial.md"),
      "# ADR-0001\n\n## Status\nAccepted\n\n## Context\nCtx\n\n## Decision\nDec\n\n## Consequences\nCons"
    );
    // CommitHistoryArtifact always passes its gate
    const commitHistory = new CommitHistoryArtifact(tempDir);
    const adr = new AdrArtifact(tempDir);
    const report = await validateSpecs([commitHistory, adr], tempDir);
    expect(report.summary.total).toBe(2);
    expect(report.allPassed).toBe(true);
  });

  it("includes_verification_results_for_in_scope_paths", async () => {
    const adrDir = join(tempDir, "docs", "adrs");
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(join(adrDir, "0001-test.md"),
      "## Status\nAccepted\n\n## Context\n...\n\n## Decision\nChosen.\n\n## Consequences\nBetter."
    );
    const adr = new AdrArtifact(tempDir);
    const report = await validateSpecs([adr], tempDir, ["docs/adrs/0001-test.md"]);
    const result = report.artifactResults[0]!;
    expect(result.verificationResults.length).toBeGreaterThan(0);
  });

  it("skips_verification_for_out_of_scope_paths", async () => {
    const artifact = new CommitHistoryArtifact(tempDir);
    // docs/adrs/... is NOT in scope for CommitHistoryArtifact
    const report = await validateSpecs([artifact], tempDir, ["docs/adrs/0001-test.md"]);
    expect(report.artifactResults[0]?.verificationResults).toHaveLength(0);
  });

  it("summary_counts_match_artifact_results", async () => {
    const adr = new AdrArtifact(tempDir); // will fail (no adr dir)
    const commitHistory = new CommitHistoryArtifact(tempDir); // will pass
    const report = await validateSpecs([adr, commitHistory], tempDir);
    expect(report.summary.total).toBe(2);
    expect(report.summary.passed + report.summary.failed).toBe(2);
  });
});

describe("formatValidationReport", () => {
  it("includes_pass_icon_when_all_passed", async () => {
    const commitHistory = new CommitHistoryArtifact("/tmp");
    const report = await validateSpecs([commitHistory], "/tmp");
    const output = formatValidationReport(report);
    expect(output).toContain("✅");
  });

  it("includes_fail_icon_when_any_failed", async () => {
    const tempDir = join(tmpdir(), `fmt-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    try {
      const adr = new AdrArtifact(tempDir); // will fail
      const report = await validateSpecs([adr], tempDir);
      const output = formatValidationReport(report);
      expect(output).toContain("❌");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("contains_project_dir_and_timestamp", async () => {
    const commitHistory = new CommitHistoryArtifact("/tmp");
    const report = await validateSpecs([commitHistory], "/tmp");
    const output = formatValidationReport(report);
    expect(output).toContain("/tmp");
    expect(output).toContain(report.timestamp);
  });

  it("lists_each_artifact_spec_name", async () => {
    const commitHistory = new CommitHistoryArtifact("/tmp");
    const report = await validateSpecs([commitHistory], "/tmp");
    const output = formatValidationReport(report);
    expect(output).toContain(commitHistory.name);
  });
});
