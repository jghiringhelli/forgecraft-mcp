/**
 * LLM-pipeline disciplines for the ML/AI tag (ADR-0012 §6f).
 *
 * When the system is built ON an LLM (extraction/scoring/generation), the
 * harness around the stochastic model must itself be deterministic. These
 * disciplines must reach an ML project's standards/ml.md, and the audit-RUN
 * multi-run gate must ship in the registry.
 */

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldProjectHandler } from "../../src/tools/scaffold.js";

const REGISTRY_ML = join(
  import.meta.dirname,
  "..",
  "..",
  ".forgecraft",
  "gates",
  "registry",
  "ml",
);

describe("ML tag — LLM-pipeline disciplines reach standards/ml.md", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("emits the six LLM-pipeline disciplines into the ml domain file", async () => {
    tempDir = join(tmpdir(), `fc-ml-llm-${Date.now()}`);
    await scaffoldProjectHandler({
      project_dir: tempDir,
      project_name: "LlmPipeline",
      tags: ["UNIVERSAL", "ML"],
      language: "python",
      force: false,
      sentinel: true,
      dry_run: false,
      output_targets: ["claude"],
    });

    const mlPath = join(tempDir, ".claude", "standards", "ml.md");
    expect(
      existsSync(mlPath),
      "standards/ml.md should exist for an ML project",
    ).toBe(true);
    const ml = readFileSync(mlPath, "utf-8");

    // The six disciplines (§6f) — assert each is present, not just the heading.
    expect(ml).toContain("LLM-Pipeline Disciplines");
    expect(ml).toMatch(/Separate extraction from scoring/i);
    expect(ml).toMatch(/temperature 0/i);
    expect(ml).toMatch(/Structural rescue/i);
    expect(ml).toMatch(/double-count/i);
    expect(ml).toMatch(/Evidence strength.*not model confidence/is);
    expect(ml).toMatch(/audit-RUN/i);
    // No unrendered Liquid placeholder leaked into the domain file.
    expect(ml).not.toContain("{{");
  });
});

describe("ML registry gates", () => {
  it("ships the stochastic-uc-run-distribution audit-RUN gate", () => {
    const files = readdirSync(REGISTRY_ML);
    expect(files).toContain("stochastic-uc-run-distribution.yaml");
    const body = readFileSync(
      join(REGISTRY_ML, "stochastic-uc-run-distribution.yaml"),
      "utf-8",
    );
    expect(body).toContain("id: stochastic-uc-run-distribution");
    expect(body).toMatch(/pass-rate/i);
    expect(body).toMatch(/audit-RUN/i);
  });

  it("keeps the llm-output-replay-fixture gate alongside it", () => {
    expect(readdirSync(REGISTRY_ML)).toContain(
      "llm-output-replay-fixture.yaml",
    );
  });
});
