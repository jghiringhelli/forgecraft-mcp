/**
 * spec-parser: Extract structured SpecSummary from freeform spec text.
 *
 * Supports structured markdown (headed sections), freeform prose (keyword
 * fallback), and OpenAPI-style descriptions. Also provides directory-based
 * tag inference for existing projects.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────

export interface SpecSummary {
  readonly name: string;
  readonly problem: string;
  readonly users: string[];
  readonly successCriteria: string[];
  readonly components: string[];
  readonly externalSystems: string[];
  readonly inferredTags: string[];
}

// ── Tag inference keywords ────────────────────────────────────────────

const TAG_KEYWORD_MAP: ReadonlyArray<{ tag: string; keywords: readonly string[] }> = [
  { tag: "API",    keywords: ["api", "endpoint", "rest", "graphql", "http", "openapi", "swagger", "routes", "controller"] },
  { tag: "CLI",    keywords: ["cli", "command line", "terminal", "bin", "command-line", "commander", "yargs", "argv"] },
  { tag: "LIBRARY", keywords: ["library", "sdk", "package", "npm", "module", "publish", "installable", "peer dependency"] },
  { tag: "WEB3",   keywords: ["wallet", "token", "defi", "blockchain", "smart contract", "crypto", "ethereum", "solidity", "web3", "nft"] },
  { tag: "FINTECH", keywords: ["payment", "invoice", "ledger", "financial", "transaction", "budget", "billing", "stripe", "paypal", "banking"] },
  { tag: "MOBILE", keywords: ["mobile", "ios", "android", "react native", "flutter", "app store", "google play"] },
];

// ── Heading extraction ────────────────────────────────────────────────

const HEADING_PATTERNS: ReadonlyArray<{ key: string; patterns: readonly string[] }> = [
  { key: "problem",      patterns: ["## problem", "## overview", "## background", "## context", "## about"] },
  { key: "users",        patterns: ["## users", "## user", "## target", "## audience", "## personas"] },
  { key: "success",      patterns: ["## success", "## goals", "## goal", "## objectives", "## objective", "## metrics"] },
  { key: "components",   patterns: ["## components", "## component", "## architecture", "## modules", "## module", "## services", "## service"] },
  { key: "external",     patterns: ["## external", "## integrations", "## integration", "## dependencies", "## apis"] },
];

/**
 * Extract content after a markdown heading until the next heading of the same or higher level.
 *
 * @param text - Full markdown text
 * @param heading - The heading to search for (e.g., "## Problem")
 * @returns Trimmed content after the heading, or null if not found
 */
function extractHeadingContent(text: string, heading: string): string | null {
  const lowerText = text.toLowerCase();
  const lowerHeading = heading.toLowerCase();
  const idx = lowerText.indexOf(lowerHeading);
  if (idx === -1) return null;

  const afterHeading = text.slice(idx + heading.length);
  const nextHeading = afterHeading.match(/\n#{1,3} /);
  const content = nextHeading
    ? afterHeading.slice(0, nextHeading.index)
    : afterHeading;
  return content.trim() || null;
}

/**
 * Extract structured content from a markdown spec using known heading patterns.
 *
 * @param text - Spec text
 * @returns Partial record of extracted sections
 */
function extractStructuredSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, patterns } of HEADING_PATTERNS) {
    for (const pattern of patterns) {
      const content = extractHeadingContent(text, pattern);
      if (content) {
        result[key] = content;
        break;
      }
    }
  }
  return result;
}

// ── Name extraction ───────────────────────────────────────────────────

/**
 * Extract project name from spec text (first heading or title pattern).
 *
 * @param text - Spec text
 * @param hintName - Fallback name if not derivable
 * @returns Project name
 */
function extractName(text: string, hintName?: string): string {
  const h1 = text.match(/^#\s+(.+)/m);
  if (h1?.[1]) return h1[1].trim();

  const titlePattern = text.match(/(?:project|title|name):\s*(.+)/i);
  if (titlePattern?.[1]) return titlePattern[1].trim();

  return hintName ?? "[Project Name]";
}

// ── Keyword fallback extraction ───────────────────────────────────────

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/**
 * Extract sentences containing any of the given keywords.
 *
 * @param text - Text to search
 * @param keywords - Words that signal relevance
 * @returns Array of matching sentences (deduplicated)
 */
function extractSentencesByKeyword(text: string, keywords: readonly string[]): string[] {
  const sentences = text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const results: string[] = [];
  const lower = keywords.map((k) => k.toLowerCase());
  for (const sentence of sentences) {
    const lc = sentence.toLowerCase();
    if (lower.some((k) => lc.includes(k)) && !seen.has(sentence)) {
      seen.add(sentence);
      results.push(sentence);
    }
  }
  return results;
}

/**
 * Extract bullet items from a content block (lines starting with -, *, or numbers).
 *
 * @param content - Markdown block content
 * @returns Array of extracted items
 */
function extractBulletItems(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.replace(/^[-*\d+.]\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("<!--"));
}

// ── Tag inference ─────────────────────────────────────────────────────

/**
 * Infer classification tags from freeform text using keyword matching.
 *
 * @param text - Text to scan (lowercased internally)
 * @returns Array of inferred tag strings, always includes "UNIVERSAL"
 */
function inferTagsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = ["UNIVERSAL"];
  for (const { tag, keywords } of TAG_KEYWORD_MAP) {
    if (keywords.some((k) => lower.includes(k))) {
      tags.push(tag);
    }
  }
  return tags;
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
    };
  }

  const sections = extractStructuredSections(text);
  const name = extractName(text, hintName);

  const problem = (sections["problem"]
    ?? extractSentencesByKeyword(text, ["problem", "challenge", "need", "helps", "solves"]).join(" ")) || "";

  const users = sections["users"]
    ? extractBulletItems(sections["users"])
    : extractSentencesByKeyword(text, ["user", "developer", "customer", "team", "company"]);

  const successCriteria = sections["success"]
    ? extractBulletItems(sections["success"])
    : extractSentencesByKeyword(text, ["success", "goal", "objective", "metric", "measure"]);

  const components = sections["components"]
    ? extractBulletItems(sections["components"])
    : extractSentencesByKeyword(text, ["service", "module", "database", "cache", "queue"]);

  const externalSystems = sections["external"]
    ? extractBulletItems(sections["external"])
    : extractSentencesByKeyword(text, ["api", "provider", "integration", "service", "gateway"]).slice(0, 5);

  const inferredTags = inferTagsFromText(text);

  return { name, problem, users, successCriteria, components, externalSystems, inferredTags };
}

// ── Directory-based tag inference ─────────────────────────────────────

/**
 * Infer classification tags by inspecting the project directory structure,
 * package.json dependencies, and existing forgecraft.yaml.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Array of inferred tag strings
 */
export async function inferTagsFromDirectory(projectDir: string): Promise<string[]> {
  const tags = new Set<string>(["UNIVERSAL"]);

  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      const allDeps = {
        ...((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
        ...((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}),
      };
      const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());

      if (depNames.some((d) => ["express", "fastify", "koa", "hapi", "@nestjs/core", "fastify"].includes(d))) {
        tags.add("API");
      }
      if (depNames.some((d) => ["commander", "yargs", "meow", "@oclif/core", "clipanion"].includes(d))) {
        tags.add("CLI");
      }
      if (typeof pkg["bin"] === "object" && pkg["bin"] !== null) {
        tags.add("CLI");
      }
      if (depNames.some((d) => d.includes("react"))) {
        tags.add("WEB-REACT");
      }
      if (depNames.some((d) => ["ethers", "web3", "@ethersproject/providers", "wagmi", "viem"].includes(d))) {
        tags.add("WEB3");
      }
      if (depNames.some((d) => ["stripe", "braintree", "@paddle/paddle-node-sdk"].includes(d))) {
        tags.add("FINTECH");
      }
      if (depNames.some((d) => ["react-native", "expo", "@capacitor/core"].includes(d))) {
        tags.add("MOBILE");
      }
      // Heuristic: no main entry, no bin → likely a library
      if (!pkg["main"] && !pkg["bin"] && pkg["name"]) {
        tags.add("LIBRARY");
      }
    } catch {
      // Malformed package.json — skip
    }
  }

  // Directory structure heuristics
  if (existsSync(join(projectDir, "src", "routes")) || existsSync(join(projectDir, "src", "controllers"))) {
    tags.add("API");
  }
  if (existsSync(join(projectDir, "src", "cli")) || existsSync(join(projectDir, "bin"))) {
    tags.add("CLI");
  }
  if (existsSync(join(projectDir, "src", "lib")) || existsSync(join(projectDir, "lib"))) {
    tags.add("LIBRARY");
  }

  // Respect any existing forgecraft.yaml tags
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (existsSync(yamlPath)) {
    try {
      const config = JSON.parse(JSON.stringify(
        await import("js-yaml").then((m) => m.load(readFileSync(yamlPath, "utf-8"))),
      )) as Record<string, unknown>;
      const existingTags = config["tags"] as string[] | undefined;
      if (Array.isArray(existingTags)) {
        for (const t of existingTags) {
          if (typeof t === "string") tags.add(t);
        }
      }
    } catch {
      // Invalid yaml — skip
    }
  }

  return Array.from(tags);
}

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
