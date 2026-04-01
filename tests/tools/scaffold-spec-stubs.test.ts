/**
 * Tests for scaffold-spec-stubs diagram builders.
 *
 * Each builder must return UNFILLED-marked content with real Mermaid structure
 * so diagrams are both detectable by check_cascade and immediately useful as
 * grammar production rules (not empty placeholders).
 */

import { describe, it, expect } from "vitest";
import {
  buildC4ContextStub,
  buildSequenceDiagramStub,
  buildStateMachineDiagramStub,
  buildFlowDiagramStub,
  buildC4ContainerStub,
  USE_CASES_STUB,
} from "../../src/tools/scaffold-spec-stubs.js";

describe("buildC4ContextStub", () => {
  it("contains UNFILLED marker for cascade detection", () => {
    expect(buildC4ContextStub("MyApp")).toContain("<!-- UNFILLED");
  });

  it("includes the project name in the diagram title", () => {
    const result = buildC4ContextStub("Billing Service");
    expect(result).toContain("Billing Service");
  });

  it("includes a Person declaration", () => {
    expect(buildC4ContextStub("MyApp")).toMatch(/Person\(/);
  });

  it("includes a System declaration", () => {
    expect(buildC4ContextStub("MyApp")).toMatch(/System\(/);
  });

  it("includes a Rel declaration", () => {
    expect(buildC4ContextStub("MyApp")).toMatch(/Rel\(/);
  });
});

describe("USE_CASES_STUB", () => {
  it("contains UNFILLED marker for cascade detection", () => {
    expect(USE_CASES_STUB).toContain("<!-- UNFILLED");
  });
});

// ── NEW: Sequence Diagram Stub ───────────────────────────────────────────────

describe("buildSequenceDiagramStub", () => {
  it("contains UNFILLED marker for cascade detection", () => {
    expect(buildSequenceDiagramStub("User Authentication")).toContain("<!-- UNFILLED");
  });

  it("includes the feature name in the title comment", () => {
    const result = buildSequenceDiagramStub("User Authentication");
    expect(result).toContain("User Authentication");
  });

  it("declares at least two participants", () => {
    const result = buildSequenceDiagramStub("Order Checkout");
    const participantMatches = result.match(/participant\s+\w+/g) ?? [];
    expect(participantMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least one message arrow (-->> or ->>)", () => {
    const result = buildSequenceDiagramStub("Order Checkout");
    expect(result).toMatch(/-->?>|->>/);
  });

  it("is valid Mermaid sequenceDiagram syntax (has sequenceDiagram keyword)", () => {
    expect(buildSequenceDiagramStub("Login")).toContain("sequenceDiagram");
  });
});

// ── NEW: State Machine Diagram Stub ─────────────────────────────────────────

describe("buildStateMachineDiagramStub", () => {
  it("contains UNFILLED marker for cascade detection", () => {
    expect(buildStateMachineDiagramStub("Order")).toContain("<!-- UNFILLED");
  });

  it("includes the entity name in the title comment", () => {
    const result = buildStateMachineDiagramStub("Invoice");
    expect(result).toContain("Invoice");
  });

  it("includes an initial state transition ([*] -->)", () => {
    const result = buildStateMachineDiagramStub("Order");
    expect(result).toContain("[*] -->");
  });

  it("includes at least one terminal state (--> [*])", () => {
    const result = buildStateMachineDiagramStub("Order");
    expect(result).toContain("--> [*]");
  });

  it("declares at least two named states", () => {
    const result = buildStateMachineDiagramStub("Order");
    // Named states appear as transition sources or destinations (word: word pattern)
    const stateTransitions = result.match(/\w+ --> \w+/g) ?? [];
    expect(stateTransitions.length).toBeGreaterThanOrEqual(2);
  });

  it("uses stateDiagram-v2 keyword", () => {
    expect(buildStateMachineDiagramStub("Order")).toContain("stateDiagram-v2");
  });
});

// ── NEW: Flow Diagram Stub ───────────────────────────────────────────────────

describe("buildFlowDiagramStub", () => {
  it("contains UNFILLED marker for cascade detection", () => {
    expect(buildFlowDiagramStub("UC-01: Register User")).toContain("<!-- UNFILLED");
  });

  it("includes the use case name in the title comment", () => {
    const result = buildFlowDiagramStub("UC-03: Place Order");
    expect(result).toContain("UC-03: Place Order");
  });

  it("includes a Start node with rounded syntax", () => {
    // flowchart rounded nodes use ([text]) syntax
    const result = buildFlowDiagramStub("Login");
    expect(result).toMatch(/\(\[.+\]\)/);
  });

  it("includes an End node with rounded syntax", () => {
    const result = buildFlowDiagramStub("Login");
    // Must have at least two rounded nodes (start and end)
    const roundedNodes = result.match(/\(\[.+?\]\)/g) ?? [];
    expect(roundedNodes.length).toBeGreaterThanOrEqual(2);
  });

  it("includes at least one decision diamond ({...})", () => {
    const result = buildFlowDiagramStub("Login");
    expect(result).toMatch(/\{.+?\}/);
  });

  it("uses flowchart keyword", () => {
    expect(buildFlowDiagramStub("Login")).toContain("flowchart");
  });
});

// ── NEW: C4 Container Diagram Stub ───────────────────────────────────────────

describe("buildC4ContainerStub", () => {
  it("contains UNFILLED marker for cascade detection", () => {
    expect(buildC4ContainerStub("MyApp")).toContain("<!-- UNFILLED");
  });

  it("includes the project name in the title", () => {
    const result = buildC4ContainerStub("Payments API");
    expect(result).toContain("Payments API");
  });

  it("declares at least one Container", () => {
    const result = buildC4ContainerStub("MyApp");
    expect(result).toMatch(/Container\(/);
  });

  it("includes a Rel declaration between containers", () => {
    const result = buildC4ContainerStub("MyApp");
    expect(result).toMatch(/Rel\(/);
  });

  it("uses C4Container keyword", () => {
    expect(buildC4ContainerStub("MyApp")).toContain("C4Container");
  });
});
