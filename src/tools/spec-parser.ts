/**
 * spec-parser: Extract structured SpecSummary from freeform spec text.
 *
 * Supports structured markdown (headed sections), freeform prose (keyword
 * fallback), and OpenAPI-style descriptions. Also provides directory-based
 * tag inference for existing projects.
 *
 * Decomposed: markdown helpers → spec-parser-markdown.ts,
 *             tag inference    → spec-parser-tags.ts,
 *             directory helpers→ spec-parser-directory.ts,
 *             inferTagsFromDirectory → spec-parser-inference.ts
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Re-exports (public API unchanged) ────────────────────────────────

export type { AmbiguityItem } from "./spec-parser-tags.js";
export {
  inferSensitiveData,
  SENSITIVE_DATA_KEYWORDS,
  SENSITIVE_TAGS,
} from "./spec-parser-tags.js";
export type { DirectoryInferenceResult } from "./spec-parser-directory.js";
export { scanSourceForSensitivePatterns } from "./spec-parser-directory.js";
export { inferTagsFromDirectory } from "./spec-parser-inference.js";

// ── Types ─────────────────────────────────────────────────────────────

import type { AmbiguityItem } from "./spec-parser-tags.js";
import {
  inferTagsFromText,
  detectSpecAmbiguities,
} from "./spec-parser-tags.js";
import {
  extractStructuredSections,
  extractName,
  extractSentencesByKeyword,
  extractBulletItems,
} from "./spec-parser-markdown.js";

export interface SpecSummary {
  readonly name: string;
  readonly problem: string;
  readonly users: string[];
  readonly successCriteria: string[];
  readonly components: string[];
  readonly externalSystems: string[];
  readonly inferredTags: string[];
  /** Ambiguities detected during parsing; empty array when signals are unambiguous */
  readonly ambiguities: AmbiguityItem[];
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Parse freeform spec text into a structured SpecSummary.
 *
 * Strategy:
 * 1. Try structured extraction from markdown headings.
 * 2. Fall back to keyword-based sentence extraction.
 * 3. Infer tags from the full text.
 *
 * @param text - Spec content (markdown, prose, OpenAPI description, etc.)
 * @param hintName - Project name to use when not derivable from text
 * @returns Structured SpecSummary
 */
export function parseSpec(text: string, hintName?: string): SpecSummary {
  if (!text || text.trim().length === 0) {
    return {
      name: hintName ?? "[Project Name]",
      problem: "",
      users: [],
      successCriteria: [],
      components: [],
      externalSystems: [],
      inferredTags: ["UNIVERSAL"],
      ambiguities: [],
    };
  }

  const sections = extractStructuredSections(text);
  const name = extractName(text, hintName);

  const problemFallback = extractSentencesByKeyword(text, ["problem", "challenge", "need", "helps", "solves"]).slice(0, 3).join(" ");
  const problem = (sections["problem"] ?? problemFallback) || "";
  const users = sections["users"] ? extractBulletItems(sections["users"]) : extractSentencesByKeyword(text, ["user", "developer", "customer", "team", "company"]).slice(0, 5);
  const successCriteria = sections["success"] ? extractBulletItems(sections["success"]) : extractSentencesByKeyword(text, ["success", "goal", "objective", "metric", "measure"]).slice(0, 5);
  const components = sections["components"] ? extractBulletItems(sections["components"]) : extractSentencesByKeyword(text, ["service", "module", "database", "cache", "queue"]).slice(0, 8);
  const externalSystems = sections["external"] ? extractBulletItems(sections["external"]) : extractSentencesByKeyword(text, ["api", "provider", "integration", "service", "gateway"]).slice(0, 5);
  const inferredTags = inferTagsFromText(text);
  const ambiguities = detectSpecAmbiguities(text, inferredTags);

  return { name, problem, users, successCriteria, components, externalSystems, inferredTags, ambiguities };
}

// ── Rich spec file discovery ──────────────────────────────────────────

/**
 * Find the richest existing spec file in the project (not PRD/TechSpec).
 *
 * @param projectDir - Absolute project root path
 * @returns Absolute path to richest spec file, or null if none found
 */
export function findRichestSpecFile(projectDir: string): string | null {
  const candidates: string[] = [];

  function collectMarkdownFiles(dir: string, depth: number): void {
    if (depth < 0 || !existsSync(dir)) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile() && entry.name.endsWith(".md")) {
          candidates.push(fullPath);
        } else if (entry.isDirectory() && depth > 0) {
          collectMarkdownFiles(fullPath, depth - 1);
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  collectMarkdownFiles(join(projectDir, "docs"), 3);
  try {
    const rootFiles = readdirSync(projectDir);
    for (const file of rootFiles) {
      if (file.endsWith(".md") || file === "README.md") candidates.push(join(projectDir, file));
    }
  } catch { /* skip */ }

  const EXCLUDED_NAMES = new Set(["PRD.md", "TechSpec.md", "Status.md", "CLAUDE.md", "CHANGELOG.md", "CONTRIBUTING.md"]);
  const MIN_CONTENT_LENGTH = 500;

  function scoreCandidate(filePath: string, contentLength: number): number {
    const normalised = filePath.replace(/\\/g, "/").toLowerCase();
    let score = contentLength;
    if (/\/specs?\/(system|requirements?|technical|architecture)\//i.test(normalised)) score *= 3;
    else if (/\/specs?\//i.test(normalised)) score *= 2;
    if (/(spec|prd|requirements?|technical|architecture|system)/i.test(normalised.split("/").pop() ?? "")) score *= 2;
    if (/\/(bible|glossary|lore|world|story|narrative|creative)\//i.test(normalised)) score *= 0.1;
    if (/(bible|glossary|sourcebook|lore|worldbuilding)/i.test(normalised.split("/").pop() ?? "")) score *= 0.1;
    return score;
  }

  let richest: { path: string; score: number } | null = null;
  for (const candidate of candidates) {
    const filename = candidate.split(/[/\\]/).pop() ?? "";
    if (EXCLUDED_NAMES.has(filename)) continue;
    try {
      const content = readFileSync(candidate, "utf-8");
      if (content.length > MIN_CONTENT_LENGTH) {
        const score = scoreCandidate(candidate, content.length);
        if (!richest || score > richest.score) richest = { path: candidate, score };
      }
    } catch { /* skip unreadable files */ }
  }
  return richest?.path ?? null;
}

// ── Utility ───────────────────────────────────────────────────────────

/**
 * Check if a directory contains any files (at least one direct child).
 *
 * @param dir - Directory to check
 * @returns True if the directory exists and is non-empty
 */
export function directoryHasFiles(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}
