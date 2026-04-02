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

  const conflation = detectToolSampleConflation(text);
  if (conflation) {
    ambiguities.push(conflation);
  }

  return ambiguities;
}

// ── Tool vs. sample-output conflation detection ───────────────────────

/**
 * Signals that the spec describes a generative AI / creative tool being built.
 * Looks for AI system capability descriptions, not just incidental AI mentions.
 */
const GENERATIVE_TOOL_PATTERNS: readonly RegExp[] = [
  // Named AI creative roles
  /\b(AI|automated?|autonomous?|intelligent)\s+(ghostwriter|composer|artist|writer|storyteller|narrator|creator|generator|designer|director|musician|author|painter|illustrator)\b/i,
  // Generative AI technology being built
  /\b(build|create|develop|make)\s+(an?\s+)?(AI|ML|LLM|generative|diffusion)\s+\w+\s+(that|to|for)\s+(generates?|creates?|writes?|produces?|composes?|renders?)\b/i,
  // Capability described: "generates novels", "writes stories", "composes music"
  /\b(generates?|creates?|produces?|writes?|composes?|renders?)\s+(novels?|books?|stories?|music|songs?|artworks?|images?|paintings?|games?|levels?|scripts?|content|narratives?|poems?|lyrics?)\b/i,
  // Stable diffusion / text-to-X pattern
  /\b(stable diffusion|diffusion model|text[\s-]to[\s-](image|video|music|speech|art|story|game)|LLM|language model|GPT|fine[\s-]tun)\b/i,
  // "AI-powered [creative thing]"
  /\bAI[\s-]powered\s+(writing|story|music|art|game|content|creative)\b/i,
];

/**
 * Signals that the spec describes a specific named creative output —
 * something the tool would produce rather than the tool itself.
 */
const NAMED_CREATIVE_OUTPUT_PATTERNS: readonly RegExp[] = [
  // Quoted title-case multi-word title: "The Chronicles of Something"
  /["']([A-Z][a-z]+([ '-][A-Za-z]+){1,6})["']/,
  // Named character/protagonist/villain
  /\b(character|protagonist|hero|villain|antagonist|player character|main character)\s+(named?|called?)\s+["']?[A-Z][a-z]+/i,
  // Specific world or setting with proper noun
  /\b(set in|takes place in|world of|the world named?|realm of|universe of)\s+["']?[A-Z][a-zA-Z\s]{2,25}["']?/i,
  // "the first [novel/game/song/...] will be" — explicit sample language
  /\bthe\s+(first|initial|sample|demo|example|pilot|showcase)\s+(novel|book|game|song|album|artwork?|story|level|episode|chapter|track|piece|composition)\b/i,
  // Structural creative content markers: "Chapter 1:", "Act 1 —"
  /\b(chapter|act|scene|episode|part)\s+\d+\s*[:\-—]/i,
  // Specific plot/story beat language
  /\b(plot|storyline|narrative arc|character arc|backstory|lore|world[\s-]build)\b.{0,80}\b(specific|detailed|complete|full)\b/i,
];

/**
 * Detect when a spec conflates a generative tool with a specific named creative
 * output that the tool would produce. Returns an AmbiguityItem when both signals
 * are present, or null when the spec is clearly about just one of them.
 *
 * @param text - Full spec text
 * @returns AmbiguityItem or null
 */
export function detectToolSampleConflation(text: string): AmbiguityItem | null {
  const toolSignals: string[] = [];
  for (const pattern of GENERATIVE_TOOL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      toolSignals.push(match[0].trim().replace(/\s+/g, " ").slice(0, 60));
    }
  }
  if (toolSignals.length === 0) return null;

  const contentSignals: string[] = [];
  for (const pattern of NAMED_CREATIVE_OUTPUT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      contentSignals.push(match[0].trim().replace(/\s+/g, " ").slice(0, 60));
    }
  }
  if (contentSignals.length === 0) return null;

  return {
    field: "tool_vs_sample_output",
    signals: [
      `Generative tool described: "${toolSignals[0]}"`,
      `Specific creative output described: "${contentSignals[0]}"`,
    ],
    interpretations: [
      {
        label: "tool_and_sample",
        description:
          "Build the core tool; treat the named creative work as the first real deliverable",
        consequence:
          "PRD focuses on the generative system. A docs/sample-outcome.md is created " +
          "with the specific creative work details as the first acceptance test.",
      },
      {
        label: "tool_only",
        description:
          "Build the core tool only; the named creative work is illustrative, not a deliverable",
        consequence:
          "Named creative content is treated as usage examples only. No sample-outcome artifact is created.",
      },
      {
        label: "content_only",
        description:
          "The goal is to produce the specific named creative work; the tool is a means, not the end",
        consequence:
          "PRD focuses on delivering the creative work itself. Tool requirements are implementation details.",
      },
    ],
  };
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
  if (tags.some((t) => (SENSITIVE_TAGS as readonly string[]).includes(t)))
    return true;

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
