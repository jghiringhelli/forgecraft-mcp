/**
 * spec-parser-directory: Build-system detection, scraping pattern scanning, package.json
 * tag inference, and sub-directory analysis helpers for inferTagsFromDirectory.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AmbiguityItem } from "./spec-parser-tags.js";

// ── Build-system detection ────────────────────────────────────────────

/** Build-system indicator files — presence means a software project is being developed. */
export const BUILD_SYSTEM_FILES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "build.gradle",
  "pom.xml",
] as const;

/**
 * Check whether the project root contains any build-system file.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Names of build-system files found
 */
export function detectBuildSystemFiles(projectDir: string): string[] {
  return BUILD_SYSTEM_FILES.filter((f) => existsSync(join(projectDir, f)));
}

/**
 * Check whether the project root contains at least one Markdown file.
 *
 * @param projectDir - Absolute path to the project root
 * @returns True if at least one .md file exists directly under projectDir
 */
export function hasMarkdownFiles(projectDir: string): boolean {
  try {
    return readdirSync(projectDir).some((entry) =>
      entry.toLowerCase().endsWith(".md"),
    );
  } catch {
    return false;
  }
}

/**
 * Result of directory-based tag inference: resolved tags plus any ambiguities detected.
 */
export interface DirectoryInferenceResult {
  readonly tags: string[];
  readonly ambiguities: AmbiguityItem[];
}

// ── Scraping pattern detection ────────────────────────────────────────

/** Patterns indicating credential injection or platform scraping in source files. */
const SCRAPING_PATTERNS = [
  /playwright.*cookie|cookie.*playwright/i,
  /li_at|JSESSIONID|session_cookie/i,
  /linkedin.*scrape|scrape.*linkedin/i,
  /requests\.Session.*[Aa]uth/i,
  /inject.*credential|credential.*inject/i,
] as const;

/**
 * Scan source files in src/, backend/, app/ for behavioral scraping patterns.
 * Reads only the first 100 lines of each file for performance.
 *
 * @param projectDir - Absolute path to the project root
 * @returns True if any scraping pattern is found
 */
export async function scanSourceForSensitivePatterns(
  projectDir: string,
): Promise<boolean> {
  const SOURCE_DIRS = ["src", "backend", "app"];
  const SOURCE_EXT = /\.(py|ts|js)$/;
  for (const dir of SOURCE_DIRS) {
    const dirPath = join(projectDir, dir);
    if (!existsSync(dirPath)) continue;
    try {
      const files = readdirSync(dirPath).filter((f) => SOURCE_EXT.test(f));
      for (const file of files) {
        try {
          const raw = readFileSync(join(dirPath, file), "utf-8");
          const first100 = raw.split("\n").slice(0, 100).join("\n");
          if (SCRAPING_PATTERNS.some((p) => p.test(first100))) return true;
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

// ── Package.json tag inference ────────────────────────────────────────

/**
 * Extract classification tags from a parsed package.json object.
 * Used for both root and subdirectory package.json analysis.
 *
 * @param pkg - Parsed package.json content
 * @returns Set of inferred tags (without UNIVERSAL)
 */
export function inferTagsFromPackageJson(pkg: Record<string, unknown>): Set<string> {
  const found = new Set<string>();
  const allDeps = {
    ...((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
    ...((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}),
  };
  const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());

  if (depNames.some((d) => ["express", "fastify", "koa", "hapi", "@nestjs/core"].includes(d)))
    found.add("API");
  if (depNames.some((d) => ["commander", "yargs", "meow", "@oclif/core", "clipanion"].includes(d)))
    found.add("CLI");
  if (typeof pkg["bin"] === "object" && pkg["bin"] !== null) found.add("CLI");
  if (depNames.some((d) => d.includes("react"))) found.add("WEB-REACT");
  if (depNames.some((d) => ["ethers", "web3", "@ethersproject/providers", "wagmi", "viem"].includes(d)))
    found.add("WEB3");
  if (depNames.some((d) => ["stripe", "braintree", "@paddle/paddle-node-sdk"].includes(d)))
    found.add("FINTECH");
  if (depNames.some((d) => ["react-native", "expo", "@capacitor/core"].includes(d)))
    found.add("MOBILE");
  const MCP_DEPS = ["@modelcontextprotocol/sdk", "@anthropic-ai/sdk"];
  if (depNames.some((d) => MCP_DEPS.some((mcp) => d.includes(mcp)))) {
    found.add("CLI");
    found.add("API");
  }
  const DATABASE_DEPS = ["prisma", "typeorm", "sequelize", "drizzle-orm", "mongoose", "pg", "mysql2", "sqlite3", "knex", "better-sqlite3"];
  if (depNames.some((d) => DATABASE_DEPS.some((db) => d.includes(db)))) found.add("DATABASE");
  const AUTH_DEPS = ["next-auth", "passport", "clerk", "@clerk/nextjs", "@clerk/clerk-sdk-node", "auth0", "jsonwebtoken", "bcrypt", "bcryptjs", "@auth0/nextjs-auth0"];
  if (depNames.some((d) => AUTH_DEPS.some((auth) => d.includes(auth)))) found.add("AUTH");
  return found;
}

// ── Subdirectory analysis ─────────────────────────────────────────────

/** Subdirectories to scan for nested package.json/requirements.txt files. */
const SUBDIRS_TO_SCAN = ["frontend", "backend", "client", "server", "api"] as const;

/**
 * Scan well-known subdirectories for their own package.json / requirements.txt.
 * Mutates tags in place.
 *
 * @param projectDir - Project root
 * @param tags - Tag set to update
 */
export function analyzeSubdirectories(projectDir: string, tags: Set<string>): void {
  for (const subdir of SUBDIRS_TO_SCAN) {
    const subdirPath = join(projectDir, subdir);
    if (!existsSync(subdirPath)) continue;
    const subdirPkgPath = join(subdirPath, "package.json");
    if (existsSync(subdirPkgPath)) {
      try {
        const subPkg = JSON.parse(readFileSync(subdirPkgPath, "utf-8")) as Record<string, unknown>;
        for (const tag of inferTagsFromPackageJson(subPkg)) tags.add(tag);
      } catch { /* skip */ }
    }
    const subdirReqPath = join(subdirPath, "requirements.txt");
    if (existsSync(subdirReqPath)) {
      try {
        const subReqContent = readFileSync(subdirReqPath, "utf-8").toLowerCase();
        if (subReqContent.includes("fastapi")) tags.add("API");
        if (subReqContent.includes("click") || subReqContent.includes("typer")) tags.add("CLI");
        const PY_DB_DEPS = ["sqlalchemy", "psycopg2", "pymongo", "databases", "tortoise-orm"];
        if (PY_DB_DEPS.some((dep) => subReqContent.includes(dep))) tags.add("DATABASE");
      } catch { /* skip */ }
    }
    const subdirPyprojectPath = join(subdirPath, "pyproject.toml");
    if (existsSync(subdirPyprojectPath)) {
      try {
        const subPyContent = readFileSync(subdirPyprojectPath, "utf-8").toLowerCase();
        if (subPyContent.includes("fastapi")) tags.add("API");
        if (subPyContent.includes("click") || subPyContent.includes("typer")) tags.add("CLI");
      } catch { /* skip */ }
    }
  }
  // src/* subdirectory Python package structure
  const srcDir = join(projectDir, "src");
  if (!existsSync(srcDir)) return;
  try {
    for (const entry of readdirSync(srcDir)) {
      const entryPath = join(srcDir, entry);
      try {
        if (!statSync(entryPath).isDirectory()) continue;
        if (existsSync(join(entryPath, "routes")) || existsSync(join(entryPath, "controllers")))
          tags.add("API");
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}
