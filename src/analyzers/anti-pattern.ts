/**
 * Anti-pattern detector.
 *
 * Scans source files for production code anti-patterns:
 * hardcoded values, mock data in source, monolith files, etc.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createLogger } from "../shared/logger/index.js";
import { listAllFiles } from "./folder-structure.js";
import type { AuditCheck } from "../shared/types.js";

const logger = createLogger("analyzers/anti-pattern");

/** Anti-pattern scan configuration. */
interface ScanConfig {
  readonly maxFileLength: number;
  readonly maxFunctionParams: number;
}

const DEFAULT_CONFIG: ScanConfig = {
  maxFileLength: 300,
  maxFunctionParams: 5,
};

/**
 * Scan project source files for anti-patterns.
 */
export function scanAntiPatterns(
  projectDir: string,
  config: Partial<ScanConfig> = {},
): { violations: AuditCheck[]; warnings: AuditCheck[] } {
  const cfg: ScanConfig = { ...DEFAULT_CONFIG, ...config };
  const violations: AuditCheck[] = [];
  const warnings: AuditCheck[] = [];

  const allFiles = listAllFiles(projectDir);
  const sourceFiles = allFiles.filter((f) => isSourceFile(f) && !isTestFile(f));

  logger.info("Scanning for anti-patterns", {
    totalFiles: allFiles.length,
    sourceFiles: sourceFiles.length,
  });

  for (const relPath of sourceFiles) {
    const fullPath = join(projectDir, relPath);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      // Check file length
      if (lines.length > cfg.maxFileLength) {
        warnings.push({
          check: "file_length",
          message: `${relPath}: ${lines.length} lines (max ${cfg.maxFileLength}). Consider splitting.`,
          severity: "warning",
        });
      }

      // Check for hardcoded URLs (skip config files)
      if (!isConfigFile(relPath)) {
        const urlMatches = findPattern(
          lines,
          /(localhost|127\.0\.0\.1|0\.0\.0\.0)/,
          // Exclude: comments, test/spec/mock paths, regex literals,
          // JS/TS env-var fallback defaults (process.env.X ?? 'localhost'),
          // and Python env-var fallback defaults (os.environ.get("X", "localhost"))
          /^\s*(\/\/|\/\*|\*|#)|test|spec|mock|\/\(.*localhost|\?\?.*['"`]|os\.environ|os\.getenv|environ\.get/i,
        );
        if (urlMatches.length > 0) {
          violations.push({
            check: "hardcoded_url",
            message: `${relPath}: hardcoded URL/host at line(s) ${urlMatches.join(", ")}. Use config/env vars.`,
            severity: "error",
          });
        }
      }

      // Check for mock/stub data in production code
      const mockMatches = findPattern(
        lines,
        /\b(mock_data|fake_data|dummy_data|stub_response|FIXME.*return|TODO.*hardcod)/i,
        // Exclude: lines that are regex literal patterns or new RegExp constructs
        /\/\\b\(|\/\(|new RegExp/i,
      );
      if (mockMatches.length > 0) {
        violations.push({
          check: "mock_in_source",
          message: `${relPath}: mock/stub/fake data at line(s) ${mockMatches.join(", ")}. Remove from production code.`,
          severity: "error",
        });
      }

      // Check for bare exception catches (TypeScript)
      if (relPath.endsWith(".ts") || relPath.endsWith(".js")) {
        const bareCatches = findPattern(lines, /catch\s*\(\s*\)\s*\{/);
        if (bareCatches.length > 0) {
          warnings.push({
            check: "bare_exception",
            message: `${relPath}: bare catch() at line(s) ${bareCatches.join(", ")}. Use typed error handling.`,
            severity: "warning",
          });
        }
      }

      // Check for hardcoded credentials
      const credMatches = findPattern(
        lines,
        /(password|secret|api_key|token)\s*[:=]\s*['"][^'"]{3,}/i,
        /env|config|example|template|schema|type|interface|\/\//i,
      );
      if (credMatches.length > 0) {
        violations.push({
          check: "hardcoded_credential",
          message: `${relPath}: possible hardcoded credential at line(s) ${credMatches.join(", ")}.`,
          severity: "error",
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  checkRedundantDeployPipeline(projectDir, warnings);

  logger.info("Anti-pattern scan complete", {
    violations: violations.length,
    warnings: warnings.length,
  });

  return { violations, warnings };
}

/** Platform deploy config filenames that indicate Railway/Vercel/Fly/Render deploys. */
const PLATFORM_DEPLOY_CONFIGS = [
  "railway.toml",
  "railway.json",
  "vercel.json",
  "fly.toml",
  "render.yaml",
  "render.yml",
] as const;

/**
 * Warn when a project has both a platform deploy config and .github/workflows/.
 * Both will trigger on push — the CI/CD is duplicated and one should be removed.
 */
function checkRedundantDeployPipeline(
  projectDir: string,
  warnings: AuditCheck[],
): void {
  const hasPlatformConfig = PLATFORM_DEPLOY_CONFIGS.some((f) =>
    existsSync(join(projectDir, f)),
  );
  if (!hasPlatformConfig) return;

  const hasGithubWorkflows = existsSync(
    join(projectDir, ".github", "workflows"),
  );
  if (!hasGithubWorkflows) return;

  const platformFile = PLATFORM_DEPLOY_CONFIGS.find((f) =>
    existsSync(join(projectDir, f)),
  ) as string;

  warnings.push({
    check: "redundant_deploy_pipeline",
    message: `${platformFile} and .github/workflows/ both exist. Platform deploy (Railway/Vercel/Fly/Render) and GitHub Actions may both trigger on push — remove the redundant pipeline.`,
    severity: "warning",
  });
}

/**
 * Check if a file is a source code file.
 */
function isSourceFile(filePath: string): boolean {
  const ext = extname(filePath);
  return [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".kt", ".rs"].includes(
    ext,
  );
}

/**
 * Check if a file is a test file.
 */
function isTestFile(filePath: string): boolean {
  return /(\btest[_.]|\.test\.|\.spec\.|__tests__|tests[/\\]|test[/\\]|fixtures[/\\]|mock|conftest|\.d\.ts)/.test(
    filePath,
  );
}

/**
 * Check if a file is a config file.
 */
function isConfigFile(filePath: string): boolean {
  return /(config|settings|\.env|\.yaml|\.yml|\.json|\.toml)/.test(filePath);
}

/**
 * Find lines matching a pattern, optionally excluding lines matching an exclude pattern.
 * Returns array of 1-based line numbers.
 */
function findPattern(
  lines: string[],
  pattern: RegExp,
  excludePattern?: RegExp,
): number[] {
  const matches: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (pattern.test(line)) {
      if (!excludePattern || !excludePattern.test(line)) {
        matches.push(i + 1);
      }
    }
  }

  return matches;
}
