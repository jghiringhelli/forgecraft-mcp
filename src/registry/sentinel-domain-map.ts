/**
 * Domain map constants for the sentinel renderer.
 *
 * Maps instruction block IDs to domain categories, and provides human-readable
 * descriptions for each domain used in the wayfinding table.
 */

/** Maps instruction block IDs to domain categories. */
export const BLOCK_DOMAIN_MAP: Readonly<Record<string, string>> = {
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
export const DOMAIN_DESCRIPTIONS: Readonly<Record<string, string>> = {
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

/** Canonical display order for domains in the wayfinding table. */
export const DOMAIN_ORDER: readonly string[] = [
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
