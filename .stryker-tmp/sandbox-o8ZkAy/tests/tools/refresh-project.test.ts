/**
 * Tests for the refresh_project tool handler.
 *
 * Tests cover: missing-config fast path, dry analysis (apply=false),
 * applying changes (apply=true), tag additions, tag removals, and
 * tier override preservation.
 */
// @ts-nocheck


import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { refreshProjectHandler } from "../../src/tools/refresh-project.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `forgecraft-refresh-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a minimal forgecraft.yaml to the project directory. */
function writeForgecraftYaml(
  dir: string,
  tags: string[],
  extras: Record<string, unknown> = {},
): void {
  const tagYaml = tags.map((t) => `  - ${t}`).join("\n");
  const extraLines = Object.entries(extras)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  writeFileSync(
    join(dir, "forgecraft.yaml"),
    `tags:\n${tagYaml}\n${extraLines}\n`,
    "utf-8",
  );
}

describe("refreshProjectHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── missing config ────────────────────────────────────────────────

  describe("missing forgecraft.yaml", () => {
    it("returns an error message when no forgecraft.yaml exists", async () => {
      const result = await refreshProjectHandler({
        project_dir: tempDir,
        apply: false,
      });
      const text = result.content[0]!.text;
      expect(text).toContain("forgecraft.yaml");
    });

    it("does not create any files when no config exists", async () => {
      await refreshProjectHandler({ project_dir: tempDir, apply: false });
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(false);
    });
  });

  // ── dry analysis (apply=false) ────────────────────────────────────

  describe("apply=false (drift report)", () => {
    it("returns drift analysis without writing instruction files", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      const result = await refreshProjectHandler({
        project_dir: tempDir,
        apply: false,
      });
      expect(result.content[0]!.text.length).toBeGreaterThan(50);
      // CLAUDE.md should NOT be written when apply=false
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(false);
    });

    it("response text includes current tags", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL", "API"]);
      const result = await refreshProjectHandler({
        project_dir: tempDir,
        apply: false,
      });
      expect(result.content[0]!.text).toContain("API");
      expect(result.content[0]!.text).toContain("UNIVERSAL");
    });

    it("response text mentions add_tags override", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      const result = await refreshProjectHandler({
        project_dir: tempDir,
        apply: false,
        add_tags: ["CLI"],
      });
      expect(result.content[0]!.text).toContain("CLI");
    });
  });

  // ── apply=true ────────────────────────────────────────────────────

  describe("apply=true (write changes)", () => {
    it("writes CLAUDE.md when apply=true", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    });

    it("updates forgecraft.yaml when add_tags specified and apply=true", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        add_tags: ["CLI"],
        output_targets: ["claude"],
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).toContain("CLI");
    });

    it("removes tags when remove_tags specified and apply=true", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL", "API"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        remove_tags: ["API"],
        output_targets: ["claude"],
      });
      // API should not remain after removal (forgecraft.yaml updated)
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).not.toContain("- API");
    });

    it("response text lists files written", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      const result = await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      expect(result.content[0]!.text).toMatch(/CLAUDE\.md/i);
    });

    it("respects tier override in apply mode", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"], { tier: '"recommended"' });
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        tier: "core",
        output_targets: ["claude"],
      });
      const yamlContent = readFileSync(
        join(tempDir, "forgecraft.yaml"),
        "utf-8",
      );
      expect(yamlContent).toContain("core");
    });
  });

  // ── sentinel mode ─────────────────────────────────────────────────

  describe("sentinel mode (apply=true, sentinel default)", () => {
    it("writes a short CLAUDE.md when sentinel mode is active", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      const lineCount = content.split("\n").length;
      expect(lineCount).toBeLessThan(100);
    });

    it("CLAUDE.md contains the ForgeCraft sentinel comment", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("ForgeCraft sentinel");
    });

    it("writes domain standards files into .claude/standards/", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      expect(existsSync(join(tempDir, ".claude", "standards"))).toBe(true);
      const architectureFile = join(
        tempDir,
        ".claude",
        "standards",
        "architecture.md",
      );
      expect(existsSync(architectureFile)).toBe(true);
    });

    it("replaces a large monolithic CLAUDE.md instead of appending to it", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      // Simulate a 200-line monolithic CLAUDE.md
      const monolithic = Array.from(
        { length: 200 },
        (_, i) => `Line ${i + 1} of monolithic content`,
      ).join("\n");
      writeFileSync(join(tempDir, "CLAUDE.md"), monolithic, "utf-8");

      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });

      const after = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      const lineCount = after.split("\n").length;
      // Must be sentinel-length (< 100), NOT monolithic + appended (~300)
      expect(lineCount).toBeLessThan(100);
      expect(after).toContain("ForgeCraft sentinel");
    });

    it("creates project-specific.md as a user-owned placeholder", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      const psPath = join(
        tempDir,
        ".claude",
        "standards",
        "project-specific.md",
      );
      expect(existsSync(psPath)).toBe(true);
      const content = readFileSync(psPath, "utf-8");
      expect(content).toContain("ForgeCraft will never overwrite");
    });

    it("does NOT overwrite an existing project-specific.md with user content", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      const psPath = join(
        tempDir,
        ".claude",
        "standards",
        "project-specific.md",
      );
      mkdirSync(join(tempDir, ".claude", "standards"), { recursive: true });
      writeFileSync(
        psPath,
        "# My custom rules\n- Use Prisma\n- Deploy to Railway\n",
        "utf-8",
      );

      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });

      const after = readFileSync(psPath, "utf-8");
      expect(after).toContain("Use Prisma");
      expect(after).toContain("Deploy to Railway");
    });

    it("CLAUDE.md wayfinding table links to project-specific.md", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("project-specific.md");
    });

    it("response text indicates sentinel was used and explains scaffold scope", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      const result = await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      const text = result.content[0]!.text;
      expect(text).toContain("sentinel");
      expect(text).toContain("scaffold");
    });
  });
});
