/**
 * Tests for src/tools/review-stubs.ts
 *
 * Covers: empty project (no stubs), ADR stub detection, decision stub detection,
 * CNT leaf stub detection, scaffold-generated file exemption, priority ordering,
 * retroactive ADRs with no markers (verify recommendation), output text content.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reviewStubsHandler } from "../../src/tools/review-stubs.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-review-stubs-${Date.now()}`);
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

const MARKER = "[NEEDS CLARIFICATION]";
const SCAFFOLD_SENTINEL =
  "<!-- ForgeCraft sentinel: architecture | 2024-01-01 | update -->\n";

describe("reviewStubsHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns no-stubs message when project has no stubs at all", async () => {
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No unresolved stubs found");
  });

  it("detects ADR stub with [NEEDS CLARIFICATION] markers", async () => {
    write(
      tempDir,
      "docs/adrs/active/0001-migrate-auth.md",
      `# ADR-0001: Migrate Auth\n\n**Date:** 2026-01-15\n**Status:** Retroactive\n\n## Context\n\n${MARKER}\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("0001-migrate-auth.md");
    expect(text).toContain("marker");
  });

  it("detects retroactive ADR with no markers (verify recommendation)", async () => {
    write(
      tempDir,
      "docs/adrs/active/0002-use-postgres.md",
      `# ADR-0002: Use Postgres\n\n**Date:** 2025-06-01\n**Status:** Retroactive\n\nContext here.\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("0002-use-postgres.md");
  });

  it("does not report Accepted ADR with no markers", async () => {
    write(
      tempDir,
      "docs/adrs/active/0003-accepted.md",
      `# ADR-0003: Accepted\n\n**Date:** 2025-06-01\n**Status:** Accepted\n\nFull content here.\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No unresolved stubs found");
  });

  it("detects decision stub with markers", async () => {
    write(
      tempDir,
      "docs/decisions/2026-05-01-fix-import.md",
      `# Fix Import Bug\n\n**Date:** 2026-05-01\n\n## Trigger\n\n${MARKER}\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("2026-05-01-fix-import.md");
  });

  it("detects CNT leaf stub with markers", async () => {
    write(
      tempDir,
      ".claude/standards/tools-routing.md",
      `# Tools Routing\n\n${MARKER}: when to load this file\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("tools-routing.md");
  });

  it("skips scaffold-generated CNT leaf files", async () => {
    write(
      tempDir,
      ".claude/standards/architecture.md",
      `${SCAFFOLD_SENTINEL}\n# Architecture\n\n${MARKER}\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No unresolved stubs found");
  });

  it("counts total markers across multiple files", async () => {
    write(
      tempDir,
      "docs/adrs/active/0001-a.md",
      `# A\n**Date:** 2026-01-01\n**Status:** Retroactive\n\n${MARKER}\n${MARKER}\n`,
    );
    write(
      tempDir,
      "docs/adrs/active/0002-b.md",
      `# B\n**Date:** 2026-01-02\n**Status:** Retroactive\n\n${MARKER}\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("3");
  });

  it("output includes prioritization instructions", async () => {
    write(
      tempDir,
      "docs/adrs/active/0001-migrate.md",
      `# Migrate\n**Date:** 2026-01-01\n**Status:** Retroactive\n\n${MARKER}\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Accepted");
    expect(text).toContain("Superseded");
  });

  it("uses legacy docs/adrs/ when docs/adrs/active/ does not exist", async () => {
    write(
      tempDir,
      "docs/adrs/0001-legacy.md",
      `# Legacy\n**Date:** 2026-01-01\n**Status:** Retroactive\n\n${MARKER}\n`,
    );
    const result = await reviewStubsHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("0001-legacy.md");
  });
});
