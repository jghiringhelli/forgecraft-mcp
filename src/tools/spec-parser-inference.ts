/**
 * spec-parser-inference: Core inferTagsFromDirectory logic with analysis helpers.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AmbiguityItem } from "./spec-parser-tags.js";
import {
  detectBuildSystemFiles,
  hasMarkdownFiles,
  inferTagsFromPackageJson,
  scanSourceForSensitivePatterns,
  analyzeSubdirectories,
} from "./spec-parser-directory.js";
import type { DirectoryInferenceResult } from "./spec-parser-directory.js";
// ── Root package.json analysis ────────────────────────────────────────

/**
 * Analyze root-level package.json for tag signals, then check directory structure.
 * Mutates tags and signal arrays in place.
 */
export function analyzeRootPackageJson(
  projectDir: string,
  tags: Set<string>,
  cliSignals: string[],
  apiSignals: string[],
  librarySignals: string[],
): void {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const allDeps = {
      ...((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
      ...((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}),
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
        ["commander", "yargs", "meow", "@oclif/core", "clipanion"].includes(d),
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
      if (!["API", "CLI"].includes(tag)) tags.add(tag);
    }
    const MCP_DEPS = ["@modelcontextprotocol/sdk", "@anthropic-ai/sdk"];
    if (depNames.some((d) => MCP_DEPS.some((mcp) => d.includes(mcp)))) {
      tags.add("CLI");
      tags.add("API");
      cliSignals.push("MCP server dependency (@modelcontextprotocol/sdk)");
      apiSignals.push("MCP server dependency (@modelcontextprotocol/sdk)");
    }
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
    /* Malformed package.json — skip */
  }

  // Directory structure heuristics — run after package.json analysis
}

/**
 * Apply directory structure heuristics for API/CLI tag inference.
 * Called unconditionally — does not require a package.json.
 *
 * @param projectDir - Project root
 * @param tags - Tag set to update
 * @param cliSignals - CLI signal accumulator
 * @param apiSignals - API signal accumulator
 */
export function analyzeDirectoryStructure(
  projectDir: string,
  tags: Set<string>,
  cliSignals: string[],
  apiSignals: string[],
): void {
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
  // MCP server files in src/
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
      if (/postgres|mysql|mongodb|mongo/.test(composeContent))
        tags.add("DATABASE");
    } catch {
      /* skip */
    }
  }
}

// ── Python project analysis ───────────────────────────────────────────

/**
 * Analyze Python build files (requirements.txt, pyproject.toml) for tag signals.
 * Mutates tags and signal arrays in place.
 */
export function analyzePythonProject(
  projectDir: string,
  tags: Set<string>,
  cliSignals: string[],
  apiSignals: string[],
): void {
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
      if (PY_DATABASE_DEPS.some((dep) => reqContent.includes(dep)))
        tags.add("DATABASE");
      const PY_AUTH_DEPS = ["python-jose", "passlib", "authlib", "pyjwt"];
      if (PY_AUTH_DEPS.some((dep) => reqContent.includes(dep)))
        tags.add("AUTH");
    } catch {
      /* skip */
    }
  }
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
      if (PY_DATABASE_DEPS_TOML.some((dep) => pyprojectContent.includes(dep)))
        tags.add("DATABASE");
    } catch {
      /* skip */
    }
  }
}

// ── Ambiguity builders ────────────────────────────────────────────────

/**
 * Build tag ambiguities for a project based on detected signals and tag combinations.
 *
 * @returns Array of detected ambiguity items
 */
export function buildTagAmbiguities(
  tags: Set<string>,
  cliSignals: string[],
  apiSignals: string[],
  librarySignals: string[],
  hasPythonBuild: boolean,
  hasTypeScriptSrc: boolean,
  projectDir: string,
): AmbiguityItem[] {
  const ambiguities: AmbiguityItem[] = [];

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

  void projectDir; // reserved for future use
  return ambiguities;
}

// ── Forgecraft YAML tag loader ────────────────────────────────────────

/**
 * Load existing tags from forgecraft.yaml into the tags set.
 * Uses dynamic import to avoid circular dependency with js-yaml.
 *
 * @param projectDir - Project root
 * @param tags - Tag set to update
 */
async function loadForgecraftYamlTags(
  projectDir: string,
  tags: Set<string>,
): Promise<void> {
  const yamlPath = join(projectDir, "forgecraft.yaml");
  if (!existsSync(yamlPath)) return;
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
    /* Invalid yaml — skip */
  }
}

// ── Main entry point ──────────────────────────────────────────────────

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
  const cliSignals: string[] = [];
  const librarySignals: string[] = [];
  const apiSignals: string[] = [];

  const buildFiles = detectBuildSystemFiles(projectDir);
  const hasBuildSystem = buildFiles.length > 0;

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

  analyzeRootPackageJson(
    projectDir,
    tags,
    cliSignals,
    apiSignals,
    librarySignals,
  );
  analyzeDirectoryStructure(projectDir, tags, cliSignals, apiSignals);
  analyzePythonProject(projectDir, tags, cliSignals, apiSignals);
  analyzeSubdirectories(projectDir, tags);

  const hasScrapingPatterns = await scanSourceForSensitivePatterns(projectDir);
  if (hasScrapingPatterns) tags.add("SOCIAL");

  const hasPythonBuild =
    existsSync(join(projectDir, "requirements.txt")) ||
    existsSync(join(projectDir, "pyproject.toml"));
  const hasTypeScriptSrc =
    existsSync(join(projectDir, "src")) &&
    (existsSync(join(projectDir, "tsconfig.json")) ||
      existsSync(join(projectDir, "src", "index.ts")));

  const tagAmbiguities = buildTagAmbiguities(
    tags,
    cliSignals,
    apiSignals,
    librarySignals,
    hasPythonBuild,
    hasTypeScriptSrc,
    projectDir,
  );
  ambiguities.push(...tagAmbiguities);

  await loadForgecraftYamlTags(projectDir, tags);

  return { tags: Array.from(tags), ambiguities };
}
