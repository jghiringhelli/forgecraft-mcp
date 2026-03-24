/**
 * setup-cnt: CNT (Context Navigation Tree) file writers.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec } from "./spec-parser.js";
import type { SpecSummary } from "./spec-parser.js";
import {
  buildClaudeIndexContent,
  buildCoreMdContent,
  buildAdrIndexContent,
  buildGatesIndexContent,
  buildAdr000Content,
} from "./setup-cnt-builders.js";

// ── CNT File Writers ──────────────────────────────────────────────────

/**
 * Write `.claude/index.md` — the CNT routing root. Skips if already exists.
 *
 * @param projectDir - Project root
 * @param projectName - Project name for the index title
 * @param tags - Effective tags used to build domain rows
 * @returns True if the file was created
 */
export function writeCntFiles(
  projectDir: string,
  projectName: string,
  tags: readonly string[],
): boolean {
  const claudeDir = join(projectDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const indexPath = join(claudeDir, "index.md");
  if (existsSync(indexPath)) return false;

  writeFileSync(indexPath, buildClaudeIndexContent(projectName, tags), "utf-8");

  const adr000Path = join(projectDir, "docs", "adrs", "ADR-000-cnt-init.md");
  if (!existsSync(adr000Path)) {
    mkdirSync(join(projectDir, "docs", "adrs"), { recursive: true });
    writeFileSync(adr000Path, buildAdr000Content(tags), "utf-8");
  }

  return true;
}

/**
 * Write `.claude/core.md` — always-loaded CNT invariants. Skips if already exists.
 *
 * @param projectDir - Project root
 * @param projectName - Project name
 * @param tags - Effective tags
 * @param specContent - Raw spec text (optional)
 * @returns True if the file was created
 */
export function writeCoreMd(
  projectDir: string,
  projectName: string,
  tags: readonly string[],
  specContent: string | null,
): boolean {
  const corePath = join(projectDir, ".claude", "core.md");
  if (existsSync(corePath)) return false;

  const spec: SpecSummary | null = specContent ? parseSpec(specContent, projectName) : null;
  writeFileSync(corePath, buildCoreMdContent(projectName, spec, tags), "utf-8");
  return true;
}

/**
 * Write `.claude/adr/index.md` — CNT ADR navigation index. Skips if already exists.
 *
 * @param projectDir - Project root
 * @returns True if the file was created
 */
export function writeAdrIndex(projectDir: string): boolean {
  const adrIndexDir = join(projectDir, ".claude", "adr");
  mkdirSync(adrIndexDir, { recursive: true });

  const indexPath = join(adrIndexDir, "index.md");
  if (existsSync(indexPath)) return false;

  writeFileSync(indexPath, buildAdrIndexContent(projectDir), "utf-8");
  return true;
}

/**
 * Write `.claude/gates/index.md` — CNT active quality gates. Skips if already exists.
 *
 * @param projectDir - Project root
 * @returns True if the file was created
 */
export function writeGatesIndex(projectDir: string): boolean {
  const gatesIndexDir = join(projectDir, ".claude", "gates");
  mkdirSync(gatesIndexDir, { recursive: true });

  const indexPath = join(gatesIndexDir, "index.md");
  if (existsSync(indexPath)) return false;

  writeFileSync(indexPath, buildGatesIndexContent(projectDir), "utf-8");
  return true;
}
