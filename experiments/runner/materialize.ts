#!/usr/bin/env tsx
/**
 * materialize.ts
 *
 * Extracts code blocks from prompt response markdown files into a real
 * on-disk project structure under experiments/{condition}/output/project/
 *
 * After materialization, run-tests.ts can install deps, run migrations,
 * and execute the real test suite for accurate coverage numbers.
 *
 * Usage:
 *   npx tsx materialize.ts --condition control
 *   npx tsx materialize.ts --condition treatment
 *   npx tsx materialize.ts --condition control --dry-run   # list files found
 *
 * The script also synthesizes a package.json and .env if the model didn't
 * generate them, so the project is always runnable.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const EXPR_DIR   = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Fallback package.json — used if the model didn't generate one
// ---------------------------------------------------------------------------
const FALLBACK_PACKAGE_JSON = (condition: string) => JSON.stringify({
  name:    `conduit-${condition}`,
  version: "1.0.0",
  private: true,
  scripts: {
    build:   "tsc --noEmit",
    start:   "ts-node src/index.ts",
    test:    "jest --runInBand",
    "test:coverage": "jest --runInBand --coverage",
    "db:migrate": "prisma migrate deploy",
    "db:reset":   "prisma migrate reset --force",
  },
  dependencies: {
    "@prisma/client":   "^5.0.0",
    "bcryptjs":         "^2.4.3",
    "express":          "^4.18.2",
    "jsonwebtoken":     "^9.0.0",
    "zod":              "^3.22.0",
  },
  devDependencies: {
    "@types/bcryptjs":     "^2.4.6",
    "@types/express":      "^4.17.21",
    "@types/jest":         "^29.5.0",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/node":         "^22.0.0",
    "@types/supertest":    "^6.0.0",
    "jest":                "^29.7.0",
    "prisma":              "^5.0.0",
    "supertest":           "^6.3.4",
    "ts-jest":             "^29.1.0",
    "ts-node":             "^10.9.2",
    "typescript":          "^5.0.0",
  },
  jest: {
    preset:          "ts-jest",
    testEnvironment: "node",
    setupFilesAfterEach: ["<rootDir>/jest.setup.ts"],
    collectCoverageFrom: [
      "src/**/*.ts",
      "!src/**/*.d.ts",
      "!src/**/index.ts",
    ],
    coverageThresholds: {
      global: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
}, null, 2);

const FALLBACK_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target:           "ES2022",
    module:           "commonjs",
    lib:              ["ES2022"],
    outDir:           "dist",
    rootDir:          "src",
    strict:           true,
    esModuleInterop:  true,
    resolveJsonModule: true,
    skipLibCheck:     true,
  },
  include: ["src/**/*", "jest.setup.ts"],
  exclude: ["node_modules", "dist"],
}, null, 2);

const FALLBACK_JEST_SETUP = `import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});
`;

// ---------------------------------------------------------------------------
// Code block extraction from markdown
// ---------------------------------------------------------------------------
interface CodeBlock {
  filePath: string;
  language: string;
  code:     string;
}

function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  // Accept any language specifier (or none) — models use markdown, text, etc. for non-code files
  const fenceRe = /```(\w+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  // Pre-split into lines for looking up the heading that precedes each block
  const allLines = markdown.split("\n");

  while ((match = fenceRe.exec(markdown)) !== null) {
    const language = match[1] ?? "text";
    const content  = match[2]!;
    const lines    = content.split("\n");

    // --- Strategy 1: file path annotation on the first line of the block ---
    // Accepts: // src/foo.ts | # src/foo.ts | // File: src/foo.ts | path: src/foo.ts
    const firstLine = lines[0]!.trim();
    const pathRe =
      /^(?:\/\/\s*(?:File:\s*)?|#\s*(?:File:\s*)?|path:\s*)([^\s]+\.[a-zA-Z0-9]+)$/i;
    const inlinePathMatch = firstLine.match(pathRe);

    let filePath: string | null = null;
    let code: string;

    if (inlinePathMatch) {
      filePath = inlinePathMatch[1]!;
      code = lines.slice(1).join("\n"); // strip the path annotation line
    } else {
      // --- Strategy 2: scan backwards from the fence opening for a markdown heading ---
      // Find the line number of the opening fence in allLines
      const beforeFence = markdown.slice(0, match.index);
      const openingLineIdx = beforeFence.split("\n").length - 1; // 0-based line index

      // Walk backwards looking for: ### `src/foo.ts` | ### src/foo.ts | **`src/foo.ts`**
      const headingRe = /^#{1,4}\s+[`*]?([^\s`*]+\.[a-zA-Z0-9]+)[`*]?\s*$|^\*\*[`]?([^\s`]+\.[a-zA-Z0-9]+)[`]?\*\*\s*$/;
      for (let i = openingLineIdx - 1; i >= Math.max(0, openingLineIdx - 5); i--) {
        const line = allLines[i]?.trim() ?? "";
        const hm = line.match(headingRe);
        if (hm) {
          filePath = (hm[1] ?? hm[2])!;
          break;
        }
      }
      code = content;
    }

    if (!filePath) continue; // no path found by either strategy — skip

    filePath = filePath
      .replace(/^\.\//, "")          // strip leading ./
      .replace(/\\/g, "/");          // normalise to forward slashes

    blocks.push({ filePath, language, code });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Prisma schema handling
// Treatment: use pre-specified schema. Control: use whatever model generated,
// fall back to the treatment schema if model didn't produce one.
// ---------------------------------------------------------------------------
function resolveSchema(
  condition: string,
  blocks: CodeBlock[],
): { filePath: string; code: string } | null {
  // Check if model generated a schema
  const modelSchema = blocks.find(
    (b) => b.filePath.endsWith("schema.prisma") || b.filePath.includes("prisma/schema"),
  );
  if (modelSchema) return modelSchema;

  // Treatment has a pre-specified schema
  const prespecPath = path.resolve(EXPR_DIR, condition, "prisma/schema.prisma");
  if (fs.existsSync(prespecPath)) {
    return {
      filePath: "prisma/schema.prisma",
      code: fs.readFileSync(prespecPath, "utf-8"),
    };
  }

  // Fall back to treatment schema (same structure)
  const fallbackPath = path.resolve(EXPR_DIR, "treatment/prisma/schema.prisma");
  if (fs.existsSync(fallbackPath)) {
    console.warn("  [WARN] Using treatment schema as fallback (control model did not generate one)");
    return {
      filePath: "prisma/schema.prisma",
      code: fs.readFileSync(fallbackPath, "utf-8"),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Write materialized project
// ---------------------------------------------------------------------------
function writeProject(
  projectDir: string,
  blocks: CodeBlock[],
  condition: string,
  dryRun: boolean,
): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  const writeFile = (filePath: string, content: string): void => {
    if (seen.has(filePath)) {
      // Later response wins — append/replace
      console.log(`  [OVERWRITE] ${filePath}`);
    }
    seen.add(filePath);
    if (dryRun) {
      written.push(filePath);
      return;
    }
    const fullPath = path.join(projectDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    written.push(filePath);
  };

  // Write all code blocks
  for (const block of blocks) {
    writeFile(block.filePath, block.code);
  }

  // Ensure Prisma schema
  const schema = resolveSchema(condition, blocks);
  if (schema && !seen.has(schema.filePath)) {
    writeFile(schema.filePath, schema.code);
  }

  // Synthesize missing scaffold files
  if (!seen.has("package.json")) {
    writeFile("package.json", FALLBACK_PACKAGE_JSON(condition));
    skipped.push("package.json (synthesized)");
  }
  if (!seen.has("tsconfig.json")) {
    writeFile("tsconfig.json", FALLBACK_TSCONFIG);
    skipped.push("tsconfig.json (synthesized)");
  }
  if (!seen.has("jest.setup.ts")) {
    writeFile("jest.setup.ts", FALLBACK_JEST_SETUP);
    skipped.push("jest.setup.ts (synthesized)");
  }

  return { written, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const args      = process.argv.slice(2);
  const flagIdx   = args.indexOf("--condition");
  const condition = flagIdx !== -1 ? args[flagIdx + 1] : undefined;
  const dryRun    = args.includes("--dry-run");

  if (!condition || !["naive", "control", "treatment", "treatment-v2", "treatment-v3", "treatment-v4"].includes(condition)) {
    console.error("Usage: npx tsx materialize.ts --condition naive|control|treatment|treatment-v2|treatment-v3|treatment-v4 [--dry-run]");
    process.exit(2);
  }

  const outputDir  = path.resolve(EXPR_DIR, condition, "output");
  const projectDir = path.join(outputDir, "project");

  if (!fs.existsSync(outputDir)) {
    console.error(`No output directory found for '${condition}'. Run the experiment first.`);
    process.exit(1);
  }

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`  Materializer — ${condition}`);
  console.log(`  Output: ${projectDir}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`════════════════════════════════════════════════════\n`);

  // Read all response markdown in order
  const responses = fs.readdirSync(outputDir)
    .filter((f) => f.endsWith("-response.md"))
    .sort();

  if (responses.length === 0) {
    console.error("No response files found — run the experiment first.");
    process.exit(1);
  }

  console.log(`  Response files: ${responses.join(", ")}\n`);

  const allBlocks: CodeBlock[] = [];
  for (const f of responses) {
    const text   = fs.readFileSync(path.join(outputDir, f), "utf-8");
    const blocks = extractCodeBlocks(text);
    console.log(`  ${f}: ${blocks.length} code blocks`);
    allBlocks.push(...blocks);
  }

  console.log(`\n  Total annotated code blocks: ${allBlocks.length}`);

  if (!dryRun) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const { written, skipped } = writeProject(projectDir, allBlocks, condition, dryRun);

  console.log(`\n  Files written  : ${written.length}`);
  if (skipped.length > 0) {
    console.log(`  Synthesized    : ${skipped.join(", ")}`);
  }

  if (dryRun) {
    console.log("\n  File list:");
    for (const f of written) console.log(`    ${f}`);
  } else {
    console.log(`\n  Project materialized at:\n    ${projectDir}`);
    console.log("\n  Next step:");
    console.log("    npx tsx run-tests.ts --condition " + condition);
  }
  console.log();
}

main();
