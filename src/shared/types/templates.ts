/**
 * Template type definitions: instruction blocks, structure, skills, hooks,
 * review, playbook, and the complete TagTemplateSet.
 */

import type { Tag, ContentTier } from "./project.js";
import type { McpServersTemplate } from "./mcp.js";
import type { VerificationStrategy } from "./verification.js";

// ── Instruction Blocks (formerly ClaudeMdBlock) ──────────────────────

/** An instruction content block from a template. */
export interface InstructionBlock {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly tier?: ContentTier;
}

/** A template YAML file structure for instruction content. */
export interface InstructionTemplate {
  readonly tag: Tag;
  readonly section: "instructions";
  readonly blocks: InstructionBlock[];
}

/**
 * @deprecated Use InstructionBlock instead. Alias kept for backward compatibility.
 */
export type ClaudeMdBlock = InstructionBlock;

/**
 * @deprecated Use InstructionTemplate instead. Alias kept for backward compatibility.
 */
export type ClaudeMdTemplate = InstructionTemplate;

/** A folder/file entry in a structure template. */
export interface StructureEntry {
  readonly path: string;
  readonly type: "directory" | "file";
  readonly description?: string;
  readonly template?: string;
}

/** A structure template for a tag. */
export interface StructureTemplate {
  readonly tag: Tag;
  readonly section: "structure";
  readonly language?: "typescript" | "python" | "both";
  readonly entries: StructureEntry[];
}

/** An NFR (Non-Functional Requirement) block. */
export interface NfrBlock {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly tier?: ContentTier;
}

/** An NFR template for a tag. */
export interface NfrTemplate {
  readonly tag: Tag;
  readonly section: "nfr";
  readonly blocks: NfrBlock[];
}

/** A design reference block (DDD, CQRS, GoF patterns) served on demand, not in instruction files. */
export interface ReferenceBlock {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  /** Optional topic grouping. 'guidance' blocks are GS practitioner protocol procedures. */
  readonly topic?: string;
}

/** A reference template for a tag. */
export interface ReferenceTemplate {
  readonly tag: Tag;
  readonly section: "reference";
  readonly blocks: ReferenceBlock[];
}

/** Hook template definition. */
export interface HookTemplate {
  readonly name: string;
  readonly trigger: "pre-commit" | "pre-exec" | "pre-push" | "commit-msg";
  readonly description: string;
  readonly filename: string;
  readonly script: string;
}

/** Skill template — a reusable Claude Code custom command (.claude/commands/*.md). */
export interface SkillTemplate {
  /** Unique identifier for deduplication across tags. */
  readonly id: string;
  /** Human-readable name shown in skill listings. */
  readonly name: string;
  /** Filename without .md extension — becomes .claude/commands/{filename}.md. */
  readonly filename: string;
  /** Brief description of what the skill does. */
  readonly description: string;
  /** Markdown content of the skill prompt. Supports {{vars}} and $ARGUMENTS. */
  readonly content: string;
  /** Content tier for filtering. Skills are tier-filtered (unlike hooks). */
  readonly tier?: ContentTier;
}

/** Information about an available skill for listing. */
export interface SkillInfo {
  readonly id: string;
  readonly name: string;
  readonly tag: Tag;
  readonly filename: string;
  readonly description: string;
  readonly tier?: ContentTier;
}

/** Shape of the skills.yaml template file. */
export interface SkillsTemplate {
  readonly tag: Tag;
  readonly section: "skills";
  readonly skills: SkillTemplate[];
}

/** Review dimension (section) within a review template. */
export type ReviewDimension =
  | "architecture"
  | "code-quality"
  | "tests"
  | "performance";

/** A single checklist item within a review block. */
export interface ReviewChecklistItem {
  readonly id: string;
  readonly description: string;
  readonly severity: "critical" | "important" | "nice-to-have";
}

/** A review block — one dimension of a code review. */
export interface ReviewBlock {
  readonly id: string;
  readonly dimension: ReviewDimension;
  readonly title: string;
  readonly description: string;
  readonly checklist: ReviewChecklistItem[];
  readonly tier?: ContentTier;
}

/** A review template for a tag. */
export interface ReviewTemplate {
  readonly tag: Tag;
  readonly section: "review";
  readonly blocks: ReviewBlock[];
}

/** Result of a review_project tool call. */
export interface ReviewResult {
  readonly tags: Tag[];
  readonly scope: "comprehensive" | "focused";
  readonly dimensions: ReviewDimensionOutput[];
  readonly issueFormat: string;
}

/** Output for a single review dimension. */
export interface ReviewDimensionOutput {
  readonly dimension: ReviewDimension;
  readonly title: string;
  readonly checklist: ReviewChecklistItem[];
}

// ── Playbook Types ──────────────────────────────────────────────────

/**
 * A single step inside a playbook phase.
 *
 * Each step is one agent action: a command to run, a question to research,
 * a diagram to produce, etc. Steps are ordered and may carry expected outputs
 * so the agent knows what "done" looks like before proceeding.
 */
export interface PlaybookStep {
  /** Short unique label within the phase (e.g., "research-formulas"). */
  readonly id: string;
  /** One-line instruction for the agent. Imperative mood. */
  readonly instruction: string;
  /** What the agent should produce before continuing to the next step. */
  readonly expected_output?: string;
  /** Agent tool(s) best suited for this step (informational). */
  readonly tools?: string[];
  /** Content tier — omit = core, always run. */
  readonly tier?: ContentTier;
}

/**
 * A phase groups a set of related steps under a named stage.
 *
 * Phases are sequential — the agent completes all steps in phase N before
 * starting phase N+1.
 */
export interface PlaybookPhase {
  /** Short identifier, e.g. "model-research" or "balance-simulation". */
  readonly id: string;
  /** Human-readable heading for the phase. */
  readonly title: string;
  /** One-sentence rationale: why this phase exists. */
  readonly rationale: string;
  /** Ordered steps within this phase. */
  readonly steps: PlaybookStep[];
}

/**
 * A playbook is a tag-specific, ordered sequence of agent phases
 * that encode domain expert workflow knowledge.
 *
 * Playbooks are **on-demand** (like reference.yaml) — they are never
 * emitted into instruction files automatically. They are fetched
 * explicitly via `get_reference { resource: "playbook" }`.
 */
export interface PlaybookTemplate {
  readonly tag: Tag;
  readonly section: "playbook";
  /** Short title for the playbook (shown in listings). */
  readonly title: string;
  /** One-paragraph description of when and why to run this playbook. */
  readonly description: string;
  /** Ordered phases that constitute this playbook. */
  readonly phases: PlaybookPhase[];
}

/** Module scaffold configuration. */
export interface ModuleConfig {
  readonly moduleName: string;
  readonly tags: Tag[];
  readonly language: "typescript" | "python";
}

/** Complete template set for a tag. */
export interface TagTemplateSet {
  readonly tag: Tag;
  readonly instructions?: InstructionTemplate;
  readonly nfr?: NfrTemplate;
  readonly structure?: StructureTemplate;
  readonly hooks?: HookTemplate[];
  readonly skills?: SkillTemplate[];
  readonly review?: ReviewTemplate;
  readonly mcpServers?: McpServersTemplate;
  readonly reference?: ReferenceTemplate;
  readonly playbook?: PlaybookTemplate;
  /** Verification strategy: uncertainty-level-aware contracts + execution plan. On-demand only. */
  readonly verification?: VerificationStrategy;
  /**
   * @deprecated Use `instructions` instead. Alias kept for backward compatibility.
   */
  readonly claudeMd?: InstructionTemplate;
}
