/**
 * check-cascade-contracts: Step 4-5 checkers for the GS initialization cascade.
 *
 * Checks ADRs (step 4) and behavioral contracts/use cases (step 5).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  isStub,
  detectUnsafeDeserializationCast,
  ADR_DIRS,
  USE_CASE_PATHS,
  PYTHON_PACKAGE_FILES,
} from "./check-cascade-steps.js";

// ── Schema Paths ─────────────────────────────────────────────────────

/** Canonical locations for schema artifacts (DB, API, event schemas). */
export const SCHEMA_ARTIFACT_PATHS = [
  "prisma/schema.prisma",
  "openapi.yaml",
  "openapi.yml",
  "openapi.json",
  "api-spec.yaml",
  "api-spec.yml",
  "api-spec.json",
  "schema.graphql",
  "docs/schema.md",
  "docs/schemas",
  "src/schema",
  "src/schemas",
  "schemas",
  "database/schema.sql",
  "db/schema.sql",
  "db/schema.rb",
] as const;
import type { CascadeStep } from "./check-cascade-steps.js";

/**
 * Scan docs/ for a file matching *spec*, *contract*, or *use-case* patterns.
 *
 * @param projectDir - Absolute project root
 * @returns Relative path to matching file, or null if none found
 */
export function findBehavioralContractFallback(
  projectDir: string,
): string | null {
  const docsDir = join(projectDir, "docs");
  if (!existsSync(docsDir)) return null;
  try {
    const files = readdirSync(docsDir);
    const fallback = files.find(
      (f) => f.endsWith(".md") && /spec|contract|use.?case/i.test(f),
    );
    return fallback ? `docs/${fallback}` : null;
  } catch {
    return null;
  }
}

/**
 * Detect a placeholder test script in package.json.
 *
 * @param projectDir - Absolute project root
 * @returns The placeholder test script value, or null if none
 */
export function detectPlaceholderTestScript(projectDir: string): string | null {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const scripts = pkg["scripts"] as Record<string, string> | undefined;
    const testScript = scripts?.["test"];
    if (testScript && /echo.*no test|echo.*exit 0|true$/i.test(testScript)) {
      return testScript;
    }
  } catch {
    /* skip */
  }
  return null;
}

/**
 * Step 4: ADRs — at least one non-obvious architectural decision recorded.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
export function checkAdrs(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What is the most important architectural decision made so far?",
    "What alternatives did you consider and why did you reject them?",
  ] as const;

  for (const dir of ADR_DIRS) {
    const fullDir = join(projectDir, dir);
    if (existsSync(fullDir) && statSync(fullDir).isDirectory()) {
      const adrs = readdirSync(fullDir).filter(
        (f) =>
          f.endsWith(".md") &&
          f.toLowerCase() !== "readme.md" &&
          /^(adr[-_]?\d|\d{1,4}[-_])/i.test(f),
      );
      if (adrs.length > 0) {
        return {
          step: 4,
          name: "Architecture Decision Records",
          status: "PASS",
          detail: `${adrs.length} ADR(s) in ${dir}/ (${adrs.slice(0, 3).join(", ")}${adrs.length > 3 ? ", …" : ""})`,
          questions: [],
        };
      }
    }
  }
  return {
    step: 4,
    name: "Architecture Decision Records",
    status: "FAIL",
    detail:
      "No ADRs found in docs/adrs/ or docs/adr/. README.md alone does not count — an ADR-NNN-*.md file is required.",
    action:
      "Write at least one ADR named ADR-NNN-description.md (e.g. ADR-001-tech-stack.md) recording the primary architectural decision. " +
      "An unrecorded decision is a grammar gap — the AI will treat it as a defect to correct.",
    questions: STEP_QUESTIONS,
  };
}

/**
 * Step 5: Use cases or behavioral contracts.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
export function checkBehavioralContracts(projectDir: string): CascadeStep {
  const STEP_QUESTIONS = [
    "What are the top 3 actions a user must be able to perform?",
    "What is the precondition and success outcome for each action?",
  ] as const;

  const placeholderScript = detectPlaceholderTestScript(projectDir);
  if (placeholderScript) {
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "FAIL",
      detail: [
        `✗ FAIL — No test suite configured`,
        `  package.json "test" script is a placeholder: "${placeholderScript}"`,
        `  Add vitest, jest, or pytest before implementation continues.`,
        `  Gate: implementation sessions are blocked until tests exist.`,
      ].join("\n"),
      action:
        "Add a test framework (vitest, jest, or pytest) and update the test script.",
      questions: STEP_QUESTIONS,
    };
  }

  const foundUseCase = USE_CASE_PATHS.find((p) =>
    existsSync(join(projectDir, p)),
  );
  if (foundUseCase) {
    const content = readFileSync(join(projectDir, foundUseCase), "utf-8");
    if (isStub(content)) {
      return {
        step: 5,
        name: "Use Cases / Behavioral Contracts",
        status: "STUB",
        detail: `Found ${foundUseCase} but it contains unfilled template markers. Fill in the use cases before continuing.`,
        action: `Open ${foundUseCase} and answer the questions below to complete it.`,
        questions: STEP_QUESTIONS,
      };
    }
    if (detectUnsafeDeserializationCast(projectDir)) {
      return {
        step: 5,
        name: "Use Cases / Behavioral Contracts",
        status: "WARN",
        detail: `Use case document found: ${foundUseCase}. Unsafe deserialization cast detected — add runtime schema validation (Zod, Pydantic, io-ts).`,
        questions: [],
      };
    }
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "PASS",
      detail: `Use case document found: ${foundUseCase}`,
      questions: [],
    };
  }

  const hasTestDir =
    existsSync(join(projectDir, "tests")) ||
    existsSync(join(projectDir, "test"));
  const hasBuildFile =
    existsSync(join(projectDir, "package.json")) ||
    PYTHON_PACKAGE_FILES.some((f) => existsSync(join(projectDir, f)));
  if (hasTestDir && hasBuildFile) {
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "PASS",
      detail:
        "Test directory found (tests/ or test/) — automated tests express the behavioral contracts.",
      questions: [],
    };
  }

  const fallbackDoc = findBehavioralContractFallback(projectDir);
  if (fallbackDoc) {
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "WARN",
      detail: `Behavioral contract found at ${fallbackDoc}. Consider renaming to docs/use-cases.md for standard compliance.`,
      action:
        "Rename or create docs/use-cases.md with use cases in UC-NNN format.",
      questions: STEP_QUESTIONS,
    };
  }

  const statusPath = join(projectDir, "Status.md");
  const hasNextSteps =
    existsSync(statusPath) &&
    readFileSync(statusPath, "utf-8").toLowerCase().includes("next step");

  if (hasNextSteps) {
    return {
      step: 5,
      name: "Use Cases / Behavioral Contracts",
      status: "WARN",
      detail:
        "No use-cases.md found. Status.md has next-steps content — partial coverage only.",
      action:
        "Create docs/use-cases.md. Each use case (UC-NNN format) seeds: implementation contract, acceptance test, user documentation.",
      questions: STEP_QUESTIONS,
    };
  }
  return {
    step: 5,
    name: "Use Cases / Behavioral Contracts",
    status: "FAIL",
    detail: "No use cases and no Status.md with next-steps content.",
    action:
      "Create docs/use-cases.md with at least one UC in UC-NNN format. " +
      "See the `use-case-triple-derivation` template block for the format.",
    questions: STEP_QUESTIONS,
  };
}

/**
 * Step 6: Schema definitions — the formal vocabulary of the system.
 *
 * Checks for DB schemas, API specs, GraphQL schemas, or documented schemas.
 * A WARN (not FAIL) because not every project type requires all schema forms;
 * the gate `schema-contract-at-boundary` enforces runtime validation separately.
 *
 * @param projectDir - Absolute project root
 * @returns Cascade step result
 */
export function checkSchemaDefinitions(projectDir: string): CascadeStep {
  const found = SCHEMA_ARTIFACT_PATHS.find((p) =>
    existsSync(join(projectDir, p)),
  );
  if (found) {
    return {
      step: 6,
      name: "Schema Definitions",
      status: "PASS",
      detail: `Schema artifact found: ${found}`,
      questions: [],
    };
  }

  const hasPackageJson = existsSync(join(projectDir, "package.json"));
  const hasPythonProject = PYTHON_PACKAGE_FILES.some((f) =>
    existsSync(join(projectDir, f)),
  );
  const hasSourceCode = hasPackageJson || hasPythonProject;

  if (hasSourceCode) {
    return {
      step: 6,
      name: "Schema Definitions",
      status: "WARN",
      detail:
        "No schema artifact found (openapi.yaml, prisma/schema.prisma, schema.graphql, docs/schema.md, etc.). " +
        "The system vocabulary is implicit — types are scattered across code rather than stated as a contract.",
      action:
        "Add at least one schema artifact. For APIs: openapi.yaml. For DB-backed projects: prisma/schema.prisma or docs/schema.md. " +
        "This is the GS §4.2 vocabulary requirement — the schema IS the formal specification of inputs, outputs, and events.",
      questions: [
        "Does this project expose or consume an API? If so, add openapi.yaml.",
        "Does this project use a database? If so, add prisma/schema.prisma or database/schema.sql.",
        "Does this project publish or subscribe to events? If so, add docs/schemas/events.md.",
      ],
    };
  }

  return {
    step: 6,
    name: "Schema Definitions",
    status: "SKIP",
    detail:
      "No package.json or Python build file found — schema check skipped for this project type.",
    questions: [],
  };
}
