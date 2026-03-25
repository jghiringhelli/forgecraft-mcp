/**
 * spec-parser-tags: Tag inference keywords, text-based tag detection, and sensitive data detection.
 */

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

// ── Tag inference keywords ────────────────────────────────────────────

export const TAG_KEYWORD_MAP: ReadonlyArray<{
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
    // Only code-level signals: package/tool names and technical identifiers, NOT prose phrases.
    tag: "CLI",
    keywords: [
      "commander",
      "yargs",
      "argv",
      "meow",
      "@oclif",
      "clipanion",
      "process.argv",
    ],
  },
  {
    // Only code-level signals: SDK/installable/peer-dependency terms, NOT generic "library of..." prose.
    tag: "LIBRARY",
    keywords: ["sdk", "installable", "peer dependency"],
  },
  {
    // Only code-level signals: Solidity keywords, web3 tooling imports — NOT conceptual prose mentions.
    tag: "WEB3",
    keywords: [
      "pragma solidity",
      "msg.sender",
      "mapping(",
      "ethers",
      "wagmi",
      "viem",
      "hardhat",
      "truffle",
      "solidity",
      "web3.js",
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

/**
 * Infer classification tags from freeform text using keyword matching.
 *
 * @param text - Text to scan (lowercased internally)
 * @returns Array of inferred tag strings, always includes "UNIVERSAL"
 */
export function inferTagsFromText(text: string): string[] {
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
export const PLATFORM_TERMS = /\b(system|platform)\b/i;

export const DEPLOYMENT_TAGS = new Set([
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
 * @param text - Full spec text
 * @param inferredTags - Tags already inferred from the text
 * @returns Array of detected ambiguity items
 */
export function detectSpecAmbiguities(
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

// ── Sensitive data detection ──────────────────────────────────────────

/**
 * Keywords that imply sensitive data handling.
 */
export const SENSITIVE_DATA_KEYWORDS: readonly string[] = [
  "medical",
  "osha",
  "phi",
  "hipaa",
  "patient record",
  "patient data",
  "payment",
  "financial data",
  "transaction",
  "invoice",
  "banking",
  "fintech",
  "defi",
  "crypto wallet",
  "credit card",
  "user profile",
  "personal data",
  "pii",
  "gdpr",
  "credentials",
  "social security",
  "date of birth",
  "passport number",
  "biometric",
  "salary",
  "tax id",
  "bank account",
];

/** Tags that imply sensitive data. */
export const SENSITIVE_TAGS: readonly string[] = [
  "FINTECH",
  "HEALTHCARE",
  "HIPAA",
  "SOC2",
  "SOCIAL",
];

/**
 * Infer whether the project handles sensitive data from spec content and tags.
 *
 * @param specSummary - Parsed spec summary (problem, users, components)
 * @param tags - Project classification tags
 * @returns True if sensitive data patterns detected
 */
export function inferSensitiveData(
  specSummary: { problem: string; users: string[]; components: string[] },
  tags: string[],
): boolean {
  if (tags.some((t) => (SENSITIVE_TAGS as readonly string[]).includes(t))) return true;

  const fullText = [
    specSummary.problem,
    specSummary.users.join(" "),
    specSummary.components.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return SENSITIVE_DATA_KEYWORDS.some((keyword) => {
    const escapedKeyword = keyword.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const pattern = new RegExp(`\\b${escapedKeyword}\\b`);
    return pattern.test(fullText);
  });
}
