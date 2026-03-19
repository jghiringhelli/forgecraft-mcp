/**
 * Template placeholder resolver.
 *
 * Resolves {{repo_url}}, {{framework}}, {{domain}}, {{sensitive_data}}
 * placeholders in generated template strings. Falls back gracefully
 * with FILL markers when values cannot be auto-detected.
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import type { SpecSummary } from "../tools/spec-parser.js";

/** Context used for placeholder resolution. */
export interface PlaceholderContext {
  readonly projectName?: string;
  /** From: git remote get-url origin */
  readonly repoUrl?: string;
  /** From: package.json dependencies */
  readonly framework?: string;
  /** From: spec summary or tag names */
  readonly domain?: string;
  /** From: sensitive data detection */
  readonly sensitiveData?: string;
  readonly tags?: string[];
}

/** TypeScript/JavaScript framework detection patterns. */
const TS_FRAMEWORK_MAP: ReadonlyArray<{ packages: readonly string[]; name: string }> = [
  { packages: ["next"], name: "Next.js" },
  { packages: ["@remix-run/react"], name: "Remix" },
  { packages: ["nuxt"], name: "Nuxt" },
  { packages: ["fastify"], name: "Fastify" },
  { packages: ["express"], name: "Express" },
  { packages: ["@nestjs/core", "nestjs"], name: "NestJS" },
  { packages: ["hono"], name: "Hono" },
];

/** Tag-to-domain mapping for domain inference. */
const TAG_DOMAIN_MAP: ReadonlyArray<{ tags: readonly string[]; domain: string }> = [
  { tags: ["FINTECH"], domain: "financial technology" },
  { tags: ["WEB3"], domain: "blockchain/DeFi" },
  { tags: ["HEALTHCARE", "HIPAA"], domain: "healthcare" },
  { tags: ["INFRA"], domain: "infrastructure" },
  { tags: ["ML"], domain: "machine learning" },
];

/**
 * Resolve the repository URL from git remote or package.json fallback.
 *
 * @param projectDir - Absolute project root path
 * @returns Resolved URL or FILL marker
 */
function resolveRepoUrl(projectDir: string): string {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: projectDir,
      timeout: 5_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (url) {
      const httpsUrl = url.startsWith("git@")
        ? url.replace("git@", "https://").replace(":", "/").replace(/\.git$/, "")
        : url.replace(/\.git$/, "");
      return httpsUrl;
    }
  } catch {
    // fall through
  }

  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      const repo = pkg["repository"];
      if (typeof repo === "string") return repo;
      if (typeof repo === "object" && repo !== null) {
        const repoObj = repo as Record<string, unknown>;
        if (typeof repoObj["url"] === "string") {
          return (repoObj["url"] as string).replace(/^git\+/, "").replace(/\.git$/, "");
        }
      }
    } catch {
      // skip
    }
  }

  return "<!-- FILL: add your repository URL -->";
}

/**
 * Resolve the primary framework from package.json dependencies.
 *
 * @param projectDir - Absolute project root path
 * @returns Framework name or undefined if not detected
 */
function resolveFramework(projectDir: string): string | undefined {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return undefined;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const allDeps = {
      ...((pkg["dependencies"] as Record<string, string> | undefined) ?? {}),
      ...((pkg["devDependencies"] as Record<string, string> | undefined) ?? {}),
    };
    const depNames = Object.keys(allDeps);
    for (const pattern of TS_FRAMEWORK_MAP) {
      if (pattern.packages.some((p) => depNames.includes(p))) {
        return pattern.name;
      }
    }
  } catch {
    // skip
  }
  return undefined;
}

/**
 * Resolve the project domain from spec summary or tag names.
 *
 * @param specSummary - Optional parsed spec summary
 * @param tags - Project classification tags
 * @returns Domain string or undefined
 */
function resolveDomain(specSummary?: SpecSummary, tags?: string[]): string | undefined {
  if (specSummary?.problem) {
    const excerpt = specSummary.problem.replace(/\n/g, " ").slice(0, 60).trim();
    if (excerpt.length > 10) return excerpt;
  }

  if (tags && tags.length > 0) {
    for (const mapping of TAG_DOMAIN_MAP) {
      if (mapping.tags.some((t) => tags.includes(t))) {
        return mapping.domain;
      }
    }
    const significantTags = tags.filter((t) => t !== "UNIVERSAL");
    if (significantTags.length > 0) {
      return significantTags.join(", ").toLowerCase();
    }
  }
  return undefined;
}

/**
 * Build a PlaceholderContext by auto-detecting project properties.
 *
 * @param projectDir - Absolute project root path
 * @param specSummary - Optional parsed spec for domain extraction
 * @param tags - Project classification tags
 * @returns Resolved placeholder context
 */
export function buildPlaceholderContext(
  projectDir: string,
  specSummary?: SpecSummary,
  tags?: string[],
): PlaceholderContext {
  return {
    repoUrl: resolveRepoUrl(projectDir),
    framework: resolveFramework(projectDir),
    domain: resolveDomain(specSummary, tags),
    sensitiveData: undefined, // resolved separately via inferSensitiveData
    tags,
  };
}

/**
 * Resolve template placeholders in a string.
 *
 * Replaces {{repo_url}}, {{framework}}, {{domain}}, {{sensitive_data}}
 * with resolved values from the context. Leaves other {{...}} markers
 * untouched so the existing renderTemplate handles them.
 *
 * @param content - Template string with {{placeholder}} markers
 * @param context - Resolved placeholder values
 * @returns Content with placeholders substituted
 */
export function resolveTemplatePlaceholders(
  content: string,
  context: PlaceholderContext,
): string {
  let result = content;

  const repoUrl = context.repoUrl ?? "<!-- FILL: add your repository URL -->";
  result = result.replace(/\{\{repo_url\}\}/g, repoUrl);

  if (context.framework) {
    result = result.replace(/\{\{framework\}\}/g, context.framework);
  } else {
    result = result.replace(/^.*\{\{framework\}\}.*\n?/gm, "");
  }

  if (context.domain) {
    result = result.replace(/\{\{domain\}\}/g, context.domain);
  } else {
    result = result.replace(/\{\{domain\}\}/g, "<!-- FILL: describe the project domain -->");
  }

  if (context.sensitiveData) {
    result = result.replace(/\{\{sensitive_data\}\}/g, context.sensitiveData);
  }

  return result;
}
