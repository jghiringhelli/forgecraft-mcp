/**
 * Artifact Grammar — index.
 *
 * All nine artifact types that constitute the Generative Specification grammar.
 * Each artifact constrains one dimension of the LLM's generation space.
 *
 * Complete artifact grammar:
 *   1. claude-instructions  — behavioral constraints (what agents must/must not do)
 *   2. adr                  — structural decision history (what was decided and why)
 *   3. diagram              — visual structural contracts (C4 / Mermaid)
 *   4. schema               — data shape contracts (Zod / JSON Schema)
 *   5. naming               — intention-revealing identifier conventions
 *   6. package-hierarchy    — module boundary enforcement via import rules
 *   7. commit-history       — conventional commits as machine-readable changelog
 *   8. executable-tests     — TDD tests as executable specs (tests-first)
 *   9. commit-hooks         — automated enforcement of all artifacts above
 */
// @ts-nocheck


export { ClaudeInstructionsArtifact, CLAUDE_INSTRUCTIONS_ARTIFACT_ID } from "./claude-instructions.js";
export { AdrArtifact, ADR_ARTIFACT_ID } from "./adr.js";
export { SchemaArtifact, SCHEMA_ARTIFACT_ID } from "./schema.js";
export { CommitHistoryArtifact, COMMIT_HISTORY_ARTIFACT_ID } from "./commit-history.js";
export { CommitHooksArtifact, COMMIT_HOOKS_ARTIFACT_ID } from "./commit-hooks.js";
