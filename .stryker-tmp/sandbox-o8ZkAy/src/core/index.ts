/**
 * src/core — public API.
 *
 * A GenerativeSpec is the intersection of all seven required properties.
 * A specification is only well-formed when it satisfies every property.
 * Missing any one property produces an under-specified system that will drift.
 */
// @ts-nocheck


export type {
  SelfDescribingSpec,
  BoundedSpec,
  VerifiableSpec,
  VerificationResult,
  DefendedSpec,
  QualityGate,
  AuditableSpec,
  ArchDecision,
  SpecChange,
  ComposableSpec,
  CompositionConflict,
  ExecutableSpec,
  ExecutableResult,
} from "./properties.js";

import type {
  SelfDescribingSpec,
  BoundedSpec,
  VerifiableSpec,
  DefendedSpec,
  AuditableSpec,
  ComposableSpec,
  ExecutableSpec,
} from "./properties.js";

/**
 * A fully well-formed Generative Specification.
 *
 * Implements all seven properties. Any artifact that satisfies this interface
 * can be used to constrain LLM generation reliably and reproducibly.
 *
 * The seven properties form a closed lattice:
 *   Self-describing × Bounded × Verifiable × Defended × Auditable × Composable × Executable
 *
 * An artifact missing any property adds a degree of freedom to the generation
 * space — each missing property exponentially increases the probability of drift.
 */
export type GenerativeSpec = SelfDescribingSpec &
  BoundedSpec &
  VerifiableSpec &
  DefendedSpec &
  AuditableSpec &
  ComposableSpec &
  ExecutableSpec;
