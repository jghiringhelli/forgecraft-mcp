/**
 * Tests for src/tools/run-harness.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHarnessHandler } from "../../src/tools/run-harness.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-run-harness-"));
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

const MINIMAL_USE_CASES = `# Use Cases

## UC-001: Setup Project

**Actor**: Developer
**Precondition**: forgecraft is installed
**Postcondition**: forgecraft.yaml exists

---

## UC-002: Verify Cascade

**Actor**: Developer
**Precondition**: project scaffolded
**Postcondition**: cascade shown

`;

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── runHarnessHandler ─────────────────────────────────────────────────

describe("runHarnessHandler", () => {
  it("returns a ToolResult with text content", async () => {
    tempDir = makeTempDir();
    const result = await runHarnessHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("reports 'no probes found' when tests/harness/ is absent and no UCs", async () => {
    tempDir = makeTempDir();
    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("No probe files found");
  });

  it("reports no_probe for UCs with no probe file", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    // No tests/harness/ directory

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("NO_PROBE");
    expect(text).toContain("UC-001");
    expect(text).toContain("UC-002");
  });

  it("reports PASS for a .sh probe that exits 0", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001.sh",
      `#!/usr/bin/env bash\necho "PASS"\nexit 0\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("PASS");
    expect(text).toContain("UC-001");
  });

  it("reports FAIL for a .sh probe that exits 1", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001.sh",
      `#!/usr/bin/env bash\necho "FAIL"\nexit 1\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("FAIL");
  });

  it("filters by uc_ids when provided", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, "tests/harness/uc-001.sh", `#!/usr/bin/env bash\nexit 0\n`);

    const result = await runHarnessHandler({
      project_dir: tempDir,
      uc_ids: ["UC-001"],
    });
    const text = result.content[0]!.text;
    expect(text).toContain("UC-001");
    // UC-002 should not appear in results table
    expect(text).not.toContain("UC-002");
  });

  it("writes .forgecraft/harness-run.json after execution", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);

    await runHarnessHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "harness-run.json");
    expect(existsSync(runJsonPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(runJsonPath, "utf-8")) as {
      timestamp: string;
      passed: number;
      failed: number;
      results: unknown[];
    };
    expect(typeof parsed.timestamp).toBe("string");
    expect(typeof parsed.passed).toBe("number");
    expect(typeof parsed.failed).toBe("number");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it("includes Harness Run Report header", async () => {
    tempDir = makeTempDir();
    const result = await runHarnessHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("## Harness Run Report");
  });

  it("includes Results summary line", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("### Results:");
    expect(text).toContain("passed");
    expect(text).toContain("failed");
  });

  it("handles missing docs/use-cases.md gracefully", async () => {
    tempDir = makeTempDir();
    const result = await runHarnessHandler({ project_dir: tempDir });
    expect(result.content[0]!.type).toBe("text");
    // Should not throw
  });

  it("reports NOT_IMPLEMENTED for .sh probe that outputs unimplemented text", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001.sh",
      `#!/usr/bin/env bash\necho "TODO: implement uc-001 probe"\nexit 1\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("NOT_IMPLEMENTED");
  });

  it("reports TOOL_MISSING for .hurl probe when hurl not installed", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    // Write a hurl probe — hurl likely not installed in CI
    write(
      tempDir,
      "tests/harness/uc-001.hurl",
      `GET http://localhost:9999/nonexistent\nHTTP 200\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    // Either TOOL_MISSING (hurl not found) or FAIL (connection refused) — both valid
    expect(text).toMatch(/TOOL_MISSING|FAIL/);
  });

  it("includes Tool Availability section", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const result = await runHarnessHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("### Tool Availability");
  });

  it("includes The Loop section", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const result = await runHarnessHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("### The Loop");
  });

  it("harness-run.json records pass count correctly", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, "tests/harness/uc-001.sh", `#!/usr/bin/env bash\nexit 0\n`);

    await runHarnessHandler({ project_dir: tempDir });

    const runJsonPath = join(tempDir, ".forgecraft", "harness-run.json");
    const parsed = JSON.parse(readFileSync(runJsonPath, "utf-8")) as {
      passed: number;
      notFound: number;
      results: Array<{ ucId: string; status: string }>;
    };
    expect(parsed.passed).toBe(1);
    // UC-002 has no probe so notFound = 1
    expect(parsed.notFound).toBe(1);
    const uc001Result = parsed.results.find((r) => r.ucId === "UC-001");
    expect(uc001Result?.status).toBe("pass");
  });

  it("loop section includes generate_session_prompt for failing probes", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001.sh",
      `#!/usr/bin/env bash\necho "FAIL"\nexit 1\n`,
    );
    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("generate_session_prompt");
    expect(text).toContain("run_harness again");
  });

  it("loop section includes generate_harness for no-probe UCs", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    // No probe files at all
    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("generate_harness");
  });

  it("loop section says call close_cycle when all probes pass", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, "tests/harness/uc-001.sh", `#!/usr/bin/env bash\nexit 0\n`);
    write(tempDir, "tests/harness/uc-002.sh", `#!/usr/bin/env bash\nexit 0\n`);
    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("All probes passing");
    expect(text).toContain("close_cycle");
  });
});

// ── New probe type execution ──────────────────────────────────────────

import { findProbeFiles, detectScenario } from "../../src/tools/run-harness.js";

describe("findProbeFiles", () => {
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns all probe files matching a UC id", () => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, "tests", "harness"), { recursive: true });
    writeFileSync(
      join(tempDir, "tests", "harness", "uc-001-happy.sh"),
      "# happy",
      "utf-8",
    );
    writeFileSync(
      join(tempDir, "tests", "harness", "uc-001-error-auth.sh"),
      "# error",
      "utf-8",
    );
    writeFileSync(
      join(tempDir, "tests", "harness", "uc-002-happy.sh"),
      "# other uc",
      "utf-8",
    );

    const files = findProbeFiles(join(tempDir, "tests", "harness"), "UC-001");
    expect(files).toHaveLength(2);
    expect(files).toContain("uc-001-happy.sh");
    expect(files).toContain("uc-001-error-auth.sh");
    expect(files).not.toContain("uc-002-happy.sh");
  });

  it("returns legacy probe file (uc-001.sh) as well", () => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, "tests", "harness"), { recursive: true });
    writeFileSync(
      join(tempDir, "tests", "harness", "uc-001.sh"),
      "# legacy",
      "utf-8",
    );

    const files = findProbeFiles(join(tempDir, "tests", "harness"), "UC-001");
    expect(files).toHaveLength(1);
    expect(files).toContain("uc-001.sh");
  });

  it("returns empty array when harness directory does not exist", () => {
    const files = findProbeFiles("/nonexistent/path", "UC-001");
    expect(files).toHaveLength(0);
  });
});

describe("detectScenario", () => {
  it("returns happy for files with -happy in name", () => {
    expect(detectScenario("uc-001-happy.sh")).toBe("happy");
    expect(detectScenario("uc-001-happy.hurl")).toBe("happy");
  });

  it("returns error for files with -error- in name", () => {
    expect(detectScenario("uc-001-error-auth.sh")).toBe("error");
    expect(detectScenario("uc-002-error-missing-field.hurl")).toBe("error");
  });

  it("returns unknown for legacy named files", () => {
    expect(detectScenario("uc-001.sh")).toBe("unknown");
    expect(detectScenario("uc-001.hurl")).toBe("unknown");
  });
});

describe("new probe type execution in runHarnessHandler", () => {
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("executes .db.sh probe via bash", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001-happy.db.sh",
      `#!/usr/bin/env bash\necho "SKIP: DATABASE_URL not set"\nexit 0\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("PASS");
    expect(text).toContain("UC-001");
  });

  it("reports TOOL_MISSING for .k6.js probe when k6 not installed", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001-happy.k6.js",
      `import http from 'k6/http';\nexport default function() {}\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    // k6 is likely not installed in CI — TOOL_MISSING expected
    // If k6 IS installed, it may FAIL or PASS — both valid
    expect(text).toMatch(/TOOL_MISSING|FAIL|PASS/);
  });

  it("detects scenario from probe filename in results", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001-happy.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );
    write(
      tempDir,
      "tests/harness/uc-001-error-auth.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("happy");
    expect(text).toContain("error");
  });

  it("runs multiple probes for a single UC", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001-happy.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );
    write(
      tempDir,
      "tests/harness/uc-001-error-missing.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    // Both probes should appear in results (two rows for UC-001)
    const uc001Matches = text.match(/UC-001/g);
    expect(uc001Matches).not.toBeNull();
    expect((uc001Matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("includes scenario column in run report", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(
      tempDir,
      "tests/harness/uc-001-happy.sh",
      `#!/usr/bin/env bash\nexit 0\n`,
    );

    const result = await runHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Scenario");
  });
});
