/**
 * Tests for the refresh_project tool handler.
 *
 * Tests cover: missing-config fast path, dry analysis (apply=false),
 * applying changes (apply=true), tag additions, tag removals, and
 * tier override preservation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dump as yamlDump } from "js-yaml";
import { refreshProjectHandler } from "../../src/tools/refresh-project.js";
import { pullRegistryGates } from "../../src/tools/registry-refresh.js";

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

    it("CLAUDE.md contains navigation pointer to .claude/index.md", async () => {
      writeForgecraftYaml(tempDir, ["UNIVERSAL"]);
      await refreshProjectHandler({
        project_dir: tempDir,
        apply: true,
        output_targets: ["claude"],
      });
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      // Wayfinding is now in .claude/index.md; CLAUDE.md is the 3-line CNT root
      expect(content).toContain(".claude/index.md");
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

// ── Registry gate sync ────────────────────────────────────────────────────

/** Minimal valid RemoteGate shape for test fixtures. */
function makeRemoteGate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "test-gate",
    title: "Test Gate",
    description: "A test gate",
    category: "security",
    gsProperty: "defended",
    phase: "development",
    hook: "pre-commit",
    check: "ensure no hardcoded secrets exist in source files",
    passCriterion: "No secrets detected",
    status: "approved",
    ...overrides,
  };
}

/** Minimal valid RemoteGatesIndex for test fixtures. */
function makeIndex(gates: Record<string, unknown>[]): Record<string, unknown> {
  return {
    generatedAt: "2024-01-01T00:00:00.000Z",
    version: "1",
    gateCount: gates.length,
    tags: [],
    gates,
  };
}

describe("pullRegistryGates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forgecraft-registry-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("handles_network_failure_gracefully — fetch throws → gatesAdded: 0, no files written", async () => {
    vi.mocked(fetch).mockRejectedValue(
      new Error("ECONNREFUSED: connection refused"),
    );

    const result = await pullRegistryGates(tempDir, ["API"]);

    expect(result.gatesAdded).toBe(0);
    expect(result.gatesUpdated).toBe(0);
    expect(result.projectGatesRetired).toBe(0);
    expect(result.retiredGateIds).toHaveLength(0);
    expect(existsSync(join(tempDir, ".forgecraft", "gates", "registry"))).toBe(
      false,
    );
  });

  it("writes_registry_gates_to_correct_folders — 2 gates with different tags → separate subdirs", async () => {
    const index = makeIndex([
      makeRemoteGate({
        id: "api-gate-1",
        tags: ["API"],
        category: "api-contract",
      }),
      makeRemoteGate({ id: "cli-gate-1", tags: ["CLI"], category: "cli-ux" }),
    ]);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => index,
    } as Response);

    const result = await pullRegistryGates(tempDir, ["API", "CLI"]);

    expect(result.gatesAdded).toBe(2);
    expect(result.gatesUpdated).toBe(0);
    expect(
      existsSync(
        join(
          tempDir,
          ".forgecraft",
          "gates",
          "registry",
          "api",
          "api-gate-1.yaml",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          tempDir,
          ".forgecraft",
          "gates",
          "registry",
          "cli",
          "cli-gate-1.yaml",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(tempDir, ".forgecraft", "gates", "registry", "last-updated"),
      ),
    ).toBe(true);
  });

  it("retires_superseded_active_gate — matching domain+phase+check → gate moved to retired/", async () => {
    const checkText = "ensure no hardcoded secrets exist in source files";

    // Write a minimal valid active project gate
    const activeGatePath = join(
      tempDir,
      ".forgecraft",
      "gates",
      "project",
      "active",
    );
    mkdirSync(activeGatePath, { recursive: true });
    const activeGate = {
      id: "my-secrets-gate",
      title: "No Hardcoded Secrets",
      description: "Prevent secrets in source",
      domain: "security",
      implementation: "logic",
      gsProperty: "defended",
      phase: "development",
      hook: "pre-commit",
      os: "cross-platform",
      check: checkText,
      passCriterion: "No secrets found",
      status: "ready",
      source: "project",
      addedAt: "2024-01-01T00:00:00.000Z",
    };
    writeFileSync(
      join(activeGatePath, "my-secrets-gate.yaml"),
      yamlDump(activeGate),
      "utf-8",
    );

    const index = makeIndex([
      makeRemoteGate({
        id: "registry-secrets-gate",
        category: "security", // matches activeGate.domain
        phase: "development", // matches activeGate.phase
        check: checkText, // matches first 50 chars
        tags: ["API"],
      }),
    ]);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => index,
    } as Response);

    const result = await pullRegistryGates(tempDir, ["API"]);

    expect(result.projectGatesRetired).toBe(1);
    expect(result.retiredGateIds).toContain("my-secrets-gate");
    expect(existsSync(join(activeGatePath, "my-secrets-gate.yaml"))).toBe(
      false,
    );
    expect(
      existsSync(
        join(
          tempDir,
          ".forgecraft",
          "gates",
          "project",
          "retired",
          "my-secrets-gate.yaml",
        ),
      ),
    ).toBe(true);
  });

  it("skips_non_matching_tags — project has [API], gate has [CLI] only → gate not downloaded", async () => {
    const index = makeIndex([
      makeRemoteGate({
        id: "cli-only-gate",
        tags: ["CLI"],
        category: "cli-ux",
      }),
    ]);

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => index,
    } as Response);

    const result = await pullRegistryGates(tempDir, ["API"]);

    expect(result.gatesAdded).toBe(0);
    expect(
      existsSync(
        join(
          tempDir,
          ".forgecraft",
          "gates",
          "registry",
          "cli",
          "cli-only-gate.yaml",
        ),
      ),
    ).toBe(false);
  });
});
