/**
 * Tests for src/tools/extract-adrs-from-spec.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractAdrsFromSpecHandler } from "../../src/tools/extract-adrs-from-spec.js";

function makeTempDir(): string {
  const dir = join(tmpdir(), `fc-spec-adr-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const VAIRIX_TECH_TABLE = `
## 2. Tech Stack

| Layer | Technology | Version/Notes |
|-------|-----------|---------------|
| Frontend | Next.js (App Router) + TypeScript | Latest stable |
| UI Components | shadcn/ui + Tailwind CSS | new-york style |
| Backend | NestJS + TypeScript | REST API |
| Database | Supabase PostgreSQL | Free cloud tier |
| AI / LLM | OpenAI API | GPT-4.1-mini |
| Auth | NestJS guards + JWT | Username/password |
| Deploy | Railway | Cloud-agnostic |
`.trim();

function writePrd(dir: string, content: string): void {
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "PRD.md"), content, "utf-8");
}

describe("extractAdrsFromSpecHandler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns error when no spec file found", async () => {
    const result = await extractAdrsFromSpecHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No specification file found");
  });

  it("returns error when explicit spec_path does not exist", async () => {
    const result = await extractAdrsFromSpecHandler({
      project_dir: tempDir,
      spec_path: join(tempDir, "nonexistent.md"),
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No specification file found");
  });

  it("auto-detects docs/PRD.md", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    const result = await extractAdrsFromSpecHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).not.toContain("No specification file found");
    expect(text).toContain("Created");
  });

  it("generates ADR files for tech stack table rows", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    expect(existsSync(adrDir)).toBe(true);
    const files = readdirSync(adrDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("creates database ADR when database technology detected", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    const files = readdirSync(adrDir);
    expect(files.some((f) => f.includes("database"))).toBe(true);
  });

  it("creates auth ADR when auth technology detected", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    const files = readdirSync(adrDir);
    expect(files.some((f) => f.includes("auth"))).toBe(true);
  });

  it("creates AI integration ADR when LLM technology detected", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    const files = readdirSync(adrDir);
    expect(files.some((f) => f.includes("ai"))).toBe(true);
  });

  it("ADR files contain Retroactive status", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    const files = readdirSync(adrDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(join(adrDir, files[0]!), "utf-8");
    expect(content).toContain("Retroactive");
    expect(content).toContain("## Context");
    expect(content).toContain("## Decision");
  });

  it("ADR files include spec excerpt", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    const files = readdirSync(adrDir).filter((f) => f.endsWith(".md"));
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(join(adrDir, files[0]!), "utf-8");
    expect(content).toContain("## Spec Excerpt");
  });

  it("is idempotent — skips ADRs that already exist", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir });
    const adrDir = join(tempDir, "docs", "adrs", "active");
    const countAfterFirst = readdirSync(adrDir).length;

    const result2 = await extractAdrsFromSpecHandler({ project_dir: tempDir });
    const text2 = (result2.content[0] as { type: string; text: string }).text;
    const countAfterSecond = readdirSync(adrDir).length;

    expect(countAfterSecond).toBe(countAfterFirst);
    expect(text2).toContain("Skipped");
  });

  it("respects max_adrs limit", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    await extractAdrsFromSpecHandler({ project_dir: tempDir, max_adrs: 2 });

    const adrDir = join(tempDir, "docs", "adrs", "active");
    const files = readdirSync(adrDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeLessThanOrEqual(2);
  });

  it("uses docs/adrs/ when it exists and active/ does not", async () => {
    writePrd(tempDir, VAIRIX_TECH_TABLE);
    mkdirSync(join(tempDir, "docs", "adrs"), { recursive: true });
    await extractAdrsFromSpecHandler({ project_dir: tempDir });

    // resolveAdrDir returns docs/adrs/ when active/ doesn't exist yet
    const adrDir = join(tempDir, "docs", "adrs");
    const files = readdirSync(adrDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("returns informative message when no tech decisions detected", async () => {
    writePrd(
      tempDir,
      "# My Project\n\nThis is a simple project with no tech stack mentioned.",
    );
    const result = await extractAdrsFromSpecHandler({ project_dir: tempDir });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("No technology decisions detected");
  });
});
