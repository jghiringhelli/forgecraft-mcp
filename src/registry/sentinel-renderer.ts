/**
 * Sentinel tree renderer.
 *
 * Instead of one large instruction file, renders a 3-level lazy tree:
 *   Level 0: CLAUDE.md  (~50 lines) — project identity + critical rules + wayfinding
 *   Level 1: .claude/standards/{domain}.md — full block content per domain
 *
 * The AI loads only what the current task requires.
 * Typical task: CLAUDE.md (~50 lines) + 1-2 domain files (50-100 lines each).
 * vs monolithic: 800-2000+ lines loaded regardless of task.
 *
 * Only applies to the "claude" target — other AI assistants receive the full file
 * since they do not support multi-file on-demand loading the same way.
 */

import { renderTemplate } from "./renderer.js";
import type { InstructionBlock } from "../shared/types.js";
import type { RenderContext } from "./renderer.js";

// ── Domain mapping ────────────────────────────────────────────────────

/**
 * Maps instruction block IDs to domain categories.
 * "critical" blocks are inlined into CLAUDE.md; all others go into domain files.
 */
const BLOCK_DOMAIN_MAP: Readonly<Record<string, string>> = {
  // ── Architecture ──
  "project-identity": "architecture",
  "code-standards": "architecture",
  "production-code-standards": "architecture",
  "layered-architecture": "architecture",
  "clean-code-principles": "architecture",
  "language-stack-constraints": "architecture",

  // ── Testing ──
  "testing-pyramid": "testing",
  "tdd-methodology": "testing",
  "tdd-enforcement": "testing",
  "test-taxonomy": "testing",
  "gs-test-techniques": "testing",
  "techniques-registry": "testing",
  "data-guardrails": "testing",

  // ── CI/CD ──
  "cicd-deployment": "cicd",
  "twelve-factor-ops": "cicd",
  "commit-protocol": "cicd",
  "dev-environment-hygiene": "cicd",

  // ── Spec / GS ──
  "artifact-grammar": "spec",
  "naming-as-grammar": "spec",
  "adr-protocol": "spec",
  "use-case-triple-derivation": "spec",
  "release-phase-gate": "spec",
  "gs-five-memory-types": "spec",
  "gs-status-format": "spec",
  "living-documentation": "spec",
  "agentic-self-refinement": "spec",
  "wrong-specification-risk": "spec",

  // ── Protocols (on-demand workflow rules) ──
  "clarification-protocol": "protocols",
  "feature-completion-protocol": "protocols",
  "mcp-tooling": "protocols",
  "engineering-preferences": "protocols",
  "code-generation-verification": "protocols",
  "known-pitfalls": "protocols",
  "corrections-log": "protocols",
  "dependency-registry": "protocols",

  // ── API ──
  "api-standards": "api",
  "api-testing": "api",
  "api-smoke-testing": "api",
  "api-deployment": "api",
  "api-stack-constraints": "api",
  "cli-standards": "api",
  "library-standards": "api",

  // ── Frontend ──
  "react-component-architecture": "frontend",
  "react-state-management": "frontend",
  "react-forms": "frontend",
  "react-error-boundaries": "frontend",
  "react-accessibility": "frontend",
  "react-i18n": "frontend",
  "react-api-integration": "frontend",
  "react-deployment": "frontend",
  "web-react-testing": "frontend",
  "web-react-smoke-testing": "frontend",
  "html-css-best-practices": "frontend",
  "asset-optimization": "frontend",
  "static-site-architecture": "frontend",
  "static-deployment": "frontend",
  "web-static-smoke-testing": "frontend",
  "platform-performance": "frontend",
  "push-lifecycle": "frontend",
  "responsive-offline": "frontend",

  // ── Realtime / State Machines ──
  "state-transition-design": "realtime",
  "guards-actions": "realtime",
  "hierarchical-parallel": "realtime",
  "websocket-patterns": "realtime",
  "event-driven-architecture": "realtime",
  "backpressure-scaling": "realtime",
  "feeds-notifications": "realtime",
  "social-privacy-graph": "realtime",
  "ugc-moderation": "realtime",

  // ── Data ──
  "etl-patterns": "data",
  "data-validation": "data",
  "data-pipeline-testing": "data",
  "reliability-patterns": "data",
  "lineage-tracking-decorators": "data",
  "field-coverage": "data",
  "analytics-architecture": "analytics",
  "bronze-layer": "data",
  "silver-layer": "data",
  "gold-layer": "data",

  // ── ML ──
  "training-pipelines": "ml",
  "feature-engineering": "ml",
  "model-deployment": "ml",
  "ml-testing": "ml",

  // ── Observability ──
  "xray-annotations-metadata": "observability",
  "xray-lambda-instrumentation": "observability",
  "xray-alerting": "observability",
  "observability-secrets": "observability",

  // ── Security ──
  "transaction-integrity": "security",
  "audit-compliance": "security",
  "security-resilience": "security",
  "simulation-invariants": "security",
  "hipaa-compliance": "security",
  "audit-logging": "security",
  "consent-management": "security",
  "audit-logging-hipaa": "security",
  "encryption-checks": "security",
  "pii-masking": "security",
  "access-control-validation": "security",
  "change-management": "security",
  "incident-response": "security",
  "deny-by-default-iam": "security",
  "explicit-allow-rules": "security",
  "network-zero-trust": "security",

  // ── Infra ──
  "cicd-pipelines": "cicd",
  "cloud-platform-guidance": "cicd",
  "iac-cdk-patterns": "cicd",
  "iac-containers": "cicd",

  // ── Domain-specific ──
  "smart-contract-patterns": "web3",
  "gas-optimization": "web3",
  "wallet-offchain": "web3",
  "game-loop-timing": "game",
  "ecs-architecture": "game",
  "asset-input-management": "game",
  "game-testing": "game",
  "game-smoke-testing": "game",
  "web-game-performance": "game",
  "phaser3-setup": "game",
  "pixijs-setup": "game",
  "threejs-webgl-setup": "game",
};

/** Human-readable descriptions for each domain used in the wayfinding table. */
const DOMAIN_DESCRIPTIONS: Readonly<Record<string, string>> = {
  architecture:
    "Architecture, SOLID, hexagonal layers, DTOs, ports/adapters, production standards",
  testing:
    "Tests, TDD, coverage, test doubles, property-based, mutation testing",
  cicd: "CI/CD, environments, deployment strategy, graceful shutdown, infra-as-code",
  api: "REST/GraphQL endpoints, auth, rate limiting, versioning, contracts",
  frontend:
    "React components, state management, accessibility, performance, mobile",
  realtime: "State machines, WebSockets, events, CQRS, real-time patterns",
  data: "ETL pipelines, data validation, lineage, data guardrails, medallion architecture",
  analytics: "Analytics architecture, dashboards, query optimization",
  ml: "ML training, experiment tracking, model versioning, inference, feature stores",
  observability:
    "Logging, tracing, health checks, alerting, X-Ray instrumentation",
  spec: "ADRs, artifact grammar, use cases, GS self-refinement, naming conventions",
  protocols:
    "Clarification protocol, feature completion, code generation, known pitfalls",
  security: "FINTECH invariants, HIPAA, SOC2, OWASP, zero-trust, audit gates",
  web3: "Smart contract patterns, gas optimization, wallet/off-chain integration",
  game: "Game loop, ECS architecture, asset management, WebGL, performance",
};

// ── Types ─────────────────────────────────────────────────────────────

/** A single file produced by the sentinel renderer. */
export interface SentinelFile {
  /** Relative path from project root (e.g., "CLAUDE.md" or ".claude/standards/testing.md"). */
  readonly relativePath: string;
  /** File content ready to write. */
  readonly content: string;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Render the full sentinel tree from composed instruction blocks.
 *
 * Returns an array of files to write:
 * - CLAUDE.md (sentinel, ~50 lines)
 * - .claude/standards/{domain}.md for each domain that has content
 *
 * @param blocks - All composed instruction blocks
 * @param context - Project render context
 * @returns Array of files to write, CLAUDE.md first
 */
export function renderSentinelTree(
  blocks: InstructionBlock[],
  context: RenderContext,
): SentinelFile[] {
  const byDomain = groupBlocksByDomain(blocks);
  const files: SentinelFile[] = [];

  // Generate domain standards files
  const domainsWithContent: Array<{ domain: string; description: string }> = [];

  for (const [domain, domainBlocks] of byDomain) {
    if (domainBlocks.length === 0) continue;

    const content = renderDomainFile(domain, domainBlocks, context);
    files.push({ relativePath: `.claude/standards/${domain}.md`, content });

    const description = DOMAIN_DESCRIPTIONS[domain] ?? domain;
    domainsWithContent.push({ domain, description });
  }

  // Sort domains for consistent wayfinding table order
  const domainOrder = [
    "architecture",
    "testing",
    "cicd",
    "api",
    "frontend",
    "realtime",
    "data",
    "analytics",
    "ml",
    "observability",
    "spec",
    "protocols",
    "security",
    "web3",
    "game",
  ];
  domainsWithContent.sort(
    (a, b) =>
      (domainOrder.indexOf(a.domain) ?? 99) -
      (domainOrder.indexOf(b.domain) ?? 99),
  );

  // Generate sentinel CLAUDE.md (prepend so it's first in the list)
  files.unshift({
    relativePath: "CLAUDE.md",
    content: renderSentinelClaudeMd(domainsWithContent, context),
  });

  return files;
}

// ── Private helpers ───────────────────────────────────────────────────

/**
 * Group instruction blocks by domain category using the BLOCK_DOMAIN_MAP.
 * Blocks with unrecognized IDs fall into "protocols" (catch-all).
 */
function groupBlocksByDomain(
  blocks: InstructionBlock[],
): Map<string, InstructionBlock[]> {
  const map = new Map<string, InstructionBlock[]>();

  for (const block of blocks) {
    const domain = BLOCK_DOMAIN_MAP[block.id] ?? "protocols";
    const existing = map.get(domain) ?? [];
    existing.push(block);
    map.set(domain, existing);
  }

  return map;
}

/**
 * Render a single domain standards file.
 * Contains full rendered block content for all blocks in that domain.
 *
 * @param domain - Domain name (used in header comment)
 * @param blocks - Blocks belonging to this domain
 * @param context - Render context for variable substitution
 * @returns File content ready to write
 */
function renderDomainFile(
  domain: string,
  blocks: InstructionBlock[],
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    `<!-- ForgeCraft sentinel: ${domain} | ${date} | npx forgecraft-mcp refresh . --apply to update -->`,
    "",
  ];

  for (const block of blocks) {
    const rendered = renderTemplate(block.content, context).trim();
    if (rendered) {
      lines.push(rendered);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Render the sentinel CLAUDE.md.
 *
 * Contains: project identity, a compact hardcoded critical-rules summary
 * (always-active invariants distilled from UNIVERSAL blocks), and wayfinding.
 * Target size: ~60-80 lines regardless of tag count.
 *
 * Full block content is in the domain standards files — loaded on demand.
 *
 * @param domains - Domains that have standards files (for wayfinding table)
 * @param context - Render context
 * @returns CLAUDE.md content ready to write
 */
function renderSentinelClaudeMd(
  domains: Array<{ domain: string; description: string }>,
  context: RenderContext,
): string {
  const date = new Date().toISOString().split("T")[0];
  const tagList = context.tags.map((t) => `[${t}]`).join(" ");

  const lines: string[] = [
    `# CLAUDE.md — ${context.projectName}`,
    "",
    `<!-- ForgeCraft sentinel | ${date} | tags: ${context.tags.join(", ")} | npx forgecraft-mcp refresh . --apply to update -->`,
    `<!-- Load standards files only when the current task requires them. -->`,
    "",
    `## Project Identity`,
    `- **Project**: ${context.projectName}`,
    `- **Language**: ${context.language}`,
    `- **Release Phase**: ${context.releasePhase ?? "development"}`,
    `- **Tags**: ${tagList}`,
    "",
    `**Current work → read \`Status.md\` first.**`,
    "",
    `---`,
    "",
    `## Critical Rules — Always Active`,
    `_These apply regardless of task. Never defer them._`,
    "",
    `**Hygiene (disk safety)**`,
    `- Check before installing: \`code --list-extensions | grep -i <name>\` · \`docker ps -a --filter name=<svc>\` · \`.venv\` reuse if major.minor matches.`,
    `- Never \`docker run\` without checking for an existing container. Prefer \`docker compose up\`.`,
    `- Workspace >2 GB outside \`node_modules/\`/\`.next/\`/\`dist/\` → warn before continuing.`,
    `- Synthetic data >100 MB or >7 days old without reference → ask before retaining.`,
    "",
    `**Code integrity**`,
    `- No hardcoded config. No mocks in production code. Never skip layers: API → services → repositories.`,
    `- Every public function has a JSDoc comment with typed params and returns.`,
    `- Split a file when you use "and" to describe what it does.`,
    "",
    `**Commits**`,
    `- Conventional commits: \`feat|fix|refactor|docs|test|chore(scope): description\``,
    `- One logical change per commit. Update \`Status.md\` at end of every session.`,
    `- Commit BEFORE any risky refactor.`,
    "",
    `**Data**`,
    `- NEVER sample, truncate, or subset data unless explicitly instructed.`,
    `- State exact row counts, column sets, and filters for every data operation.`,
    "",
    `**TDD**`,
    `- Write a failing test (\`test: [RED]\` commit) BEFORE the implementation commit.`,
    `- Tests are specifications — name them as behaviors, not as code paths.`,
    "",
    `---`,
    "",
  ];

  // Wayfinding table
  if (domains.length > 0) {
    lines.push(`## Wayfinding — Load Standards on Demand`);
    lines.push(`| When working on… | Read |`);
    lines.push(`|---|---|`);
    for (const { domain, description } of domains) {
      lines.push(`| ${description} | \`.claude/standards/${domain}.md\` |`);
    }
    lines.push(
      `| Project-specific rules, framework choices, corrections log | \`.claude/standards/project-specific.md\` |`,
    );
    lines.push("");
    lines.push(`---`);
    lines.push("");
  }

  lines.push(`## Session Protocol`);
  lines.push(
    `1. Read \`Status.md\` — know what's in progress before writing a line.`,
  );
  lines.push(
    `2. Load the relevant standards file(s) from the wayfinding table above.`,
  );
  lines.push(`3. Update \`Status.md\` before ending the session.`);
  lines.push("");

  return lines.join("\n");
}
