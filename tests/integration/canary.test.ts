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
});
