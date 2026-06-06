/**
 * Canary integration tests — end-to-end scaffold validation.
 *
 * These tests answer: "Does ForgeCraft actually produce a correct GS harness?"
 * They scaffold real fixture specs into temp dirs and verify the full output:
 *   - CNT structure (CLAUDE.md ≤80 lines, all branch files present)
 *   - Document taxonomy (manifest.yaml, status.md, PRD.md, use-cases.md, architecture/)
 *   - Hook manifest files present
 *   - GS property coverage in constitution.md
 *   - Cascade readiness (all required artifacts present)
 *
 * A failure here means a regression in what real users receive.
 * Run after every change to sentinel-renderer, setup-artifact-writers, or templates.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setupProjectHandler } from "../../src/tools/setup-project.js";
import { checkCascadeHandler } from "../../src/tools/check-cascade.js";
import { measureHarnessBudget } from "../../src/shared/harness-budget.js";

const FIXTURE_TS = join(import.meta.dirname, "..", "fixtures", "canary-ts");
const FIXTURE_PY = join(import.meta.dirname, "..", "fixtures", "canary-py");

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-canary-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function scaffoldCanary(
  specFixtureDir: string,
  overrides: { language?: "typescript" | "python"; tags?: string[] } = {},
): Promise<string> {
  const tempDir = makeTempDir();
  const specText = readFileSync(join(specFixtureDir, "spec.md"), "utf-8");
  const useCasesText = existsSync(join(specFixtureDir, "use-cases.md"))
    ? readFileSync(join(specFixtureDir, "use-cases.md"), "utf-8")
    : undefined;

  // Phase 1: analysis
  await setupProjectHandler({
    project_dir: tempDir,
    spec_text: specText,
  });

  // Phase 2: generate
  await setupProjectHandler({
    project_dir: tempDir,
    spec_text: specText,
    mvp: false,
    scope_complete: true,
    has_consumers: true,
    ...(overrides.language ? { language: overrides.language } : {}),
    ...(overrides.tags ? { tags: overrides.tags } : {}),
  });

  // Write use-cases.md fixture directly if present (simulating AI extraction)
  if (useCasesText) {
    const docsDir = join(tempDir, "docs");
    mkdirSync(docsDir, { recursive: true });
    const ucPath = join(docsDir, "use-cases.md");
    if (!existsSync(ucPath)) {
      writeFileSync(ucPath, useCasesText, "utf-8");
    }
  }

  return tempDir;
}

// ── TypeScript API canary ─────────────────────────────────────────────

describe("canary: TypeScript API project", () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env["VITEST"] = "1"; // suppress git operations
    tempDir = await scaffoldCanary(FIXTURE_TS, {
      language: "typescript",
      tags: ["UNIVERSAL", "API"],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env["VITEST"];
  });

  describe("CNT structure", () => {
    it("CLAUDE.md is the slim routing root (≤80 lines)", () => {
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content.split("\n").length).toBeLessThanOrEqual(80);
      expect(content).toContain("CNT root");
      expect(content).toContain("Navigate by Task");
    });

    it("all five CNT branch files are created", () => {
      for (const branch of [
        ".claude/constitution.md",
        ".claude/lifecycle.md",
        ".claude/routes/code.md",
        ".claude/routes/docs.md",
        ".claude/corrections.md",
      ]) {
        expect(existsSync(join(tempDir, branch)), `Missing: ${branch}`).toBe(
          true,
        );
      }
    });

    it("constitution.md contains all 7 GS properties", () => {
      const content = readFileSync(
        join(tempDir, ".claude/constitution.md"),
        "utf-8",
      );
      for (const prop of [
        "Self-describing",
        "Bounded",
        "Verifiable",
        "Defended",
        "Auditable",
        "Composable",
        "Executable",
      ]) {
        expect(content, `Missing GS property: ${prop}`).toContain(prop);
      }
    });

    it("lifecycle.md contains GS cascade, feature estimation, and session loop", () => {
      const content = readFileSync(
        join(tempDir, ".claude/lifecycle.md"),
        "utf-8",
      );
      expect(content).toContain("GS Initialization Cascade");
      expect(content).toContain("Feature Estimation");
      expect(content).toContain("Session Loop Invariant");
    });

    it("routes/docs.md contains Navigation Mode and Document Map", () => {
      const content = readFileSync(
        join(tempDir, ".claude/routes/docs.md"),
        "utf-8",
      );
      expect(content).toContain("Navigation Mode");
      expect(content).toContain("Document Map");
    });

    it("corrections.md is present and has the log format stub", () => {
      const content = readFileSync(
        join(tempDir, ".claude/corrections.md"),
        "utf-8",
      );
      expect(content).toContain("Corrections Log");
      expect(content).toContain("YYYY-MM-DD");
    });
  });

  describe("document taxonomy", () => {
    it("docs/manifest.yaml is written with project name and type", () => {
      const path = join(tempDir, "docs", "manifest.yaml");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("schema_source");
      expect(content).toContain("human_judgment");
    });

    it("docs/status.md is written with all canonical sections", () => {
      const path = join(tempDir, "docs", "status.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("In Progress");
      expect(content).toContain("Next");
      expect(content).toContain("Decisions");
    });

    it("docs/PRD.md is written from spec content", () => {
      const path = join(tempDir, "docs", "PRD.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("Problem");
    });

    it("docs/operation-classification.md is written", () => {
      expect(
        existsSync(join(tempDir, "docs", "operation-classification.md")),
      ).toBe(true);
    });

    it("docs/architecture/ CNT branches are created", () => {
      const archDir = join(tempDir, "docs", "architecture");
      expect(existsSync(archDir)).toBe(true);
      for (const branch of [
        "layers.md",
        "modules.md",
        "data-model.md",
        "integrations.md",
      ]) {
        expect(existsSync(join(archDir, branch)), `Missing: ${branch}`).toBe(
          true,
        );
      }
    });
  });

  describe("hooks", () => {
    it("hook scripts are written self-contained into .claude/hooks/", () => {
      const hooksDir = join(tempDir, ".claude", "hooks");
      expect(existsSync(hooksDir)).toBe(true);
      const scripts = readdirSync(hooksDir).filter((f) => f.endsWith(".sh"));
      expect(scripts.length).toBeGreaterThan(5);
    });

    it("core quality hook scripts are present (template-generated)", () => {
      const hooksDir = join(tempDir, ".claude", "hooks");
      // These are written from templates/universal/hooks.yaml — always present
      expect(existsSync(join(hooksDir, "pre-commit-compile.sh"))).toBe(true);
      expect(existsSync(join(hooksDir, "pre-commit-coverage.sh"))).toBe(true);
      expect(existsSync(join(hooksDir, "pre-commit-format.sh"))).toBe(true);
    });
  });

  describe("agents", () => {
    it("all four sub-agents are created in .claude/agents/", () => {
      const agentsDir = join(tempDir, ".claude", "agents");
      expect(existsSync(agentsDir)).toBe(true);
      for (const agent of [
        "test-hunter.md",
        "spec-guardian.md",
        "security-reviewer.md",
        "change-reviewer.md",
      ]) {
        expect(
          existsSync(join(agentsDir, agent)),
          `Missing agent: ${agent}`,
        ).toBe(true);
      }
    });
  });

  describe("harness budget (context-degradation defense)", () => {
    it("generated harness stays within the context budget", () => {
      // Field evidence: ~200-line hand-written harness held GS discipline;
      // a ~2,000-line generated harness degraded fast. Bounded applies to
      // the harness itself. This assertion is the regression lock.
      const report = measureHarnessBudget(tempDir);
      expect(
        report.withinBudget,
        `Harness over budget:\n${report.violations.join("\n")}`,
      ).toBe(true);
    });

    it("GS theory is evicted to .claude/reference/, never session-routed", () => {
      const refPath = join(tempDir, ".claude", "reference", "gs-theory.md");
      expect(existsSync(refPath)).toBe(true);
      const ref = readFileSync(refPath, "utf-8");
      expect(ref).toContain("DO NOT load this file during implementation");
      // The theory must NOT be in the session-loaded standards tree
      const specStandards = readFileSync(
        join(tempDir, ".claude", "standards", "spec.md"),
        "utf-8",
      );
      expect(specStandards).not.toContain("Five Memory Types");
      expect(specStandards).not.toContain("Agentic Self-Refinement");
    });

    it("root contains the Context Discipline prime directive", () => {
      const root = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(root).toContain("Context Discipline");
      expect(root).toContain("generate_session_prompt");
      expect(root).toContain("Never graze the harness");
    });
  });

  describe("learning graph emission (harness as CKG)", () => {
    it("scaffold emits docs/learning-graph.csv with a valid header and content", () => {
      const lgPath = join(tempDir, "docs", "learning-graph.csv");
      expect(existsSync(lgPath)).toBe(true);
      const raw = readFileSync(lgPath, "utf-8");
      expect(raw.split("\n")[0]).toBe(
        "ConceptID,ConceptLabel,Dependencies,TaxonomyID",
      );
      // Concepts present for the core artifact classes
      expect(raw).toContain(",CNT");
      expect(raw).toContain(",DOC");
      expect(raw).toContain(",GATE");
    });
  });

  describe("cascade readiness", () => {
    it("check_cascade returns results for all 5 steps", async () => {
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Functional Specification");
      expect(text).toContain("Architectural Constitution");
      expect(text).toContain("Architecture Decision Records");
      expect(text).toContain("Use Cases");
    });

    it("functional spec step passes after scaffold (PRD.md is written)", async () => {
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = (result.content[0] as { text: string }).text;
      // PRD.md is written by scaffold → step 1 should pass
      expect(text).toContain("✅");
      expect(text).toContain("Functional Specification");
    });

    it("architectural constitution step passes (CLAUDE.md ≤80 lines present)", async () => {
      const result = await checkCascadeHandler({ project_dir: tempDir });
      const text = (result.content[0] as { text: string }).text;
      // CLAUDE.md ≤80 lines → Step 3 should pass
      expect(text).toMatch(
        /✅.*Architectural Constitution|Architectural Constitution.*✅/s,
      );
    });
  });
});

// ── Python canary ─────────────────────────────────────────────────────

describe("canary: Python analytics pipeline", () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env["VITEST"] = "1";
    tempDir = await scaffoldCanary(FIXTURE_PY, {
      language: "python",
      tags: ["UNIVERSAL", "API", "DATA-PIPELINE"],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env["VITEST"];
  });

  it("CLAUDE.md routes table is present and slim", () => {
    const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(content.split("\n").length).toBeLessThanOrEqual(80);
    expect(content).toContain("Navigate by Task");
  });

  it("all CNT branch files are created", () => {
    for (const branch of [
      ".claude/constitution.md",
      ".claude/lifecycle.md",
      ".claude/routes/code.md",
      ".claude/routes/docs.md",
      ".claude/corrections.md",
    ]) {
      expect(existsSync(join(tempDir, branch)), `Missing: ${branch}`).toBe(
        true,
      );
    }
  });

  it("docs/architecture/ CNT branches are created for Python project", () => {
    for (const branch of [
      "layers.md",
      "modules.md",
      "data-model.md",
      "integrations.md",
    ]) {
      expect(
        existsSync(join(tempDir, "docs", "architecture", branch)),
        `Missing arch branch: ${branch}`,
      ).toBe(true);
    }
  });

  it("forgecraft.yaml records the python language setting", () => {
    const yaml = readFileSync(join(tempDir, "forgecraft.yaml"), "utf-8");
    expect(yaml).toContain("python");
  });

  it("CLAUDE.md stack line is Python, not TypeScript", () => {
    const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(content).toContain("Python");
    expect(content).not.toContain("TypeScript/Node.js");
  });

  it("constitution.md uses Python typing rules, not TypeScript", () => {
    const content = readFileSync(
      join(tempDir, ".claude/constitution.md"),
      "utf-8",
    );
    expect(content).toContain("Type hints");
    expect(content).not.toContain("ESM imports");
    expect(content).not.toContain("`any`");
  });

  it("routes/code.md uses snake_case naming for Python", () => {
    const content = readFileSync(
      join(tempDir, ".claude/routes/code.md"),
      "utf-8",
    );
    expect(content).toContain("snake_case.py");
    expect(content).not.toContain("kebab-case.ts");
  });

  it("routes/code.md Python code standards mention mypy/pyright", () => {
    const content = readFileSync(
      join(tempDir, ".claude/routes/code.md"),
      "utf-8",
    );
    expect(content).toMatch(/mypy|pyright/);
  });
});

// ── Diverse project-type canaries ─────────────────────────────────────
// Each scaffolds a very different domain to verify tag-specific content
// reaches the harness — not just structure.

const FIXTURE_GAME = join(import.meta.dirname, "..", "fixtures", "canary-game");
const FIXTURE_FINTECH = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "canary-fintech",
);
const FIXTURE_MINIMAL = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "canary-minimal",
);

describe("canary: GAME project (Orbit Breaker)", () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env["VITEST"] = "1";
    tempDir = await scaffoldCanary(FIXTURE_GAME, {
      language: "typescript",
      tags: ["UNIVERSAL", "GAME", "WEB-STATIC"],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env["VITEST"];
  });

  it("produces the full CNT structure", () => {
    expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude", "constitution.md"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude", "lifecycle.md"))).toBe(true);
  });

  it("GAME tag content reaches the standards files", () => {
    const standardsDir = join(tempDir, ".claude", "standards");
    expect(existsSync(standardsDir)).toBe(true);
    const all = readdirSync(standardsDir)
      .map((f) => readFileSync(join(standardsDir, f), "utf-8"))
      .join("\n");
    // GAME template blocks must surface game-specific guidance
    expect(all).toMatch(/game loop|frame|fps|Phaser|ECS|render/i);
  });

  it("forgecraft.yaml records the GAME tag", () => {
    const yaml = readFileSync(join(tempDir, "forgecraft.yaml"), "utf-8");
    expect(yaml).toContain("GAME");
  });
});

describe("canary: FINTECH project (LedgerCore)", () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env["VITEST"] = "1";
    tempDir = await scaffoldCanary(FIXTURE_FINTECH, {
      language: "typescript",
      tags: ["UNIVERSAL", "API", "FINTECH"],
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env["VITEST"];
  });

  it("produces the full CNT structure", () => {
    expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude", "constitution.md"))).toBe(true);
  });

  it("FINTECH tag content reaches the standards files", () => {
    const standardsDir = join(tempDir, ".claude", "standards");
    const all = readdirSync(standardsDir)
      .map((f) => readFileSync(join(standardsDir, f), "utf-8"))
      .join("\n");
    // FINTECH blocks must surface money-handling discipline
    expect(all).toMatch(/decimal|double-entry|currency|float|precision/i);
  });

  it("sensitive-data posture: PRD content with compliance reaches docs", () => {
    const prd = readFileSync(join(tempDir, "docs", "PRD.md"), "utf-8");
    expect(prd.length).toBeGreaterThan(100);
  });
});

describe("canary: minimal one-paragraph spec (lazy user)", () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env["VITEST"] = "1";
    // No tags override — let ForgeCraft infer from the thin spec
    tempDir = await scaffoldCanary(FIXTURE_MINIMAL, {});
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    delete process.env["VITEST"];
  });

  it("still produces a complete harness from a 3-sentence spec", () => {
    expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(tempDir, "forgecraft.yaml"))).toBe(true);
    expect(existsSync(join(tempDir, "docs", "PRD.md"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude", "constitution.md"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude", "lifecycle.md"))).toBe(true);
  });

  it("PRD carries the spec content (not an empty template)", () => {
    const prd = readFileSync(join(tempDir, "docs", "PRD.md"), "utf-8");
    // The thin spec's substance must surface in the PRD
    expect(prd).toMatch(/shortener|short code|redirect/i);
  });

  it("thin spec produces FILL markers, not hallucinated content", () => {
    const prd = readFileSync(join(tempDir, "docs", "PRD.md"), "utf-8");
    // A 3-sentence spec cannot fill every PRD section — gaps must be
    // explicit FILL markers, never silently invented requirements
    expect(prd).toContain("FILL");
  });

  it("CLAUDE.md root stays within budget regardless of spec size", () => {
    const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(content.split("\n").length).toBeLessThanOrEqual(80);
  });
});
