/**
 * spec-parser: Extract structured SpecSummary from freeform spec text.
 *
 * Supports structured markdown (headed sections), freeform prose (keyword
 * fallback), and OpenAPI-style descriptions. Also provides directory-based
 * tag inference for existing projects.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────

/**
 * A single ambiguity detected during tag inference or spec parsing.
 * Reports the field in question, the evidence found, and possible interpretations.
 */
export interface AmbiguityItem {
  /** The field or dimension that is ambiguous, e.g. "project_type", "primary_tag", "tech_stack" */
  readonly field: string;
  /** Evidence signals found, e.g. ["no package.json", "markdown files only"] */
  readonly signals: string[];
  /** Possible interpretations with labels, descriptions, and consequences */
  readonly interpretations: ReadonlyArray<{
    readonly label: string;
    readonly description: string;
    readonly consequence: string;
  }>;
}

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

// ── Tag inference keywords ────────────────────────────────────────────

const TAG_KEYWORD_MAP: ReadonlyArray<{
  tag: string;
  keywords: readonly string[];
}> = [
  {
    tag: "API",
    keywords: [
      "api",
      "endpoint",
      "rest",
      "graphql",
      "http",
      "openapi",
      "swagger",
      "routes",
      "controller",
    ],
  },
  {
    tag: "CLI",
    keywords: [
      "cli",
      "command line",
      "terminal",
      "bin",
      "command-line",
      "commander",
      "yargs",
      "argv",
    ],
  },
  {
    tag: "LIBRARY",
    keywords: [
      "library",
      "sdk",
      "package",
      "npm",
      "module",
      "publish",
      "installable",
      "peer dependency",
    ],
  },
  {
    tag: "WEB3",
    keywords: [
      "wallet",
      "token",
      "defi",
      "blockchain",
      "smart contract",
      "crypto",
      "ethereum",
      "solidity",
      "web3",
      "nft",
    ],
  },
  {
    tag: "FINTECH",
    keywords: [
      "payment",
      "invoice",
      "ledger",
      "financial",
      "transaction",
      "budget",
      "billing",
      "stripe",
      "paypal",
      "banking",
    ],
  },
  {
    tag: "MOBILE",
    keywords: [
      "mobile",
      "ios",
      "android",
      "react native",
      "flutter",
      "app store",
      "google play",
    ],
  },
];

// ── Heading extraction ────────────────────────────────────────────────

const HEADING_PATTERNS: ReadonlyArray<{
  key: string;
  patterns: readonly string[];
}> = [
  {
    key: "problem",
    patterns: [
      "## problem",
      "## overview",
      "## background",
      "## context",
      "## about",
    ],
  },
  {
    key: "users",
    patterns: [
      "## users",
      "## user",
      "## target",
      "## audience",
      "## personas",
    ],
  },
  {
    key: "success",
    patterns: [
      "## success",
      "## goals",
      "## goal",
      "## objectives",
      "## objective",
      "## metrics",
    ],
  },
  {
    key: "components",
    patterns: [
      "## components",
      "## component",
      "## architecture",
      "## modules",
      "## module",
      "## services",
      "## service",
    ],
  },
  {
    key: "external",
    patterns: [
      "## external",
      "## integrations",
      "## integration",
      "## dependencies",
      "## apis",
    ],
  },
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
function extractSentencesByKeyword(
  text: string,
  keywords: readonly string[],
): string[] {
  const sentences = text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
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

// ── Spec ambiguity detection ──────────────────────────────────────────

/** Deployment-agnostic terms that signal a project might be a platform/system without specifying how it's deployed. */
const PLATFORM_TERMS = /\b(system|platform)\b/i;

const DEPLOYMENT_TAGS = new Set([
  "CLI",
  "API",
  "LIBRARY",
  "MOBILE",
  "WEB-REACT",
  "WEB-STATIC",
]);

/**
 * Detect ambiguities present in spec text alone.
 *
 * Currently detects:
 * - "system" or "platform" mentioned without any deployment-target tag inferred.
 *
 * @param text - Full spec text
 * @param inferredTags - Tags already inferred from the text
 * @returns Array of detected ambiguity items
 */
function detectSpecAmbiguities(
  text: string,
  inferredTags: string[],
): AmbiguityItem[] {
  const ambiguities: AmbiguityItem[] = [];

  const mentionsPlatform = PLATFORM_TERMS.test(text);
  const hasDeploymentTarget = inferredTags.some((t) => DEPLOYMENT_TAGS.has(t));

  if (mentionsPlatform && !hasDeploymentTarget) {
    const match = text.match(PLATFORM_TERMS);
    ambiguities.push({
      field: "deployment_target",
      signals: [
        `spec mentions "${match?.[0] ?? "system or platform"}" without a clear deployment target`,
      ],
      interpretations: [
        {
          label: "A",
          description: "Command-line tool (tag: CLI)",
          consequence: "CLI cascade applied; terminal UX gates enforced",
        },
        {
          label: "B",
          description: "HTTP API service (tag: API)",
          consequence:
            "API cascade applied; endpoint contracts and behavioral contracts required",
        },
        {
          label: "C",
          description: "Reusable library/package (tag: LIBRARY)",
          consequence:
            "Library cascade applied; public API contracts and versioning required",
        },
      ],
    });
  }

  return ambiguities;
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

  const problem =
    (sections["problem"] ??
      extractSentencesByKeyword(text, [
        "problem",
        "challenge",
        "need",
        "helps",
        "solves",
      ]).join(" ")) ||
    "";

  const users = sections["users"]
    ? extractBulletItems(sections["users"])
    : extractSentencesByKeyword(text, [
        "user",
        "developer",
        "customer",
        "team",
        "company",
      ]);

  const successCriteria = sections["success"]
    ? extractBulletItems(sections["success"])
    : extractSentencesByKeyword(text, [
        "success",
        "goal",
        "objective",
        "metric",
        "measure",
      ]);

  const components = sections["components"]
    ? extractBulletItems(sections["components"])
    : extractSentencesByKeyword(text, [
        "service",
        "module",
        "database",
        "cache",
        "queue",
      ]);

  const externalSystems = sections["external"]
    ? extractBulletItems(sections["external"])
    : extractSentencesByKeyword(text, [
        "api",
        "provider",
        "integration",
        "service",
        "gateway",
      ]).slice(0, 5);

  const inferredTags = inferTagsFromText(text);
  const ambiguities = detectSpecAmbiguities(text, inferredTags);

  return {
    name,
    problem,
    users,
    successCriteria,
    components,
    externalSystems,
    inferredTags,
    ambiguities,
  };
}

// ── Directory-based tag inference ─────────────────────────────────────

/** Keywords that imply sensitive data handling. */
const SENSITIVE_DATA_KEYWORDS: readonly string[] = [
  "health",
  "safety",
  "injury",
  "incident",
  "medical",
  "osha",
  "phi",
  "hipaa",
  "patient",
  "payment",
  "financial",
  "transaction",
  "invoice",
  "banking",
  "fintech",
  "defi",
  "wallet",
  "credit",
  "user profile",
  "personal data",
  "pii",
  "gdpr",
  "employee",
  " hr ",
  "authentication",
  "authorization",
  "credentials",
  "compliance",
  "audit",
];

/** Tags that imply sensitive data. */
const SENSITIVE_TAGS: readonly string[] = [
  "FINTECH",
  "WEB3",
  "HEALTHCARE",
  "HIPAA",
  "SOC2",
  "SOCIAL",
];

/** Patterns indicating credential injection or platform scraping in source files. */
const SCRAPING_PATTERNS = [
  /playwright.*cookie|cookie.*playwright/i,
  /li_at|JSESSIONID|session_cookie/i,
  /linkedin.*scrape|scrape.*linkedin/i,
  /requests\.Session.*[Aa]uth/i,
  /inject.*credential|credential.*inject/i,
] as const;

/**
 * Scan source files in src/, backend/, app/ for behavioral scraping patterns
 * that indicate social platform credential injection or web scraping.
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

/**
 * Infer whether the project handles sensitive data from spec content and tags.
 *
 * @param specSummary - Parsed spec summary
 * @param tags - Project classification tags
 * @returns True if sensitive data patterns detected
 */
export function inferSensitiveData(
  specSummary: SpecSummary,
  tags: string[],
): boolean {
  if (tags.some((t) => SENSITIVE_TAGS.includes(t))) return true;

  const fullText = [
    specSummary.problem,
    specSummary.users.join(" "),
    specSummary.components.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return SENSITIVE_DATA_KEYWORDS.some((keyword) => fullText.includes(keyword));
}

/** Build-system indicator files — presence means a software project is being developed. */
const BUILD_SYSTEM_FILES = [
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
function detectBuildSystemFiles(projectDir: string): string[] {
  return BUILD_SYSTEM_FILES.filter((f) => existsSync(join(projectDir, f)));
}

/**
 * Check whether the project root contains at least one Markdown file.
 *
 * @param projectDir - Absolute path to the project root
 * @returns True if at least one .md file exists directly under projectDir
 */
function hasMarkdownFiles(projectDir: string): boolean {
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

/**
 * Extract classification tags from a parsed package.json object.
 * Used for both root and subdirectory package.json analysis.
 *
 * @param pkg - Parsed package.json content
 * @returns Set of inferred tags (without UNIVERSAL)
 */
function inferTagsFromPackageJson(pkg: Record<string, unknown>): Set<string> {
  const found = new Set<string>();
  const allDeps = {
    ...((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
    ...((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}),
  };
  const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());

  if (
    depNames.some((d) =>
      ["express", "fastify", "koa", "hapi", "@nestjs/core"].includes(d),
    )
  )
    found.add("API");
  if (
    depNames.some((d) =>
      ["commander", "yargs", "meow", "@oclif/core", "clipanion"].includes(d),
    )
  )
    found.add("CLI");
  if (typeof pkg["bin"] === "object" && pkg["bin"] !== null) found.add("CLI");
  if (depNames.some((d) => d.includes("react"))) found.add("WEB-REACT");
  if (
    depNames.some((d) =>
      ["ethers", "web3", "@ethersproject/providers", "wagmi", "viem"].includes(
        d,
      ),
    )
  )
    found.add("WEB3");
  if (
    depNames.some((d) =>
      ["stripe", "braintree", "@paddle/paddle-node-sdk"].includes(d),
    )
  )
    found.add("FINTECH");
  if (
    depNames.some((d) =>
      ["react-native", "expo", "@capacitor/core"].includes(d),
    )
  )
    found.add("MOBILE");
  const MCP_DEPS = ["@modelcontextprotocol/sdk", "@anthropic-ai/sdk"];
  if (depNames.some((d) => MCP_DEPS.some((mcp) => d.includes(mcp)))) {
    found.add("CLI");
    found.add("API");
  }
  const DATABASE_DEPS = [
    "prisma",
    "typeorm",
    "sequelize",
    "drizzle-orm",
    "mongoose",
    "pg",
    "mysql2",
    "sqlite3",
    "knex",
    "better-sqlite3",
  ];
  if (depNames.some((d) => DATABASE_DEPS.some((db) => d.includes(db))))
    found.add("DATABASE");
  const AUTH_DEPS = [
    "next-auth",
    "passport",
    "clerk",
    "@clerk/nextjs",
    "@clerk/clerk-sdk-node",
    "auth0",
    "jsonwebtoken",
    "bcrypt",
    "bcryptjs",
    "@auth0/nextjs-auth0",
  ];
  if (depNames.some((d) => AUTH_DEPS.some((auth) => d.includes(auth))))
    found.add("AUTH");
  return found;
}

/**
 * Infer classification tags by inspecting the project directory structure,
 * package.json dependencies, and existing forgecraft.yaml.
 * Also detects ambiguities when signals conflict or are insufficient.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Inferred tags and detected ambiguities
 */
export async function inferTagsFromDirectory(
  projectDir: string,
): Promise<DirectoryInferenceResult> {
  const tags = new Set<string>(["UNIVERSAL"]);
  const ambiguities: AmbiguityItem[] = [];

  // Track signals for ambiguity reporting
  const cliSignals: string[] = [];
  const librarySignals: string[] = [];
  const apiSignals: string[] = [];

  const buildFiles = detectBuildSystemFiles(projectDir);
  const hasBuildSystem = buildFiles.length > 0;

  // ── No build system: DOCS or early software spec ──────────────────
  if (!hasBuildSystem) {
    if (hasMarkdownFiles(projectDir)) {
      tags.add("DOCS");
      ambiguities.push({
        field: "project_type",
        signals: [
          "no package.json",
          "no requirements.txt",
          "no go.mod",
          "markdown files present",
        ],
        interpretations: [
          {
            label: "A",
            description: "Design specification project (tag: DOCS)",
            consequence:
              "All implementation gates skipped; only spec completeness checked",
          },
          {
            label: "B",
            description:
              "Early-stage software project (no build system set up yet)",
            consequence: "Full cascade applied; implementation gates enforced",
          },
        ],
      });
    }
  }

  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<
        string,
        unknown
      >;
      const allDeps = {
        ...((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
        ...((pkg["devDependencies"] as Record<string, string> | undefined) ??
          {}),
      };
      const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());

      if (
        depNames.some((d) =>
          [
            "express",
            "fastify",
            "koa",
            "hapi",
            "@nestjs/core",
            "fastify",
          ].includes(d),
        )
      ) {
        tags.add("API");
        apiSignals.push("web-framework dependency (express/fastify/koa)");
      }
      if (
        depNames.some((d) =>
          ["commander", "yargs", "meow", "@oclif/core", "clipanion"].includes(
            d,
          ),
        )
      ) {
        tags.add("CLI");
        cliSignals.push("CLI-framework dependency (commander/yargs/meow)");
      }
      if (typeof pkg["bin"] === "object" && pkg["bin"] !== null) {
        tags.add("CLI");
        cliSignals.push("package.json bin field");
      }
      for (const tag of inferTagsFromPackageJson(pkg)) {
        if (!["API", "CLI"].includes(tag)) tags.add(tag); // API/CLI already handled above with signal tracking
      }
      // MCP server: infers CLI + API (with signal tracking)
      const MCP_DEPS = ["@modelcontextprotocol/sdk", "@anthropic-ai/sdk"];
      if (depNames.some((d) => MCP_DEPS.some((mcp) => d.includes(mcp)))) {
        tags.add("CLI");
        tags.add("API");
        cliSignals.push("MCP server dependency (@modelcontextprotocol/sdk)");
        apiSignals.push("MCP server dependency (@modelcontextprotocol/sdk)");
      }
      // Library: only infer when package has 'main' OR 'exports' field (publishable package)
      const hasMain = !!pkg["main"];
      const hasExports = !!pkg["exports"];
      const hasBin = !!pkg["bin"];
      if ((hasMain || hasExports) && !hasBin) {
        tags.add("LIBRARY");
        librarySignals.push(
          hasExports
            ? "package.json exports field (publishable package)"
            : "package.json main field (publishable module)",
        );
      }
    } catch {
      // Malformed package.json — skip
    }
  }

  // Directory structure heuristics
  if (
    existsSync(join(projectDir, "src", "routes")) ||
    existsSync(join(projectDir, "src", "controllers"))
  ) {
    tags.add("API");
    apiSignals.push("src/routes or src/controllers directory");
  }
  if (
    existsSync(join(projectDir, "src", "cli")) ||
    existsSync(join(projectDir, "bin"))
  ) {
    tags.add("CLI");
    cliSignals.push(
      existsSync(join(projectDir, "bin"))
        ? "bin/ directory"
        : "src/cli/ directory",
    );
  }
  // src/index.ts is only a library signal if package.json also has main/exports
  // (directory presence alone is insufficient — apps also have src/lib/)

  // Check for MCP server files in src/
  const srcDir = join(projectDir, "src");
  if (existsSync(srcDir)) {
    try {
      const srcFiles = readdirSync(srcDir);
      if (
        srcFiles.some((f) => f.match(/(-server|-mcp|mcp-|\.mcp)\.(ts|js)$/i))
      ) {
        tags.add("CLI");
        tags.add("API");
        cliSignals.push("MCP server file in src/");
        apiSignals.push("MCP server file in src/");
      }
    } catch {
      /* skip */
    }
  }

  // Check docker-compose for DATABASE
  const composeFile = join(projectDir, "docker-compose.yml");
  const composeYmlFile = join(projectDir, "docker-compose.yaml");
  const composePath = existsSync(composeFile)
    ? composeFile
    : existsSync(composeYmlFile)
      ? composeYmlFile
      : null;
  if (composePath) {
    try {
      const composeContent = readFileSync(composePath, "utf-8").toLowerCase();
      if (/postgres|mysql|mongodb|mongo/.test(composeContent)) {
        tags.add("DATABASE");
      }
    } catch {
      /* skip */
    }
  }

  // Check Python requirements.txt for API/CLI/DATABASE/AUTH (Fix 4)
  const requirementsPath = join(projectDir, "requirements.txt");
  if (existsSync(requirementsPath)) {
    try {
      const reqContent = readFileSync(requirementsPath, "utf-8").toLowerCase();
      if (reqContent.includes("fastapi")) {
        tags.add("API");
        apiSignals.push("fastapi dependency (requirements.txt)");
      }
      if (reqContent.includes("click") || reqContent.includes("typer")) {
        tags.add("CLI");
        cliSignals.push("click/typer dependency (requirements.txt)");
      }
      const PY_DATABASE_DEPS = [
        "sqlalchemy",
        "psycopg2",
        "pymongo",
        "databases",
        "tortoise-orm",
      ];
      if (PY_DATABASE_DEPS.some((dep) => reqContent.includes(dep))) {
        tags.add("DATABASE");
      }
      const PY_AUTH_DEPS = ["python-jose", "passlib", "authlib", "pyjwt"];
      if (PY_AUTH_DEPS.some((dep) => reqContent.includes(dep))) {
        tags.add("AUTH");
      }
    } catch {
      /* skip */
    }
  }

  // Check pyproject.toml for Python framework signals (Fix 4)
  const pyprojectPath = join(projectDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const pyprojectContent = readFileSync(
        pyprojectPath,
        "utf-8",
      ).toLowerCase();
      if (pyprojectContent.includes("fastapi")) {
        tags.add("API");
        apiSignals.push("fastapi dependency (pyproject.toml)");
      }
      if (
        pyprojectContent.includes("click") ||
        pyprojectContent.includes("typer")
      ) {
        tags.add("CLI");
        cliSignals.push("click/typer dependency (pyproject.toml)");
      }
      const PY_DATABASE_DEPS_TOML = [
        "sqlalchemy",
        "psycopg2",
        "pymongo",
        "databases",
        "tortoise-orm",
      ];
      if (PY_DATABASE_DEPS_TOML.some((dep) => pyprojectContent.includes(dep))) {
        tags.add("DATABASE");
      }
    } catch {
      /* skip */
    }
  }

  // Fix 2: Subdirectory package file scanning (frontend/, backend/, client/, server/, api/)
  const SUBDIRS_TO_SCAN = ["frontend", "backend", "client", "server", "api"];
  for (const subdir of SUBDIRS_TO_SCAN) {
    const subdirPath = join(projectDir, subdir);
    if (!existsSync(subdirPath)) continue;
    const subdirPkgPath = join(subdirPath, "package.json");
    if (existsSync(subdirPkgPath)) {
      try {
        const subPkg = JSON.parse(
          readFileSync(subdirPkgPath, "utf-8"),
        ) as Record<string, unknown>;
        for (const tag of inferTagsFromPackageJson(subPkg)) {
          tags.add(tag);
        }
      } catch {
        /* skip */
      }
    }
    const subdirReqPath = join(subdirPath, "requirements.txt");
    if (existsSync(subdirReqPath)) {
      try {
        const subReqContent = readFileSync(
          subdirReqPath,
          "utf-8",
        ).toLowerCase();
        if (subReqContent.includes("fastapi")) tags.add("API");
        if (subReqContent.includes("click") || subReqContent.includes("typer"))
          tags.add("CLI");
        const PY_DB_DEPS = [
          "sqlalchemy",
          "psycopg2",
          "pymongo",
          "databases",
          "tortoise-orm",
        ];
        if (PY_DB_DEPS.some((dep) => subReqContent.includes(dep)))
          tags.add("DATABASE");
      } catch {
        /* skip */
      }
    }
    const subdirPyprojectPath = join(subdirPath, "pyproject.toml");
    if (existsSync(subdirPyprojectPath)) {
      try {
        const subPyContent = readFileSync(
          subdirPyprojectPath,
          "utf-8",
        ).toLowerCase();
        if (subPyContent.includes("fastapi")) tags.add("API");
        if (subPyContent.includes("click") || subPyContent.includes("typer"))
          tags.add("CLI");
      } catch {
        /* skip */
      }
    }
  }

  // Fix 2: src/*/shared|utils|common — Python package structure signals
  const srcDir2 = join(projectDir, "src");
  if (existsSync(srcDir2)) {
    try {
      for (const entry of readdirSync(srcDir2)) {
        const entryPath = join(srcDir2, entry);
        try {
          if (!statSync(entryPath).isDirectory()) continue;
          if (
            existsSync(join(entryPath, "routes")) ||
            existsSync(join(entryPath, "controllers"))
          ) {
            tags.add("API");
            apiSignals.push(
              `Python package structure: src/${entry}/routes|controllers`,
            );
          }
          if (
            existsSync(join(entryPath, "shared")) ||
            existsSync(join(entryPath, "utils")) ||
            existsSync(join(entryPath, "common"))
          ) {
            librarySignals.push(
              `Shared module structure: src/${entry}/shared|utils|common`,
            );
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  }

  // Behavioral scraping pattern detection → SOCIAL tag (Fix 3)
  const hasScrapingPatterns = await scanSourceForSensitivePatterns(projectDir);
  if (hasScrapingPatterns) {
    tags.add("SOCIAL");
  }

  // ── Tech stack conflict: Python build + TypeScript src ────────────
  const hasPythonBuild =
    existsSync(join(projectDir, "requirements.txt")) ||
    existsSync(join(projectDir, "pyproject.toml"));
  const hasTypeScriptSrc =
    existsSync(join(projectDir, "src")) &&
    (existsSync(join(projectDir, "tsconfig.json")) ||
      existsSync(join(projectDir, "src", "index.ts")));
  if (hasPythonBuild && hasTypeScriptSrc) {
    ambiguities.push({
      field: "tech_stack",
      signals: [
        "Python build system (requirements.txt/pyproject.toml)",
        "TypeScript src files detected",
      ],
      interpretations: [
        {
          label: "A",
          description:
            "Python project with TypeScript frontend/tooling (primary: Python)",
          consequence:
            "Python-oriented gates applied; TypeScript treated as build tooling",
        },
        {
          label: "B",
          description:
            "TypeScript project with Python scripts/utilities (primary: TypeScript)",
          consequence:
            "TypeScript gates applied; Python treated as supplementary tooling",
        },
      ],
    });
  }

  // ── Multiple strong tag signals — primary type ambiguity ─────────
  if (tags.has("CLI") && tags.has("API")) {
    ambiguities.push({
      field: "primary_tag",
      signals: [...cliSignals, ...apiSignals],
      interpretations: [
        {
          label: "A",
          description: "Primarily a CLI tool (tag: CLI)",
          consequence: "CLI cascade applied; API-specific gates optional",
        },
        {
          label: "B",
          description: "Primarily an HTTP API (tag: API)",
          consequence: "API cascade applied; all endpoint contracts required",
        },
        {
          label: "C",
          description: "Hybrid CLI+API project (tags: CLI, API)",
          consequence: "Most restrictive cascade applied; all steps required",
        },
      ],
    });
  } else if (tags.has("CLI") && tags.has("LIBRARY")) {
    ambiguities.push({
      field: "primary_tag",
      signals: [...cliSignals, ...librarySignals],
      interpretations: [
        {
          label: "A",
          description:
            "Primarily a CLI tool that ships an executable (tag: CLI)",
          consequence:
            "CLI cascade applied; library-specific contracts optional",
        },
        {
          label: "B",
          description:
            "Primarily a reusable library that includes a CLI (tag: LIBRARY)",
          consequence:
            "Library cascade applied; public API contracts and versioning required",
        },
        {
          label: "C",
          description: "Dual-purpose CLI+library package (tags: CLI, LIBRARY)",
          consequence: "Most restrictive cascade applied; all steps required",
        },
      ],
    });
  }

  // Respect any existing forgecraft.yaml tags
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (existsSync(yamlPath)) {
    try {
      const config = JSON.parse(
        JSON.stringify(
          await import("js-yaml").then((m) =>
            m.load(readFileSync(yamlPath, "utf-8")),
          ),
        ),
      ) as Record<string, unknown>;
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

  return { tags: Array.from(tags), ambiguities };
}

/**
 * Find the richest existing spec file in the project (not PRD/TechSpec).
 * Returns the path of the largest markdown file that:
 * - Contains more than 500 characters
 * - Is NOT already docs/PRD.md or docs/TechSpec.md
 * - Matches: docs\/**\/*.md, README.md, *-spec.md patterns
 *
 * @param projectDir - Absolute project root path
 * @returns Absolute path to richest spec file, or null if none found
 */
export function findRichestSpecFile(projectDir: string): string | null {
  const candidates: string[] = [];

  /**
   * Collect all .md files under a directory up to maxDepth levels deep.
   * Prioritises spec-named subdirectories (specs/, spec/, system/, requirements/).
   */
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
    } catch {
      // skip unreadable dirs
    }
  }

  // Search docs/ recursively up to 3 levels (covers docs/specs/system/*.md)
  collectMarkdownFiles(join(projectDir, "docs"), 3);

  // Search project root .md files
  try {
    const rootFiles = readdirSync(projectDir);
    for (const file of rootFiles) {
      if (file.endsWith(".md") || file === "README.md") {
        candidates.push(join(projectDir, file));
      }
    }
  } catch {
    // skip
  }

  const EXCLUDED_NAMES = new Set([
    "PRD.md",
    "TechSpec.md",
    "Status.md",
    "CLAUDE.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
  ]);
  const MIN_CONTENT_LENGTH = 500;

  let richest: { path: string; size: number } | null = null;

  for (const candidate of candidates) {
    const filename = candidate.split(/[/\\]/).pop() ?? "";
    if (EXCLUDED_NAMES.has(filename)) continue;

    try {
      const content = readFileSync(candidate, "utf-8");
      if (content.length > MIN_CONTENT_LENGTH) {
        if (!richest || content.length > richest.size) {
          richest = { path: candidate, size: content.length };
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  return richest?.path ?? null;
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
