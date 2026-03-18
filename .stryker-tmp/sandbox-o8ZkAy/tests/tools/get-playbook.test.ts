// @ts-nocheck
import { describe, it, expect } from "vitest";
import { getPlaybookHandler } from "../../src/tools/get-playbook.js";

describe("getPlaybookHandler", () => {
  describe("fintech_playbook", () => {
    it("returns_playbook_for_fintech_tag", async () => {
      const result = await getPlaybookHandler({ tags: ["FINTECH"] });
      const text = result.content[0]!.text;
      expect(text).toContain("[FINTECH]");
      expect(text).toContain("Phases Overview");
    });

    it("includes_all_six_phases", async () => {
      const result = await getPlaybookHandler({ tags: ["FINTECH"] });
      const text = result.content[0]!.text;
      // Phase titles appear in heading and overview table
      expect(text).toContain("Formula Research");
      expect(text).toContain("State Machine Design");
      expect(text).toContain("Parametrization");
      expect(text).toContain("Heuristic Search");
      expect(text).toContain("Simulation");
      expect(text).toContain("Implementation Handoff");
    });

    it("includes_step_instructions_and_expected_outputs", async () => {
      const result = await getPlaybookHandler({ tags: ["FINTECH"] });
      const text = result.content[0]!.text;
      expect(text).toContain("Expected output:");
      expect(text).toContain("Mermaid stateDiagram-v2");
    });

    it("filters_to_single_phase_when_phase_param_given", async () => {
      const result = await getPlaybookHandler({ tags: ["FINTECH"], phase: "parametrization" });
      const text = result.content[0]!.text;
      // Should contain parametrization content
      expect(text).toContain("Parametrization");
      // Should NOT contain the phases overview table (only rendered for full playbook)
      expect(text).not.toContain("Phases Overview");
    });

    it("reports_unknown_phase_gracefully", async () => {
      const result = await getPlaybookHandler({ tags: ["FINTECH"], phase: "nonexistent-phase" });
      const text = result.content[0]!.text;
      expect(text).toContain("No phase found");
      expect(text).toContain("nonexistent-phase");
    });
  });

  describe("game_playbook", () => {
    it("returns_playbook_for_game_tag", async () => {
      const result = await getPlaybookHandler({ tags: ["GAME"] });
      const text = result.content[0]!.text;
      expect(text).toContain("[GAME]");
    });

    it("includes_headless_simulation_phase", async () => {
      const result = await getPlaybookHandler({ tags: ["GAME"] });
      const text = result.content[0]!.text;
      expect(text).toContain("Headless Balance Simulation");
    });

    it("includes_art_generation_phase", async () => {
      const result = await getPlaybookHandler({ tags: ["GAME"] });
      const text = result.content[0]!.text;
      expect(text).toContain("Art Asset Generation");
    });

    it("includes_economy_tuning_phase", async () => {
      const result = await getPlaybookHandler({ tags: ["GAME"] });
      const text = result.content[0]!.text;
      expect(text).toContain("Economy Tuning");
    });
  });

  describe("multi_tag", () => {
    it("returns_multiple_playbooks_for_fintech_and_game", async () => {
      const result = await getPlaybookHandler({ tags: ["FINTECH", "GAME"] });
      const text = result.content[0]!.text;
      expect(text).toContain("[FINTECH]");
      expect(text).toContain("[GAME]");
      // The header line says '**Playbooks found:** N'
      expect(text).toMatch(/\*\*Playbooks found:\*\* [2-9]/);
    });
  });

  describe("no_playbook", () => {
    it("returns_helpful_message_for_tag_without_playbook", async () => {
      const result = await getPlaybookHandler({ tags: ["API"] });
      const text = result.content[0]!.text;
      expect(text).toContain("No playbooks found");
      expect(text).toContain("FINTECH");
      expect(text).toContain("GAME");
    });
  });
});

describe("playbook_router_integration", () => {
  it("get_reference_playbook_dispatches_correctly", async () => {
    // Import via the router to test the full dispatch chain
    const { forgecraftHandler } = await import("../../src/tools/forgecraft-router.js");
    const result = await forgecraftHandler({
      action: "get_reference",
      resource: "playbook",
      tags: ["FINTECH"],
    });
    const text = result.content[0]!.text;
    expect(text).toContain("[FINTECH]");
  });
});
