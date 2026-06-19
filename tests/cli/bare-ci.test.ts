/**
 * Tests for the CI/bare gate CLI commands:
 *   cmdCheckCascade, cmdViolations, cmdStatus, printResult (--json flag)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cmdCheckCascade,
  cmdViolations,
  cmdCheckSentinelCopies,
  cmdStatus,
  printResult,
} from "../../src/cli/commands.js";
import { loadAllTemplatesWithExtras } from "../../src/registry/loader.js";
import { composeTemplates } from "../../src/registry/composer.js";
import { detectProjectContext } from "../../src/analyzers/project-context.js";
import { detectLanguage } from "../../src/analyzers/language-detector.js";
import { inferProjectName } from "../../src/tools/refresh-analyzer.js";
import {
  renderCanonicalSentinel,
  projectSentinel,
} from "../../src/registry/sentinel-projection.js";
import {
  buildPlaceholderContext,
  resolveTemplatePlaceholders,
} from "../../src/shared/template-resolver.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `bare-ci-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeViolations(dir: string, lines: string[]): void {
  mkdirSync(join(dir, ".forgecraft"), { recursive: true });
  writeFileSync(
    join(dir, ".forgecraft", "gate-violations.jsonl"),
    lines.join("\n") + "\n",
    "utf-8",
  );
}

// ── printResult --json ────────────────────────────────────────────────

describe("printResult", () => {
  it("prints raw text by default", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printResult({ content: [{ type: "text", text: "hello" }] });
    expect(spy).toHaveBeenCalledWith("hello");
    spy.mockRestore();
  });

  it("prints JSON when json=true", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printResult({ content: [{ type: "text", text: "hello" }] }, true);
    const arg = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(arg) as { ok: boolean; output: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.output).toBe("hello");
    spy.mockRestore();
  });

  it("prints empty string when content array is empty", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printResult({ content: [] });
    expect(spy).toHaveBeenCalledWith("");
    spy.mockRestore();
  });
});

// ── cmdCheckCascade ───────────────────────────────────────────────────

describe("cmdCheckCascade", () => {
  let tempDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error(`process.exit(${_code})`);
    });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exits 1 when cascade steps fail (empty project dir)", async () => {
    await expect(cmdCheckCascade([tempDir], {})).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("outputs step names in text mode", async () => {
    await expect(cmdCheckCascade([tempDir], {})).rejects.toThrow(
      "process.exit(1)",
    );
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Functional Specification");
  });

  it("outputs valid JSON when --json flag is set", async () => {
    await expect(cmdCheckCascade([tempDir], { json: true })).rejects.toThrow(
      "process.exit(1)",
    );
    const jsonOutput = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(jsonOutput) as {
      ok: boolean;
      passing: number;
      total: number;
      failedSteps: unknown[];
    };
    expect(parsed.ok).toBe(false);
    expect(typeof parsed.passing).toBe("number");
    expect(Array.isArray(parsed.failedSteps)).toBe(true);
    expect(parsed.failedSteps.length).toBeGreaterThan(0);
  });
});

// ── cmdViolations ─────────────────────────────────────────────────────

describe("cmdViolations", () => {
  let tempDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error(`process.exit(${_code})`);
    });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exits 0 when no violations file exists", async () => {
    await cmdViolations([tempDir], {});
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits 1 when active violations exist", async () => {
    writeViolations(tempDir, [
      JSON.stringify({
        hook: "pre-commit-compile",
        severity: "error",
        message: "TypeScript failed",
        timestamp: new Date().toISOString(),
      }),
    ]);
    await expect(cmdViolations([tempDir], {})).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("outputs JSON with ok:false when active violations exist", async () => {
    writeViolations(tempDir, [
      JSON.stringify({
        hook: "pre-commit-secrets",
        severity: "error",
        message: "Secrets detected",
        timestamp: new Date().toISOString(),
      }),
    ]);
    await expect(cmdViolations([tempDir], { json: true })).rejects.toThrow(
      "process.exit(1)",
    );
    const jsonOutput = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(jsonOutput) as {
      ok: boolean;
      active: unknown[];
      stale: unknown[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.active).toHaveLength(1);
    expect(parsed.stale).toHaveLength(0);
  });

  it("outputs JSON with ok:true when no violations", async () => {
    await cmdViolations([tempDir], { json: true });
    const jsonOutput = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(jsonOutput) as { ok: boolean };
    expect(parsed.ok).toBe(true);
  });

  it("includes hook name in text output", async () => {
    writeViolations(tempDir, [
      JSON.stringify({
        hook: "pre-commit-coverage",
        severity: "error",
        message: "Coverage failed",
        timestamp: new Date().toISOString(),
      }),
    ]);
    await expect(cmdViolations([tempDir], {})).rejects.toThrow(
      "process.exit(1)",
    );
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("pre-commit-coverage");
  });
});

// ── cmdCheckSentinelCopies ────────────────────────────────────────────

/** Write the byte-identical AGENTS.md the evaluator expects for a temp dir. */
function writeInSyncAgentsMd(dir: string): void {
  const tags = ["UNIVERSAL"] as Parameters<typeof composeTemplates>[0];
  const composed = composeTemplates(
    tags,
    loadAllTemplatesWithExtras(undefined, undefined),
    {},
  );
  const context = detectProjectContext(
    dir,
    inferProjectName(dir),
    detectLanguage(dir),
    tags,
  );
  const body = renderCanonicalSentinel(composed.instructionBlocks, context);
  const projected = projectSentinel("agents-md", body, context)!;
  const placeholderContext = buildPlaceholderContext(
    dir,
    undefined,
    tags.map(String),
  );
  writeFileSync(
    join(dir, "AGENTS.md"),
    resolveTemplatePlaceholders(projected, placeholderContext),
    "utf-8",
  );
}

describe("cmdCheckSentinelCopies", () => {
  let tempDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error(`process.exit(${_code})`);
    });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exits 0 when copies are in sync with the canonical body", async () => {
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      "tags:\n  - UNIVERSAL\n",
      "utf-8",
    );
    writeInSyncAgentsMd(tempDir);
    await cmdCheckSentinelCopies([tempDir], {});
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits 1 when a copy has drifted", async () => {
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      "tags:\n  - UNIVERSAL\n",
      "utf-8",
    );
    writeFileSync(join(tempDir, "AGENTS.md"), "# AGENTS.md\nstale\n", "utf-8");
    await expect(cmdCheckSentinelCopies([tempDir], {})).rejects.toThrow(
      "process.exit(1)",
    );
  });

  it("outputs JSON with ok:false and drift detail on drift", async () => {
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      "tags:\n  - UNIVERSAL\n",
      "utf-8",
    );
    writeFileSync(join(tempDir, "AGENTS.md"), "# AGENTS.md\nstale\n", "utf-8");
    await expect(
      cmdCheckSentinelCopies([tempDir], { json: true }),
    ).rejects.toThrow("process.exit(1)");
    const jsonOutput = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(jsonOutput) as {
      ok: boolean;
      status: string;
      drifted: Array<{ target: string; reason: string }>;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe("drift");
    expect(parsed.drifted[0]?.target).toBe("agents-md");
    expect(parsed.drifted[0]?.reason).toBe("content-drift");
  });

  it("outputs JSON with ok:true when in sync", async () => {
    writeFileSync(
      join(tempDir, "forgecraft.yaml"),
      "tags:\n  - UNIVERSAL\n",
      "utf-8",
    );
    writeInSyncAgentsMd(tempDir);
    await cmdCheckSentinelCopies([tempDir], { json: true });
    const jsonOutput = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(jsonOutput) as { ok: boolean; status: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("green");
  });
});

// ── cmdStatus ─────────────────────────────────────────────────────────

describe("cmdStatus", () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = makeTempDir();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("never calls process.exit", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code) => {
      throw new Error(`process.exit(${_code})`);
    });
    await cmdStatus([tempDir], {});
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("prints Project Status Snapshot header", async () => {
    await cmdStatus([tempDir], {});
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Project Status Snapshot");
  });

  it("outputs JSON with ok:true when --json flag is set", async () => {
    await cmdStatus([tempDir], { json: true });
    const jsonOutput = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(jsonOutput) as { ok: boolean; output: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.output).toContain("Project Status Snapshot");
  });
});
