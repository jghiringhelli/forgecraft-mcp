/**
 * Tests for src/tools/generate-harness.ts
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
import { generateHarnessHandler } from "../../src/tools/generate-harness.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "fc-gen-harness-"));
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

### Main Flow
  1. Run setup_project phase 1
  2. Run setup_project phase 2

---

## UC-002: Verify Cascade

**Actor**: Developer
**Precondition**: project is scaffolded
**Postcondition**: cascade check output is shown

`;

const UC_001_PROBE_YAML = `uc: UC-001
title: Setup Project
action: setup_project
probes:
  - id: probe-setup-scaffold
    type: mcp_call
    description: Assert scaffold artifacts are created
    inputs:
      action: setup_project
    assertions:
      - type: file_exists
        path: forgecraft.yaml
`;

const UC_002_PROBE_PLAYWRIGHT = `uc: UC-002
title: Verify Cascade
action: check_cascade
probes:
  - id: probe-cascade-ui
    type: playwright
    description: Verify cascade output in the UI
`;

const UC_003_PROBE_HURL = `uc: UC-003
title: Check API
action: check_api
probes:
  - id: probe-api-call
    type: api_call
    description: Verify API endpoint responds
`;

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ── generateHarnessHandler ────────────────────────────────────────────

describe("generateHarnessHandler", () => {
  it("returns a ToolResult with text content", async () => {
    tempDir = makeTempDir();
    const result = await generateHarnessHandler({ project_dir: tempDir });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("generates a .sh probe file for a mcp_call spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    const result = await generateHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 1");
    expect(text).toContain("uc-001-happy.sh");
    const probePath = join(tempDir, "tests", "harness", "uc-001-happy.sh");
    expect(existsSync(probePath)).toBe(true);
  });

  it("generates a .spec.ts probe file for a playwright spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-002.yaml", UC_002_PLAYWRIGHT);

    const result = await generateHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("uc-002-happy.spec.ts");
    const probePath = join(tempDir, "tests", "harness", "uc-002-happy.spec.ts");
    expect(existsSync(probePath)).toBe(true);
    const content = readFileSync(probePath, "utf-8");
    expect(content).toContain("from '@playwright/test'");
    expect(content).toContain("UC-002");
  });

  it("generates a .hurl probe file for an api_call spec", async () => {
    tempDir = makeTempDir();
    // Use a UC-003 since MINIMAL_USE_CASES only has UC-001 and UC-002
    const threeUcs =
      MINIMAL_USE_CASES +
      `\n## UC-003: Check API\n\n**Precondition**: server running\n**Postcondition**: 200 response\n\n`;
    write(tempDir, "docs/use-cases.md", threeUcs);
    write(tempDir, ".forgecraft/harness/uc-003.yaml", UC_003_PROBE_HURL);

    const result = await generateHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("uc-003-happy.hurl");
    const probePath = join(tempDir, "tests", "harness", "uc-003-happy.hurl");
    expect(existsSync(probePath)).toBe(true);
    const content = readFileSync(probePath, "utf-8");
    expect(content).toContain("L2 Harness: UC-003");
  });

  it("skips UC with no harness spec and reports no_spec count", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    // No .forgecraft/harness/uc-001.yaml or uc-002.yaml

    const result = await generateHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    expect(text).toContain("Generated: 0");
    expect(text).toContain("No spec:");
  });

  it("skips existing probe files when force=false (default)", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    // Generate first time
    await generateHarnessHandler({ project_dir: tempDir });

    // Overwrite the generated file with sentinel content
    const probePath = join(tempDir, "tests", "harness", "uc-001-happy.sh");
    writeFileSync(probePath, "# EXISTING CONTENT", "utf-8");

    // Generate again without force
    await generateHarnessHandler({ project_dir: tempDir });
    const content = readFileSync(probePath, "utf-8");
    expect(content).toBe("# EXISTING CONTENT");
  });

  it("overwrites existing probe files when force=true", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    // Pre-create a file with sentinel content (legacy naming)
    mkdirSync(join(tempDir, "tests", "harness"), { recursive: true });
    writeFileSync(
      join(tempDir, "tests", "harness", "uc-001.sh"),
      "# OLD CONTENT",
      "utf-8",
    );

    const result = await generateHarnessHandler({
      project_dir: tempDir,
      force: true,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("Generated: 1");
    // When legacy file exists, it is overwritten in place
    const content = readFileSync(
      join(tempDir, "tests", "harness", "uc-001.sh"),
      "utf-8",
    );
    expect(content).not.toBe("# OLD CONTENT");
    expect(content).toContain("L2 Harness: UC-001");
  });

  it("filters by uc_ids when provided", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);
    write(tempDir, ".forgecraft/harness/uc-002.yaml", UC_002_PLAYWRIGHT);

    const result = await generateHarnessHandler({
      project_dir: tempDir,
      uc_ids: ["UC-001"],
    });

    const text = result.content[0]!.text;
    expect(text).toContain("uc-001-happy.sh");
    // uc-002 should not be generated
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-002-happy.spec.ts")),
    ).toBe(false);
  });

  it("creates tests/harness/ directory when absent", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    expect(existsSync(join(tempDir, "tests", "harness"))).toBe(false);
    await generateHarnessHandler({ project_dir: tempDir });
    expect(existsSync(join(tempDir, "tests", "harness"))).toBe(true);
  });

  it("uses project tags to determine probe type when spec has no probes", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    // Spec with no probes array
    write(
      tempDir,
      ".forgecraft/harness/uc-001.yaml",
      `uc: UC-001\ntitle: Setup Project\n`,
    );
    // Project with WEB-REACT tag
    write(
      tempDir,
      "forgecraft.yaml",
      `projectName: TestProject\ntags:\n  - WEB-REACT\n`,
    );

    await generateHarnessHandler({ project_dir: tempDir });
    // Should generate playwright probe
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-001-happy.spec.ts")),
    ).toBe(true);
  });

  it("reports skipped files in the output when they exist", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    // Generate first time
    await generateHarnessHandler({ project_dir: tempDir });

    // Second run without force — should report skipped
    const result = await generateHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;
    expect(text).toContain("Skipped:");
    expect(text).toContain("already exist");
  });

  it("generates probe content with UC title and id", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    await generateHarnessHandler({ project_dir: tempDir });
    const content = readFileSync(
      join(tempDir, "tests", "harness", "uc-001-happy.sh"),
      "utf-8",
    );
    expect(content).toContain("UC-001");
    expect(content).toContain("Setup Project");
  });

  it("gracefully handles missing docs/use-cases.md", async () => {
    tempDir = makeTempDir();
    const result = await generateHarnessHandler({ project_dir: tempDir });
    expect(result.content[0]!.text).toContain("Generated: 0");
  });
});

// ── Probe type detection ──────────────────────────────────────────────

describe("probe type detection from YAML spec", () => {
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects playwright type from spec", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    write(tempDir, ".forgecraft/harness/uc-002.yaml", UC_002_PLAYWRIGHT);

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-002-happy.spec.ts")),
    ).toBe(true);
  });

  it("detects api_call/hurl type from spec", async () => {
    tempDir = makeTempDir();
    const threeUcs =
      MINIMAL_USE_CASES +
      `\n## UC-003: Check API\n\n**Precondition**: running\n**Postcondition**: ok\n\n`;
    write(tempDir, "docs/use-cases.md", threeUcs);
    write(tempDir, ".forgecraft/harness/uc-003.yaml", UC_003_PROBE_HURL);

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-003-happy.hurl")),
    ).toBe(true);
  });

  it("detects file_system type from spec → generates .sh", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", MINIMAL_USE_CASES);
    const fsSpec = `uc: UC-001\ntitle: Setup\nprobes:\n  - id: p1\n    type: file_system\n`;
    write(tempDir, ".forgecraft/harness/uc-001.yaml", fsSpec);

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-001-happy.sh")),
    ).toBe(true);
  });
});

// ── New probe types ───────────────────────────────────────────────────

describe("new probe types", () => {
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const USE_CASES_DB = `# Use Cases

## UC-004: Database Query

**Actor**: Developer
**Precondition**: database running
**Postcondition**: record exists in DB

---
`;

  it("generates .db.sh probe file for db_query type", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_DB);
    write(
      tempDir,
      ".forgecraft/harness/uc-004.yaml",
      `uc: UC-004\ntitle: Database Query\nprobes:\n  - id: p1\n    type: db_query\n`,
    );

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-004-happy.db.sh")),
    ).toBe(true);
    const content = readFileSync(
      join(tempDir, "tests", "harness", "uc-004-happy.db.sh"),
      "utf-8",
    );
    expect(content).toContain("DATABASE_URL");
    expect(content).toContain("set -euo pipefail");
  });

  it("generates .k6.js probe file for performance type", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_DB);
    write(
      tempDir,
      ".forgecraft/harness/uc-004.yaml",
      `uc: UC-004\ntitle: Database Query\nprobes:\n  - id: p1\n    type: performance\n`,
    );

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-004-happy.k6.js")),
    ).toBe(true);
    const content = readFileSync(
      join(tempDir, "tests", "harness", "uc-004-happy.k6.js"),
      "utf-8",
    );
    expect(content).toContain("k6/http");
    expect(content).toContain("thresholds");
  });

  it("generates .a11y.spec.ts probe file for a11y type", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_DB);
    write(
      tempDir,
      ".forgecraft/harness/uc-004.yaml",
      `uc: UC-004\ntitle: A11y Check\nprobes:\n  - id: p1\n    type: a11y\n`,
    );

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(
        join(tempDir, "tests", "harness", "uc-004-happy.a11y.spec.ts"),
      ),
    ).toBe(true);
    const content = readFileSync(
      join(tempDir, "tests", "harness", "uc-004-happy.a11y.spec.ts"),
      "utf-8",
    );
    expect(content).toContain("axe-core");
    expect(content).toContain("wcag2a");
  });

  it("generates .grpc.sh probe file for grpc type", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_DB);
    write(
      tempDir,
      ".forgecraft/harness/uc-004.yaml",
      `uc: UC-004\ntitle: gRPC Check\nprobes:\n  - id: p1\n    type: grpc\n`,
    );

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-004-happy.grpc.sh")),
    ).toBe(true);
    const content = readFileSync(
      join(tempDir, "tests", "harness", "uc-004-happy.grpc.sh"),
      "utf-8",
    );
    expect(content).toContain("grpcurl");
    expect(content).toContain("set -euo pipefail");
  });

  it("generates .zap.sh probe file for security_scan type", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_DB);
    write(
      tempDir,
      ".forgecraft/harness/uc-004.yaml",
      `uc: UC-004\ntitle: Security Scan\nprobes:\n  - id: p1\n    type: security_scan\n`,
    );

    await generateHarnessHandler({ project_dir: tempDir });
    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-004-happy.zap.sh")),
    ).toBe(true);
    const content = readFileSync(
      join(tempDir, "tests", "harness", "uc-004-happy.zap.sh"),
      "utf-8",
    );
    expect(content).toContain("ZAP");
    expect(content).toContain("docker");
  });
});

// ── Unhappy path generation ───────────────────────────────────────────

describe("unhappy path probe generation", () => {
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const USE_CASES_WITH_ERRORS = `# Use Cases

## UC-001: Setup Project

**Actor**: Developer
**Precondition**: forgecraft is installed
**Postcondition**: forgecraft.yaml exists

**Error Cases**:
  - Unauthenticated request: returns 401
  - Missing required field: returns 422

---
`;

  it("generates error probe files for each UC error case", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_WITH_ERRORS);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    await generateHarnessHandler({ project_dir: tempDir });

    expect(
      existsSync(
        join(
          tempDir,
          "tests",
          "harness",
          "uc-001-error-unauthenticated-request.sh",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          tempDir,
          "tests",
          "harness",
          "uc-001-error-missing-required-field.sh",
        ),
      ),
    ).toBe(true);
  });

  it("happy path file is also generated alongside error probes", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_WITH_ERRORS);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    await generateHarnessHandler({ project_dir: tempDir });

    expect(
      existsSync(join(tempDir, "tests", "harness", "uc-001-happy.sh")),
    ).toBe(true);
  });

  it("generated count includes both happy and error probes", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_WITH_ERRORS);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    const result = await generateHarnessHandler({ project_dir: tempDir });
    const text = result.content[0]!.text;

    // Should have generated happy + 2 error probes = 3
    expect(text).toContain("Generated: 3");
  });

  it("does not re-generate existing error probes when force=false", async () => {
    tempDir = makeTempDir();
    write(tempDir, "docs/use-cases.md", USE_CASES_WITH_ERRORS);
    write(tempDir, ".forgecraft/harness/uc-001.yaml", UC_001_PROBE_YAML);

    // First generation
    await generateHarnessHandler({ project_dir: tempDir });

    // Mark error probe with sentinel
    const errorFile = join(
      tempDir,
      "tests",
      "harness",
      "uc-001-error-unauthenticated-request.sh",
    );
    writeFileSync(errorFile, "# SENTINEL", "utf-8");

    // Second generation without force
    await generateHarnessHandler({ project_dir: tempDir });
    expect(readFileSync(errorFile, "utf-8")).toBe("# SENTINEL");
  });
});

// ── parseErrorCases ───────────────────────────────────────────────────

import { parseErrorCases } from "../../src/tools/generate-harness.js";

describe("parseErrorCases", () => {
  it("extracts error cases from UC section", () => {
    const section = `## UC-001: Test

**Error Cases**:
  - Unauthenticated request: returns 401
  - Missing required field: returns 422
`;
    const cases = parseErrorCases(section);
    expect(cases).toHaveLength(2);
    expect(cases[0]!.name).toBe("Unauthenticated request");
    expect(cases[0]!.slug).toBe("unauthenticated-request");
    expect(cases[1]!.slug).toBe("missing-required-field");
  });

  it("returns empty array when no Error Cases section", () => {
    const section = `## UC-001: Test\n\n**Precondition**: running\n`;
    expect(parseErrorCases(section)).toHaveLength(0);
  });

  it("slugifies error case names (strips backticks and special chars)", () => {
    const section = `**Error Cases**:\n  - \`project_dir\` does not exist: returns error\n`;
    const cases = parseErrorCases(section);
    expect(cases[0]!.slug).toBe("project-dir-does-not-exist");
  });
});

// ── Constant used in tests ────────────────────────────────────────────

const UC_002_PLAYWRIGHT = `uc: UC-002
title: Verify Cascade
action: check_cascade
probes:
  - id: probe-cascade-ui
    type: playwright
    description: Verify cascade output in the UI
`;
