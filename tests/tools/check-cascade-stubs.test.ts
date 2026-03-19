/**
 * Tests for STUB detection, isCascadeComplete, and buildGuidedRemediation
 * in the check-cascade tool.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkCascadeHandler,
  isCascadeComplete,
  buildGuidedRemediation,
  runCascadeChecks,
  type CascadeStep,
} from "../../src/tools/check-cascade.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-cascade-stub-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(join(dir, relPath.includes("/") ? relPath.split("/").slice(0, -1).join("/") : ""), {
    recursive: true,
  });
  writeFileSync(fullPath, content, "utf-8");
}

/** Build a fully passing cascade without any UNFILLED markers. */
function buildCompleteCascade(dir: string): void {
  write(dir, "docs/PRD.md", "# PRD\n## Problem\nSolves user pain.\n## Users\nDevelopers who build.\n");
  mkdirSync(join(dir, "docs/diagrams"), { recursive: true });
  write(dir, "docs/diagrams/c4-context.md", "```mermaid\nC4Context\n  Person(user, 'User')\n```\n");
  write(dir, "CLAUDE.md", "# CLAUDE.md\n## Architecture Rules\n- Keep layers separate.\n");
  mkdirSync(join(dir, "docs/adrs"), { recursive: true });
  write(dir, "docs/adrs/ADR-0001-stack.md", "# ADR-0001\n## Decision\nUse TypeScript.\n");
  write(dir, "docs/use-cases.md", "# Use Cases\n## UC-001\nActor: user\nPrecondition: logged in\n");
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("STUB detection in checkCascadeHandler", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  // ── Step 1: Functional Spec STUB ──────────────────────────────────

  describe("step 1 — functional specification STUB", () => {
    it("reports STUB when docs/PRD.md has <!-- FILL: markers", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n## Problem\n<!-- FILL: What problem? -->\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("⚠ STUB");
    });

    it("reports STUB when docs/PRD.md has <!-- UNFILLED marker", async () => {
      write(tempDir, "docs/PRD.md", "<!-- UNFILLED: Product Requirements -->\n# PRD\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("⚠ STUB");
    });

    it("reports STUB when docs/PRD.md has [DESCRIBE pattern", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n[DESCRIBE the product here]\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("⚠ STUB");
    });

    it("reports PASS when docs/PRD.md has real content without template markers", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("COMPLETE");
    });

    it("STUB counts as blocking — reports BLOCKED status", async () => {
      write(tempDir, "docs/PRD.md", "<!-- UNFILLED: PRD -->\n# PRD\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("BLOCKED");
    });
  });

  // ── Step 2: Diagrams STUB ─────────────────────────────────────────

  describe("step 2 — architecture diagrams STUB", () => {
    it("reports STUB when c4-context.md has <!-- FILL: markers", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\n## Real content.\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4-context.md",
        "<!-- UNFILLED: C4 Diagram -->\n```mermaid\nC4Context\n  <!-- FILL: users -->\n```\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("⚠ STUB");
    });

    it("reports PASS when diagram has real content", async () => {
      buildCompleteCascade(tempDir);
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("COMPLETE");
    });
  });

  // ── Step 5: Use Cases STUB ────────────────────────────────────────

  describe("step 5 — behavioral contracts STUB", () => {
    it("reports STUB when docs/use-cases.md has <!-- FILL: markers", async () => {
      write(tempDir, "docs/PRD.md", "# PRD\nReal content here.\n");
      mkdirSync(join(tempDir, "docs/diagrams"), { recursive: true });
      write(tempDir, "docs/diagrams/c4-context.md", "```mermaid\nC4Context\n  Person(u,'U')\n```\n");
      write(tempDir, "CLAUDE.md", "# Rules\n- Use TypeScript.\n");
      mkdirSync(join(tempDir, "docs/adrs"), { recursive: true });
      write(tempDir, "docs/adrs/ADR-0001.md", "# ADR\n## Decision\nUse Node.\n");
      write(tempDir, "docs/use-cases.md",
        "<!-- UNFILLED: Use Cases -->\n# Use Cases\n## UC-01: [Name]\n**Actor**: <!-- FILL: who? -->\n");
      const result = await checkCascadeHandler({ project_dir: tempDir });
      expect(result.content[0]!.text).toContain("⚠ STUB");
    });
  });
});

// ── isCascadeComplete ─────────────────────────────────────────────────

describe("isCascadeComplete", () => {
  it("returns true when all steps are PASS", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "PASS", detail: "OK", questions: [] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    expect(isCascadeComplete(steps)).toBe(true);
  });

  it("returns true when all steps are PASS or WARN", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "PASS", detail: "OK", questions: [] },
      { step: 2, name: "Diagrams", status: "WARN", detail: "Empty dir", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "WARN", detail: "Partial", questions: [] },
    ];
    expect(isCascadeComplete(steps)).toBe(true);
  });

  it("returns false when any step is FAIL", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "FAIL", detail: "Missing", questions: [] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    expect(isCascadeComplete(steps)).toBe(false);
  });

  it("returns false when any step is STUB", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "STUB", detail: "Unfilled", questions: ["q1"] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    expect(isCascadeComplete(steps)).toBe(false);
  });
});

// ── buildGuidedRemediation ────────────────────────────────────────────

describe("buildGuidedRemediation", () => {
  it("returns 'All cascade steps are complete' when everything passes", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "PASS", detail: "OK", questions: [] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    expect(buildGuidedRemediation(steps)).toBe("All cascade steps are complete.");
  });

  it("includes failing step numbers in order", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "FAIL", detail: "Missing", questions: ["q1"] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "FAIL", detail: "Missing", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    const text = buildGuidedRemediation(steps);
    expect(text).toContain("Step 1");
    expect(text).toContain("Step 3");
  });

  it("shows only the FIRST failing step's questions", () => {
    const steps: CascadeStep[] = [
      {
        step: 1, name: "Spec", status: "FAIL", detail: "Missing",
        questions: ["What problem?", "Who are users?"],
      },
      { step: 2, name: "Diagrams", status: "FAIL", detail: "Missing", questions: ["What components?"] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    const text = buildGuidedRemediation(steps);
    expect(text).toContain("What problem?");
    expect(text).toContain("Who are users?");
    expect(text).not.toContain("What components?");
  });

  it("shows STUB steps with ⚠ STUB label in the failing list", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "STUB", detail: "Unfilled", questions: ["q1"] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    const text = buildGuidedRemediation(steps);
    expect(text).toContain("⚠ STUB");
  });

  it("includes the artifact path for the first failing step", () => {
    const steps: CascadeStep[] = [
      { step: 1, name: "Spec", status: "FAIL", detail: "Missing", questions: ["q1"] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
      { step: 5, name: "Use Cases", status: "PASS", detail: "OK", questions: [] },
    ];
    const text = buildGuidedRemediation(steps);
    expect(text).toContain("docs/PRD.md");
  });

  it("includes the closing line with artifact name", () => {
    const steps: CascadeStep[] = [
      { step: 5, name: "Use Cases", status: "FAIL", detail: "Missing", questions: ["q1"] },
      { step: 1, name: "Spec", status: "PASS", detail: "OK", questions: [] },
      { step: 2, name: "Diagrams", status: "PASS", detail: "OK", questions: [] },
      { step: 3, name: "Constitution", status: "PASS", detail: "OK", questions: [] },
      { step: 4, name: "ADRs", status: "PASS", detail: "OK", questions: [] },
    ];
    const text = buildGuidedRemediation(steps);
    expect(text).toContain("Answer these questions");
    expect(text).toContain("check the cascade again");
  });

  it("uses correct artifact path for each step number", () => {
    const stepArtifacts: [number, string][] = [
      [1, "docs/PRD.md"],
      [2, "docs/diagrams/c4-context.md"],
      [3, "CLAUDE.md"],
      [4, "docs/adrs/ADR-0001.md"],
      [5, "docs/use-cases.md"],
    ];
    for (const [stepNum, artifact] of stepArtifacts) {
      const steps: CascadeStep[] = [
        { step: stepNum, name: `Step ${stepNum}`, status: "FAIL", detail: "Missing", questions: [] },
      ];
      const text = buildGuidedRemediation(steps);
      expect(text).toContain(artifact);
    }
  });
});

// ── runCascadeChecks ──────────────────────────────────────────────────

describe("runCascadeChecks", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = makeTempDir(); });
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

  it("returns exactly 5 steps", () => {
    const steps = runCascadeChecks(tempDir);
    expect(steps).toHaveLength(5);
  });

  it("returns steps numbered 1 through 5 in order", () => {
    const steps = runCascadeChecks(tempDir);
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
  });

  it("every step has a questions array", () => {
    const steps = runCascadeChecks(tempDir);
    for (const step of steps) {
      expect(Array.isArray(step.questions)).toBe(true);
    }
  });

  it("failing steps carry specific questions", () => {
    const steps = runCascadeChecks(tempDir);
    const spec = steps.find((s) => s.step === 1)!;
    expect(spec.status).toBe("FAIL");
    expect(spec.questions.length).toBeGreaterThan(0);
    expect(spec.questions[0]).toContain("problem");
  });
});
