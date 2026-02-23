/**
 * list_tags / list_hooks tool handlers.
 *
 * Discovery tools for Claude Code to understand available tags and hooks.
 */

import { z } from "zod";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag, TagInfo, HookInfo } from "../shared/types.js";
import { loadAllTemplates } from "../registry/loader.js";

// ── Schemas ──────────────────────────────────────────────────────────

export const listTagsSchema = z.object({});

export const listHooksSchema = z.object({
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .optional()
    .describe("Filter hooks to specific tags. Omit to list all hooks."),
});

// ── Tag Descriptions ─────────────────────────────────────────────────

const TAG_DESCRIPTIONS: Record<Tag, { description: string; appliesWhen: string }> = {
  UNIVERSAL: {
    description: "Core standards applied to every project — code quality, architecture, testing, security.",
    appliesWhen: "Always. Every project starts with UNIVERSAL.",
  },
  "WEB-REACT": {
    description: "React/Next.js web applications — component architecture, state management, i18n, a11y.",
    appliesWhen: "Project uses React, Next.js, Remix, or similar React-based framework.",
  },
  "WEB-STATIC": {
    description: "Static sites and landing pages — build optimization, SEO, CDN configuration.",
    appliesWhen: "Project is a static HTML/CSS/JS site, Astro, or Hugo site.",
  },
  API: {
    description: "Backend APIs — REST/GraphQL design, authentication, rate limiting, contract-first.",
    appliesWhen: "Project exposes HTTP/RPC endpoints with Express, Fastify, NestJS, Django, FastAPI.",
  },
  "DATA-PIPELINE": {
    description: "ETL/data processing — idempotency, checkpointing, schema evolution.",
    appliesWhen: "Project processes data in batch/stream pipelines with Airflow, Prefect, Spark.",
  },
  ML: {
    description: "Machine learning — experiment tracking, model versioning, reproducibility.",
    appliesWhen: "Project trains/deploys ML models with PyTorch, TensorFlow, scikit-learn.",
  },
  HEALTHCARE: {
    description: "HIPAA-compliant healthcare — PHI handling, audit logs, encryption, access controls.",
    appliesWhen: "Project handles Protected Health Information (PHI) or medical data.",
  },
  FINTECH: {
    description: "Financial applications — double-entry bookkeeping, compliance, decimal precision.",
    appliesWhen: "Project handles financial transactions, payments, or regulatory compliance.",
  },
  WEB3: {
    description: "Blockchain/crypto — smart contract patterns, gas optimization, wallet security.",
    appliesWhen: "Project uses Ethereum, Solana, or other blockchain platforms.",
  },
  REALTIME: {
    description: "Real-time communication — WebSocket patterns, presence, conflict resolution.",
    appliesWhen: "Project uses WebSockets, Server-Sent Events, or real-time messaging.",
  },
  "STATE-MACHINE": {
    description: "State machine patterns — explicit states, transitions, guards, event-driven.",
    appliesWhen: "Project has complex state workflows (orders, approvals, game logic).",
  },
  GAME: {
    description: "Game development — game loop, ECS, physics, rendering pipeline.",
    appliesWhen: "Project is a game using Phaser, Three.js, Pixi.js, or similar.",
  },
  SOCIAL: {
    description: "Social/community features — feeds, connections, messaging, moderation.",
    appliesWhen: "Project has user profiles, feeds, connections, or social interactions.",
  },
  CLI: {
    description: "Command-line tools — argument parsing, output formatting, exit codes.",
    appliesWhen: "Project is a CLI tool using Commander, Yargs, or similar.",
  },
  LIBRARY: {
    description: "Reusable libraries/SDKs — API design, semver, backwards compatibility, docs.",
    appliesWhen: "Project is published as an npm/pip package for other projects to consume.",
  },
  INFRA: {
    description: "Infrastructure as Code — IaC patterns, environment management, secrets.",
    appliesWhen: "Project manages infrastructure with Terraform, Pulumi, CDK, Docker.",
  },
  MOBILE: {
    description: "Mobile apps — React Native/Flutter patterns, offline-first, native APIs.",
    appliesWhen: "Project targets iOS/Android with React Native, Expo, or Flutter.",
  },
  ANALYTICS: {
    description: "Analytics/reporting — event tracking, dashboards, data warehousing.",
    appliesWhen: "Project includes analytics dashboards, reporting, or event tracking.",
  },
  HIPAA: {
    description: "HIPAA compliance — PII masking templates, encryption checks, audit logging.",
    appliesWhen: "Project handles Protected Health Information requiring HIPAA compliance.",
  },
  SOC2: {
    description: "SOC2 compliance — access control validation, change management, incident response.",
    appliesWhen: "Project requires SOC2 audit readiness (Type I or Type II).",
  },
  "DATA-LINEAGE": {
    description: "Data lineage — enforce 100% field coverage, lineage tracking decorators.",
    appliesWhen: "Project processes data that requires full field-level lineage tracking.",
  },
  "OBSERVABILITY-XRAY": {
    description: "AWS X-Ray observability — auto-add X-Ray instrumentation to Lambdas.",
    appliesWhen: "Project runs on AWS Lambda and requires distributed tracing with X-Ray.",
  },
  "MEDALLION-ARCHITECTURE": {
    description: "Medallion architecture — enforce Bronze=immutable, Silver=validated, Gold=aggregated.",
    appliesWhen: "Project uses a lakehouse/medallion data architecture (Bronze/Silver/Gold).",
  },
  "ZERO-TRUST": {
    description: "Zero-trust security — deny-by-default IAM, explicit allow rules.",
    appliesWhen: "Project requires zero-trust network/IAM policies with deny-by-default.",
  },
};

// ── Handlers ─────────────────────────────────────────────────────────

/**
 * List all available tags with descriptions.
 */
export async function listTagsHandler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const tagInfos: TagInfo[] = ALL_TAGS.map((tag) => ({
    tag,
    description: TAG_DESCRIPTIONS[tag].description,
    appliesWhen: TAG_DESCRIPTIONS[tag].appliesWhen,
  }));

  const formatted = tagInfos
    .map(
      (t) =>
        `**[${t.tag}]** — ${t.description}\n  _Applies when:_ ${t.appliesWhen}`,
    )
    .join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: `# Available Tags (${tagInfos.length})\n\n${formatted}`,
      },
    ],
  };
}

/**
 * List all available hooks, optionally filtered by tags.
 */
export async function listHooksHandler(
  args: z.infer<typeof listHooksSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const templateSets = await loadAllTemplates();

  const hooks: HookInfo[] = [];
  for (const [_tag, templateSet] of templateSets) {
    if (args.tags && !args.tags.includes(templateSet.tag)) {
      continue;
    }

    if (templateSet.hooks) {
      for (const hook of templateSet.hooks) {
        hooks.push({
          name: hook.name,
          tag: templateSet.tag,
          trigger: hook.trigger,
          description: hook.description,
          filename: hook.filename,
        });
      }
    }
  }

  if (hooks.length === 0) {
    return {
      content: [
        { type: "text", text: "No hooks found for the specified tags." },
      ],
    };
  }

  const formatted = hooks
    .map(
      (h) =>
        `- **${h.name}** [${h.tag}] (${h.trigger})\n  ${h.description}\n  File: \`${h.filename}\``,
    )
    .join("\n\n");

  return {
    content: [
      {
        type: "text",
        text: `# Available Hooks (${hooks.length})\n\n${formatted}`,
      },
    ],
  };
}
