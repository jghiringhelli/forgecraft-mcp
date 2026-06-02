/**
 * Tests for src/tools/check-derivation-chain.ts
 *
 * Covers: empty project (all breaks), PRD detection, UC detection (canonical + monolith),
 * probe binding (bound vs unbound UCs), ADR quality (Accepted vs Retroactive),
 * cross-references, chain score calculation, handler output format.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDerivationChainReport,
  checkDerivationChainHandler,
} from "../../src/tools/check-derivation-chain.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-chain-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(dir: string, relPath: string, content: string): void {
  const parts = relPath.split("/");
  if (parts.length > 1) {
    mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true });
  }
  writeFileSync(join(dir, relPath), content, "utf-8");
}

describe("buildDerivationChainReport", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns low chain score for empty project", () => {
    const report = buildDerivationChainReport(tempDir);
    expect(report.chainScore).toBeLessThan(50);
    expect(report.breaks.length).toBeGreaterThan(0);
  });

  it("detects PRD presence and counts words", () => {
    write(
      tempDir,
      "docs/PRD.md",
      "# Product Requirements\n\n" + "word ".repeat(200),
    );
    const report = buildDerivationChainReport(tempDir);
    const prd = report.links.find((l) => l.name === "PRD / Spec");
    expect(prd?.score).toBe(1);
  });

  it("flags thin PRD (under 100 words) as partial", () => {
    write(tempDir, "docs/PRD.md", "# PRD\n\nShort content.");
    const report = buildDerivationChainReport(tempDir);
    const prd = report.links.find((l) => l.name === "PRD / Spec");
    expect(prd?.score).toBe(0.5);
  });

  it("detects canonical UC files", () => {
    write(tempDir, "docs/use-cases/UC-001-auth.md", "# UC-001: Auth\n");
    write(tempDir, "docs/use-cases/UC-002-payment.md", "# UC-002: Payment\n");
    const report = buildDerivationChainReport(tempDir);
    const ucLink = report.links.find((l) => l.name === "Use Cases");
    expect(ucLink?.score).toBe(1);
    expect(ucLink?.detail).toContain("2 UC file(s)");
  });

  it("detects monolith use-cases.md as partial credit", () => {
    write(
      tempDir,
      "docs/use-cases.md",
      "# Use Cases\n\n## UC-001 Auth\n\n## UC-002 Payment\n",
    );
    const report = buildDerivationChainReport(tempDir);
    const ucLink = report.links.find((l) => l.name === "Use Cases");
    expect(ucLink?.score).toBe(0.5);
    expect(ucLink?.detail).toContain("monolith");
  });

  it("full probe binding when all UCs have probes", () => {
    write(tempDir, "docs/use-cases/UC-001-auth.md", "# UC-001\n");
    write(tempDir, "tests/harness/UC-001-auth.hurl", "# probe");
    const report = buildDerivationChainReport(tempDir);
    const binding = report.links.find((l) => l.name === "UC → Probe Binding");
    expect(binding?.score).toBe(1);
  });

  it("partial binding when some UCs have no probe", () => {
    write(tempDir, "docs/use-cases/UC-001-auth.md", "# UC-001\n");
    write(tempDir, "docs/use-cases/UC-002-admin.md", "# UC-002\n");
    write(tempDir, "tests/harness/UC-001-auth.hurl", "# probe");
    const report = buildDerivationChainReport(tempDir);
    const binding = report.links.find((l) => l.name === "UC → Probe Binding");
    expect(binding?.score).toBe(0.5);
    expect(binding?.breaks.some((b) => b.includes("UC-002"))).toBe(true);
  });

  it("no binding when no UCs have probes", () => {
    write(tempDir, "docs/use-cases/UC-001-auth.md", "# UC-001\n");
    const report = buildDerivationChainReport(tempDir);
    const binding = report.links.find((l) => l.name === "UC → Probe Binding");
    expect(binding?.score).toBe(0);
  });

  it("full ADR score when all ADRs are Accepted", () => {
    write(
      tempDir,
      "docs/adrs/active/0001-use-postgres.md",
      "# ADR-0001\n**Status:** Accepted\n",
    );
    write(
      tempDir,
      "docs/adrs/active/0002-use-redis.md",
      "# ADR-0002\n**Status:** Accepted\n",
    );
    const report = buildDerivationChainReport(tempDir);
    const adrLink = report.links.find((l) => l.name === "ADRs");
    expect(adrLink?.score).toBe(1);
  });

  it("partial ADR score when majority are Retroactive", () => {
    write(
      tempDir,
      "docs/adrs/active/0001.md",
      "# A\n**Status:** Retroactive\n",
    );
    write(
      tempDir,
      "docs/adrs/active/0002.md",
      "# B\n**Status:** Retroactive\n",
    );
    write(tempDir, "docs/adrs/active/0003.md", "# C\n**Status:** Accepted\n");
    const report = buildDerivationChainReport(tempDir);
    const adrLink = report.links.find((l) => l.name === "ADRs");
    expect(adrLink?.score).toBe(0.5);
    expect(adrLink?.breaks.some((b) => b.includes("Retroactive"))).toBe(true);
  });

  it("chain score increases as more links are complete", () => {
    // Empty project
    const emptyReport = buildDerivationChainReport(tempDir);

    // Add PRD + UCs
    write(tempDir, "docs/PRD.md", "# PRD\n\n" + "word ".repeat(200));
    write(tempDir, "docs/use-cases/UC-001.md", "# UC-001\n");
    write(tempDir, "tests/harness/UC-001.hurl", "# probe for UC-001");
    write(tempDir, "docs/adrs/active/0001.md", "# A\n**Status:** Accepted\n");

    const filledReport = buildDerivationChainReport(tempDir);
    expect(filledReport.chainScore).toBeGreaterThan(emptyReport.chainScore);
  });
});

describe("checkDerivationChainHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns text content with chain score", async () => {
    const result = await checkDerivationChainHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Chain Score");
    expect(text).toContain("%");
  });

  it("includes link-by-link breakdown", async () => {
    const result = await checkDerivationChainHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("PRD");
    expect(text).toContain("Use Cases");
    expect(text).toContain("ADRs");
  });

  it("includes resolution guidance", async () => {
    const result = await checkDerivationChainHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("tests/harness");
    expect(text).toContain("check_derivation_chain");
  });
});
