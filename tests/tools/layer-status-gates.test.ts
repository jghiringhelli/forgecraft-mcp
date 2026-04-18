/**
 * Tests for src/tools/layer-status-gates.ts — detectL1GateViolations
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectL1GateViolations } from "../../src/tools/layer-status-gates.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `l1-gates-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTempDir();
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const gatesDir = ".forgecraft/gates/active";

describe("detectL1GateViolations", () => {
  it("returns empty array when no gates directory exists", () => {
    expect(detectL1GateViolations(tmpDir)).toEqual([]);
  });

  it("returns empty array when gates directory is empty", () => {
    mkdirSync(join(tmpDir, gatesDir), { recursive: true });
    expect(detectL1GateViolations(tmpDir)).toEqual([]);
  });

  it("ignores gates that do not declare an L1 layer", () => {
    write(
      tmpDir,
      `${gatesDir}/l2-only.yaml`,
      `
id: l2-only-gate
layers:
  - layer: L2
check:
  type: file_system
  condition: file_missing
  paths:
    - docs/something.md
`,
    );
    expect(detectL1GateViolations(tmpDir)).toEqual([]);
  });

  it("returns violation when L1 file_system gate fires on missing file", () => {
    write(
      tmpDir,
      `${gatesDir}/prd-missing.yaml`,
      `
id: prd-missing
layers:
  - layer: L1
check:
  type: file_system
  condition: file_missing
  paths:
    - docs/PRD.md
failureMessage: PRD.md is required
fixHint: Run generate_prd to scaffold the PRD
`,
    );
    const violations = detectL1GateViolations(tmpDir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      gateId: "prd-missing",
      message: expect.stringContaining("PRD.md is required"),
      fixHint: "Run generate_prd to scaffold the PRD",
    });
  });

  it("does not fire when required file exists", () => {
    write(
      tmpDir,
      `${gatesDir}/prd-missing.yaml`,
      `
id: prd-missing
layers:
  - layer: L1
check:
  type: file_system
  condition: file_missing
  paths:
    - docs/PRD.md
failureMessage: PRD.md is required
`,
    );
    write(tmpDir, "docs/PRD.md", "# PRD");
    expect(detectL1GateViolations(tmpDir)).toEqual([]);
  });

  it("fires none_of_these_exist when no path exists", () => {
    write(
      tmpDir,
      `${gatesDir}/diagrams-missing.yaml`,
      `
id: diagrams-missing
layers:
  - layer: L1
check:
  type: file_system
  condition: none_of_these_exist
  paths:
    - docs/diagrams/context.md
    - docs/diagrams/c4-context.md
failureMessage: No C4 diagram found
`,
    );
    const violations = detectL1GateViolations(tmpDir);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.gateId).toBe("diagrams-missing");
  });

  it("does not fire none_of_these_exist when at least one path exists", () => {
    write(
      tmpDir,
      `${gatesDir}/diagrams-missing.yaml`,
      `
id: diagrams-missing
layers:
  - layer: L1
check:
  type: file_system
  condition: none_of_these_exist
  paths:
    - docs/diagrams/context.md
    - docs/diagrams/c4-context.md
failureMessage: No C4 diagram found
`,
    );
    write(tmpDir, "docs/diagrams/c4-context.md", "# C4");
    expect(detectL1GateViolations(tmpDir)).toEqual([]);
  });

  it("surfaces logic gate as requires-audit violation", () => {
    write(
      tmpDir,
      `${gatesDir}/logic-gate.yaml`,
      `
id: logic-gate
layers:
  - layer: L1
check:
  type: logic
fixHint: Run check_cascade to evaluate
`,
    );
    const violations = detectL1GateViolations(tmpDir);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("requires audit");
    expect(violations[0]?.fixHint).toBe("Run check_cascade to evaluate");
  });

  it("surfaces mcp gate as requires-audit violation", () => {
    write(
      tmpDir,
      `${gatesDir}/mcp-gate.yaml`,
      `
id: mcp-gate
layers:
  - layer: L1
check:
  type: mcp
remediation: run mcp check manually
`,
    );
    const violations = detectL1GateViolations(tmpDir);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("requires audit");
  });

  it("uses filename as gateId when id field is absent", () => {
    write(
      tmpDir,
      `${gatesDir}/my-special-gate.yaml`,
      `
layers:
  - layer: L1
check:
  type: file_system
  condition: file_missing
  paths:
    - docs/missing.md
failureMessage: Missing doc
`,
    );
    const violations = detectL1GateViolations(tmpDir);
    expect(violations[0]?.gateId).toBe("my-special-gate");
  });

  it("aggregates multiple firing gates", () => {
    write(
      tmpDir,
      `${gatesDir}/gate-a.yaml`,
      `
id: gate-a
layers:
  - layer: L1
check:
  type: file_system
  condition: file_missing
  paths:
    - docs/a.md
failureMessage: a.md missing
`,
    );
    write(
      tmpDir,
      `${gatesDir}/gate-b.yaml`,
      `
id: gate-b
layers:
  - layer: L1
check:
  type: logic
remediation: run check_cascade
`,
    );
    const violations = detectL1GateViolations(tmpDir);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.gateId).sort()).toEqual([
      "gate-a",
      "gate-b",
    ]);
  });

  it("ignores non-yaml files in gates dir", () => {
    mkdirSync(join(tmpDir, gatesDir), { recursive: true });
    writeFileSync(join(tmpDir, gatesDir, "README.md"), "# gates", "utf-8");
    writeFileSync(join(tmpDir, gatesDir, "gate.json"), "{}", "utf-8");
    expect(detectL1GateViolations(tmpDir)).toEqual([]);
  });
});
