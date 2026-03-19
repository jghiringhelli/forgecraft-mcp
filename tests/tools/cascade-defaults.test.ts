/**
 * Tests for deriveDefaultCascadeDecisions in cascade-defaults.ts.
 * Covers: tag heuristics, most-restrictive rule, rationale content.
 */

import { describe, it, expect } from "vitest";
import { deriveDefaultCascadeDecisions } from "../../src/tools/cascade-defaults.js";
import type { CascadeDecision, CascadeStepName } from "../../src/shared/types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function decisionFor(
  decisions: CascadeDecision[],
  step: CascadeStepName,
): CascadeDecision {
  const d = decisions.find((dec) => dec.step === step);
  if (!d) throw new Error(`No decision found for step: ${step}`);
  return d;
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("deriveDefaultCascadeDecisions", () => {

  describe("output shape", () => {
    it("returns exactly 5 decisions", () => {
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], "Test");
      expect(decisions).toHaveLength(5);
    });

    it("covers all five step names", () => {
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], "Test");
      const steps = decisions.map((d) => d.step).sort();
      expect(steps).toEqual([
        "adrs",
        "architecture_diagrams",
        "behavioral_contracts",
        "constitution",
        "functional_spec",
      ]);
    });

    it("sets decidedBy to scaffold", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "Test");
      for (const d of decisions) {
        expect(d.decidedBy).toBe("scaffold");
      }
    });

    it("sets decidedAt to today's ISO date (YYYY-MM-DD)", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "Test");
      const today = new Date().toISOString().slice(0, 10);
      for (const d of decisions) {
        expect(d.decidedAt).toBe(today);
      }
    });

    it("every decision has a non-empty rationale string", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "Test");
      for (const d of decisions) {
        expect(d.rationale.length).toBeGreaterThan(10);
      }
    });
  });

  describe("CLI tag defaults", () => {
    it("functional_spec is required", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "My CLI");
      expect(decisionFor(decisions, "functional_spec").required).toBe(true);
    });

    it("architecture_diagrams is optional", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "My CLI");
      expect(decisionFor(decisions, "architecture_diagrams").required).toBe(false);
    });

    it("constitution is required", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "My CLI");
      expect(decisionFor(decisions, "constitution").required).toBe(true);
    });

    it("adrs is optional", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "My CLI");
      expect(decisionFor(decisions, "adrs").required).toBe(false);
    });

    it("behavioral_contracts is optional", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "My CLI");
      expect(decisionFor(decisions, "behavioral_contracts").required).toBe(false);
    });
  });

  describe("LIBRARY tag defaults", () => {
    it("all five steps are required", () => {
      const decisions = deriveDefaultCascadeDecisions(["LIBRARY"], "My Lib");
      for (const d of decisions) {
        expect(d.required).toBe(true);
      }
    });
  });

  describe("API tag defaults", () => {
    it("all five steps are required", () => {
      const decisions = deriveDefaultCascadeDecisions(["API"], "My API");
      for (const d of decisions) {
        expect(d.required).toBe(true);
      }
    });
  });

  describe("UNIVERSAL-only fallback", () => {
    it("functional_spec is required", () => {
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], "My Project");
      expect(decisionFor(decisions, "functional_spec").required).toBe(true);
    });

    it("architecture_diagrams is required", () => {
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], "My Project");
      expect(decisionFor(decisions, "architecture_diagrams").required).toBe(true);
    });

    it("constitution is required", () => {
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], "My Project");
      expect(decisionFor(decisions, "constitution").required).toBe(true);
    });

    it("adrs is optional", () => {
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], "My Project");
      expect(decisionFor(decisions, "adrs").required).toBe(false);
    });

    it("behavioral_contracts is optional", () => {
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], "My Project");
      expect(decisionFor(decisions, "behavioral_contracts").required).toBe(false);
    });
  });

  describe("no recognized tags — fail-safe defaults", () => {
    it("all steps are required when no recognized tags present", () => {
      const decisions = deriveDefaultCascadeDecisions([], "Unnamed");
      for (const d of decisions) {
        expect(d.required).toBe(true);
      }
    });

    it("unrecognized tags also default all steps to required", () => {
      const decisions = deriveDefaultCascadeDecisions(["WEB-REACT", "ML"], "ML App");
      for (const d of decisions) {
        expect(d.required).toBe(true);
      }
    });
  });

  describe("most-restrictive rule (multiple tags)", () => {
    it("CLI+API: architecture_diagrams is required (API overrides CLI optional)", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI", "API"], "CLI+API");
      expect(decisionFor(decisions, "architecture_diagrams").required).toBe(true);
    });

    it("CLI+LIBRARY: adrs is required (LIBRARY overrides CLI optional)", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI", "LIBRARY"], "CLI+Library");
      expect(decisionFor(decisions, "adrs").required).toBe(true);
    });

    it("CLI+API: behavioral_contracts is required (API overrides CLI optional)", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI", "API"], "CLI+API");
      expect(decisionFor(decisions, "behavioral_contracts").required).toBe(true);
    });

    it("CLI+LIBRARY: all steps required (most restrictive wins)", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI", "LIBRARY"], "Tool");
      for (const d of decisions) {
        expect(d.required).toBe(true);
      }
    });
  });

  describe("rationale content", () => {
    it("CLI architecture_diagrams optional rationale mentions CLI", () => {
      const decisions = deriveDefaultCascadeDecisions(["CLI"], "My CLI");
      const rationale = decisionFor(decisions, "architecture_diagrams").rationale;
      // Should mention CLI context (single-binary or CLI)
      expect(rationale.toLowerCase()).toMatch(/cli|single.?binary/);
    });

    it("API architecture_diagrams required rationale mentions contracts", () => {
      const decisions = deriveDefaultCascadeDecisions(["API"], "My API");
      const rationale = decisionFor(decisions, "architecture_diagrams").rationale;
      expect(rationale.toLowerCase()).toMatch(/contract|integration/);
    });

    it("LIBRARY behavioral_contracts required rationale mentions consumers", () => {
      const decisions = deriveDefaultCascadeDecisions(["LIBRARY"], "My Lib");
      const rationale = decisionFor(decisions, "behavioral_contracts").rationale;
      expect(rationale.toLowerCase()).toContain("consumer");
    });

    it("includes the project name in at least one rationale", () => {
      const projectName = "SpecialProject-XYZ";
      const decisions = deriveDefaultCascadeDecisions(["UNIVERSAL"], projectName);
      const allRationale = decisions.map((d) => d.rationale).join(" ");
      expect(allRationale).toContain(projectName);
    });
  });
});
