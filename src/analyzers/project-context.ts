/**
 * Project context detector.
 *
 * Auto-fills RenderContext fields from the project filesystem and
 * optional description. Resolves {{repo_url}}, {{framework}}, {{domain}},
 * and {{sensitive_data}} placeholders that would otherwise remain unsubstituted.
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createLogger } from "../shared/logger/index.js";
import type { RenderContext } from "../registry/renderer.js";
import type { Tag } from "../shared/types.js";

const logger = createLogger("analyzers/project-context");

/**
 * Detect project context from filesystem and optional description.
 * Auto-fills RenderContext fields for template variable substitution.
 * Falls back gracefully — returns partial context, never throws.
 *
 * @param projectDir - Absolute path to project root
 * @param projectName - Known project name
 * @param language - Detected language
 * @param tags - Active tags
 * @param description - Optional project description for domain extraction
 * @returns Populated render context
 */
export function detectProjectContext(
  projectDir: string,
  projectName: string,
  language: string,
  tags: Tag[],
  description?: string,
): RenderContext {
  const repoUrl = detectRepoUrl(projectDir);
  const framework = detectFramework(projectDir, language);
  const domain = description ?? undefined;
  const sensitiveData = detectSensitiveData(tags);

  logger.info("Project context detected", {
    projectDir,
    repoUrl: repoUrl ? "detected" : "not found",
    framework: framework ?? "not detected",
    hasDomain: !!domain,
    sensitiveData,
  });

  return {
    projectName,
    language,
    tags,
    repoUrl,
    framework,
    domain,
    sensitiveData,
  };
}

/**
 * Detect the git remote URL for the project.
 */
function detectRepoUrl(projectDir: string): string {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: projectDir,
      timeout: 5_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Convert SSH URLs to HTTPS for display
    if (url.startsWith("git@")) {
      return url
        .replace("git@", "https://")
        .replace(":", "/")
        .replace(/\.git$/, "");
    }

    return url.replace(/\.git$/, "");
  } catch {
    return "";
  }
}

/**
 * Detect the primary framework from project config files.
 */
function detectFramework(
  projectDir: string,
  language: string,
): string | undefined {
  if (language === "typescript") {
    return detectTypeScriptFramework(projectDir);
  }
  if (language === "python") {
    return detectPythonFramework(projectDir);
  }
  return undefined;
}

/** Framework patterns for TypeScript/JavaScript projects. */
const TS_FRAMEWORK_PATTERNS: Array<{ packages: string[]; name: string }> = [
  { packages: ["next"], name: "Next.js" },
  { packages: ["@remix-run/react"], name: "Remix" },
  { packages: ["nuxt"], name: "Nuxt" },
  { packages: ["@angular/core"], name: "Angular" },
  { packages: ["vue"], name: "Vue" },
  { packages: ["svelte"], name: "Svelte" },
  { packages: ["fastify"], name: "Fastify" },
  { packages: ["express"], name: "Express" },
  { packages: ["nestjs", "@nestjs/core"], name: "NestJS" },
  { packages: ["hono"], name: "Hono" },
  { packages: ["react"], name: "React" },
];

/**
 * Detect TypeScript framework from package.json dependencies.
 */
function detectTypeScriptFramework(projectDir: string): string | undefined {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as Record<string, unknown>;
    const allDeps = {
      ...(pkg["dependencies"] as Record<string, string> | undefined),
      ...(pkg["devDependencies"] as Record<string, string> | undefined),
    };
    const depNames = Object.keys(allDeps);

    for (const pattern of TS_FRAMEWORK_PATTERNS) {
      if (pattern.packages.some((p) => depNames.includes(p))) {
        return pattern.name;
      }
    }
  } catch {
    // Invalid package.json — skip
  }

  return undefined;
}

/** Framework patterns for Python projects. */
const PY_FRAMEWORK_PATTERNS: Array<{ keyword: string; name: string }> = [
  { keyword: "fastapi", name: "FastAPI" },
  { keyword: "django", name: "Django" },
  { keyword: "flask", name: "Flask" },
  { keyword: "streamlit", name: "Streamlit" },
  { keyword: "gradio", name: "Gradio" },
  { keyword: "pytorch", name: "PyTorch" },
  { keyword: "torch", name: "PyTorch" },
  { keyword: "tensorflow", name: "TensorFlow" },
  { keyword: "pandas", name: "Pandas" },
  { keyword: "prefect", name: "Prefect" },
  { keyword: "airflow", name: "Airflow" },
];

/**
 * Detect Python framework from pyproject.toml or requirements.txt.
 */
function detectPythonFramework(projectDir: string): string | undefined {
  // Try pyproject.toml first
  const pyprojectPath = join(projectDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8").toLowerCase();
      for (const pattern of PY_FRAMEWORK_PATTERNS) {
        if (content.includes(pattern.keyword)) {
          return pattern.name;
        }
      }
    } catch {
      // skip
    }
  }

  // Try requirements.txt
  const reqPath = join(projectDir, "requirements.txt");
  if (existsSync(reqPath)) {
    try {
      const content = readFileSync(reqPath, "utf-8").toLowerCase();
      for (const pattern of PY_FRAMEWORK_PATTERNS) {
        if (content.includes(pattern.keyword)) {
          return pattern.name;
        }
      }
    } catch {
      // skip
    }
  }

  return undefined;
}

/**
 * Determine sensitive data flag from active tags.
 */
function detectSensitiveData(tags: Tag[]): string {
  const sensitiveTags: Tag[] = ["HEALTHCARE", "HIPAA", "FINTECH", "SOC2"];
  return tags.some((t) => sensitiveTags.includes(t)) ? "YES" : "NO";
}
