// @ts-nocheck
import { describe, it, expect } from "vitest";
import { checkComposition } from "../../src/validators/composition-check.js";
import { CommitHistoryArtifact } from "../../src/artifacts/commit-history.js";
import { AdrArtifact } from "../../src/artifacts/adr.js";
import type { GenerativeSpec, ComposableSpec, BoundedSpec, CompositionConflict } from "../../src/core/index.js";

describe("checkComposition", () => {
  describe("no_conflicts", () => {
    it("returns_composable_true_for_empty_set", () => {
      const report = checkComposition([]);
      expect(report.composable).toBe(true);
      expect(report.conflicts).toHaveLength(0);
      expect(report.cyclicDependencies).toHaveLength(0);
    });

    it("returns_composable_true_for_single_artifact", () => {
      const artifact = new CommitHistoryArtifact("/tmp/project");
      const report = checkComposition([artifact]);
      expect(report.composable).toBe(true);
    });

    it("returns_composable_true_for_non_conflicting_pair", () => {
      const commitHistory = new CommitHistoryArtifact("/tmp/project");
      const adr = new AdrArtifact("/tmp/project");
      const report = checkComposition([commitHistory, adr]);
      expect(report.composable).toBe(true);
      expect(report.conflicts).toHaveLength(0);
    });
  });

  describe("conflict_detection", () => {
    it("reports_conflicts_from_composeWith", () => {
      // A synthetic spec that always reports a conflict with everything
      const conflictingSpec: GenerativeSpec = {
        specId: "test:conflicting",
        name: "Conflicting Spec",
        version: "1.0.0",
        purpose: "Testing",
        covers: ["something"],
        excludes: [],
        gates: [],
        decisions: [],
        changeHistory: [],
        dependsOn: [],
        isInScope: () => false,
        async verify() { return []; },
        async defend() { return { allPassed: true, results: [] }; },
        findDecision: () => undefined,
        composeWith(_other: ComposableSpec & BoundedSpec): ReadonlyArray<CompositionConflict> {
          return [{ specAId: "test:conflicting", specBId: "other", description: "Always conflicts", resolution: "remove one" }];
        },
      };

      const commitHistory = new CommitHistoryArtifact("/tmp/project");
      const report = checkComposition([conflictingSpec, commitHistory]);
      expect(report.composable).toBe(false);
      expect(report.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe("cycle_detection", () => {
    it("detects_no_cycles_for_independent_artifacts", () => {
      const commitHistory = new CommitHistoryArtifact("/tmp/project");
      const adr = new AdrArtifact("/tmp/project");
      const report = checkComposition([commitHistory, adr]);
      expect(report.cyclicDependencies).toHaveLength(0);
    });

    it("detects_self_loop", () => {
      const selfReferencing: GenerativeSpec = {
        specId: "test:self-loop",
        name: "Self Loop",
        version: "1.0.0",
        purpose: "Test",
        covers: [],
        excludes: [],
        gates: [],
        decisions: [],
        changeHistory: [],
        dependsOn: ["test:self-loop"],
        isInScope: () => false,
        async verify() { return []; },
        async defend() { return { allPassed: true, results: [] }; },
        findDecision: () => undefined,
        composeWith(): ReadonlyArray<CompositionConflict> { return []; },
      };

      const report = checkComposition([selfReferencing]);
      expect(report.cyclicDependencies.length).toBeGreaterThan(0);
      expect(report.composable).toBe(false);
    });
  });
});
