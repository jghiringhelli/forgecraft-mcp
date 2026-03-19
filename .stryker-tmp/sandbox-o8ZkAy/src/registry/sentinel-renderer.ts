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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { renderTemplate } from "./renderer.js";
import type { InstructionBlock } from "../shared/types.js";
import type { RenderContext } from "./renderer.js";

// ── Domain mapping ────────────────────────────────────────────────────

/**
 * Maps instruction block IDs to domain categories.
 * "critical" blocks are inlined into CLAUDE.md; all others go into domain files.
 */
const BLOCK_DOMAIN_MAP: Readonly<Record<string, string>> = stryMutAct_9fa48("0") ? {} : (stryCov_9fa48("0"), {
  // ── Architecture ──
  "project-identity": stryMutAct_9fa48("1") ? "" : (stryCov_9fa48("1"), "architecture"),
  "code-standards": stryMutAct_9fa48("2") ? "" : (stryCov_9fa48("2"), "architecture"),
  "production-code-standards": stryMutAct_9fa48("3") ? "" : (stryCov_9fa48("3"), "architecture"),
  "layered-architecture": stryMutAct_9fa48("4") ? "" : (stryCov_9fa48("4"), "architecture"),
  "clean-code-principles": stryMutAct_9fa48("5") ? "" : (stryCov_9fa48("5"), "architecture"),
  "language-stack-constraints": stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), "architecture"),
  // ── Testing ──
  "testing-pyramid": stryMutAct_9fa48("7") ? "" : (stryCov_9fa48("7"), "testing"),
  "tdd-methodology": stryMutAct_9fa48("8") ? "" : (stryCov_9fa48("8"), "testing"),
  "tdd-enforcement": stryMutAct_9fa48("9") ? "" : (stryCov_9fa48("9"), "testing"),
  "test-taxonomy": stryMutAct_9fa48("10") ? "" : (stryCov_9fa48("10"), "testing"),
  "gs-test-techniques": stryMutAct_9fa48("11") ? "" : (stryCov_9fa48("11"), "testing"),
  "techniques-registry": stryMutAct_9fa48("12") ? "" : (stryCov_9fa48("12"), "testing"),
  "data-guardrails": stryMutAct_9fa48("13") ? "" : (stryCov_9fa48("13"), "testing"),
  // ── CI/CD ──
  "cicd-deployment": stryMutAct_9fa48("14") ? "" : (stryCov_9fa48("14"), "cicd"),
  "twelve-factor-ops": stryMutAct_9fa48("15") ? "" : (stryCov_9fa48("15"), "cicd"),
  "commit-protocol": stryMutAct_9fa48("16") ? "" : (stryCov_9fa48("16"), "cicd"),
  "dev-environment-hygiene": stryMutAct_9fa48("17") ? "" : (stryCov_9fa48("17"), "cicd"),
  // ── Spec / GS ──
  "artifact-grammar": stryMutAct_9fa48("18") ? "" : (stryCov_9fa48("18"), "spec"),
  "naming-as-grammar": stryMutAct_9fa48("19") ? "" : (stryCov_9fa48("19"), "spec"),
  "adr-protocol": stryMutAct_9fa48("20") ? "" : (stryCov_9fa48("20"), "spec"),
  "use-case-triple-derivation": stryMutAct_9fa48("21") ? "" : (stryCov_9fa48("21"), "spec"),
  "release-phase-gate": stryMutAct_9fa48("22") ? "" : (stryCov_9fa48("22"), "spec"),
  "gs-five-memory-types": stryMutAct_9fa48("23") ? "" : (stryCov_9fa48("23"), "spec"),
  "gs-status-format": stryMutAct_9fa48("24") ? "" : (stryCov_9fa48("24"), "spec"),
  "living-documentation": stryMutAct_9fa48("25") ? "" : (stryCov_9fa48("25"), "spec"),
  "agentic-self-refinement": stryMutAct_9fa48("26") ? "" : (stryCov_9fa48("26"), "spec"),
  "wrong-specification-risk": stryMutAct_9fa48("27") ? "" : (stryCov_9fa48("27"), "spec"),
  // ── Protocols (on-demand workflow rules) ──
  "clarification-protocol": stryMutAct_9fa48("28") ? "" : (stryCov_9fa48("28"), "protocols"),
  "feature-completion-protocol": stryMutAct_9fa48("29") ? "" : (stryCov_9fa48("29"), "protocols"),
  "mcp-tooling": stryMutAct_9fa48("30") ? "" : (stryCov_9fa48("30"), "protocols"),
  "engineering-preferences": stryMutAct_9fa48("31") ? "" : (stryCov_9fa48("31"), "protocols"),
  "code-generation-verification": stryMutAct_9fa48("32") ? "" : (stryCov_9fa48("32"), "protocols"),
  "known-pitfalls": stryMutAct_9fa48("33") ? "" : (stryCov_9fa48("33"), "protocols"),
  "corrections-log": stryMutAct_9fa48("34") ? "" : (stryCov_9fa48("34"), "protocols"),
  "dependency-registry": stryMutAct_9fa48("35") ? "" : (stryCov_9fa48("35"), "protocols"),
  // ── API ──
  "api-standards": stryMutAct_9fa48("36") ? "" : (stryCov_9fa48("36"), "api"),
  "api-testing": stryMutAct_9fa48("37") ? "" : (stryCov_9fa48("37"), "api"),
  "api-smoke-testing": stryMutAct_9fa48("38") ? "" : (stryCov_9fa48("38"), "api"),
  "api-deployment": stryMutAct_9fa48("39") ? "" : (stryCov_9fa48("39"), "api"),
  "api-stack-constraints": stryMutAct_9fa48("40") ? "" : (stryCov_9fa48("40"), "api"),
  "cli-standards": stryMutAct_9fa48("41") ? "" : (stryCov_9fa48("41"), "api"),
  "library-standards": stryMutAct_9fa48("42") ? "" : (stryCov_9fa48("42"), "api"),
  // ── Frontend ──
  "react-component-architecture": stryMutAct_9fa48("43") ? "" : (stryCov_9fa48("43"), "frontend"),
  "react-state-management": stryMutAct_9fa48("44") ? "" : (stryCov_9fa48("44"), "frontend"),
  "react-forms": stryMutAct_9fa48("45") ? "" : (stryCov_9fa48("45"), "frontend"),
  "react-error-boundaries": stryMutAct_9fa48("46") ? "" : (stryCov_9fa48("46"), "frontend"),
  "react-accessibility": stryMutAct_9fa48("47") ? "" : (stryCov_9fa48("47"), "frontend"),
  "react-i18n": stryMutAct_9fa48("48") ? "" : (stryCov_9fa48("48"), "frontend"),
  "react-api-integration": stryMutAct_9fa48("49") ? "" : (stryCov_9fa48("49"), "frontend"),
  "react-deployment": stryMutAct_9fa48("50") ? "" : (stryCov_9fa48("50"), "frontend"),
  "web-react-testing": stryMutAct_9fa48("51") ? "" : (stryCov_9fa48("51"), "frontend"),
  "web-react-smoke-testing": stryMutAct_9fa48("52") ? "" : (stryCov_9fa48("52"), "frontend"),
  "html-css-best-practices": stryMutAct_9fa48("53") ? "" : (stryCov_9fa48("53"), "frontend"),
  "asset-optimization": stryMutAct_9fa48("54") ? "" : (stryCov_9fa48("54"), "frontend"),
  "static-site-architecture": stryMutAct_9fa48("55") ? "" : (stryCov_9fa48("55"), "frontend"),
  "static-deployment": stryMutAct_9fa48("56") ? "" : (stryCov_9fa48("56"), "frontend"),
  "web-static-smoke-testing": stryMutAct_9fa48("57") ? "" : (stryCov_9fa48("57"), "frontend"),
  "platform-performance": stryMutAct_9fa48("58") ? "" : (stryCov_9fa48("58"), "frontend"),
  "push-lifecycle": stryMutAct_9fa48("59") ? "" : (stryCov_9fa48("59"), "frontend"),
  "responsive-offline": stryMutAct_9fa48("60") ? "" : (stryCov_9fa48("60"), "frontend"),
  // ── Realtime / State Machines ──
  "state-transition-design": stryMutAct_9fa48("61") ? "" : (stryCov_9fa48("61"), "realtime"),
  "guards-actions": stryMutAct_9fa48("62") ? "" : (stryCov_9fa48("62"), "realtime"),
  "hierarchical-parallel": stryMutAct_9fa48("63") ? "" : (stryCov_9fa48("63"), "realtime"),
  "websocket-patterns": stryMutAct_9fa48("64") ? "" : (stryCov_9fa48("64"), "realtime"),
  "event-driven-architecture": stryMutAct_9fa48("65") ? "" : (stryCov_9fa48("65"), "realtime"),
  "backpressure-scaling": stryMutAct_9fa48("66") ? "" : (stryCov_9fa48("66"), "realtime"),
  "feeds-notifications": stryMutAct_9fa48("67") ? "" : (stryCov_9fa48("67"), "realtime"),
  "social-privacy-graph": stryMutAct_9fa48("68") ? "" : (stryCov_9fa48("68"), "realtime"),
  "ugc-moderation": stryMutAct_9fa48("69") ? "" : (stryCov_9fa48("69"), "realtime"),
  // ── Data ──
  "etl-patterns": stryMutAct_9fa48("70") ? "" : (stryCov_9fa48("70"), "data"),
  "data-validation": stryMutAct_9fa48("71") ? "" : (stryCov_9fa48("71"), "data"),
  "data-pipeline-testing": stryMutAct_9fa48("72") ? "" : (stryCov_9fa48("72"), "data"),
  "reliability-patterns": stryMutAct_9fa48("73") ? "" : (stryCov_9fa48("73"), "data"),
  "lineage-tracking-decorators": stryMutAct_9fa48("74") ? "" : (stryCov_9fa48("74"), "data"),
  "field-coverage": stryMutAct_9fa48("75") ? "" : (stryCov_9fa48("75"), "data"),
  "analytics-architecture": stryMutAct_9fa48("76") ? "" : (stryCov_9fa48("76"), "analytics"),
  "bronze-layer": stryMutAct_9fa48("77") ? "" : (stryCov_9fa48("77"), "data"),
  "silver-layer": stryMutAct_9fa48("78") ? "" : (stryCov_9fa48("78"), "data"),
  "gold-layer": stryMutAct_9fa48("79") ? "" : (stryCov_9fa48("79"), "data"),
  // ── ML ──
  "training-pipelines": stryMutAct_9fa48("80") ? "" : (stryCov_9fa48("80"), "ml"),
  "feature-engineering": stryMutAct_9fa48("81") ? "" : (stryCov_9fa48("81"), "ml"),
  "model-deployment": stryMutAct_9fa48("82") ? "" : (stryCov_9fa48("82"), "ml"),
  "ml-testing": stryMutAct_9fa48("83") ? "" : (stryCov_9fa48("83"), "ml"),
  // ── Observability ──
  "xray-annotations-metadata": stryMutAct_9fa48("84") ? "" : (stryCov_9fa48("84"), "observability"),
  "xray-lambda-instrumentation": stryMutAct_9fa48("85") ? "" : (stryCov_9fa48("85"), "observability"),
  "xray-alerting": stryMutAct_9fa48("86") ? "" : (stryCov_9fa48("86"), "observability"),
  "observability-secrets": stryMutAct_9fa48("87") ? "" : (stryCov_9fa48("87"), "observability"),
  // ── Security ──
  "transaction-integrity": stryMutAct_9fa48("88") ? "" : (stryCov_9fa48("88"), "security"),
  "audit-compliance": stryMutAct_9fa48("89") ? "" : (stryCov_9fa48("89"), "security"),
  "security-resilience": stryMutAct_9fa48("90") ? "" : (stryCov_9fa48("90"), "security"),
  "simulation-invariants": stryMutAct_9fa48("91") ? "" : (stryCov_9fa48("91"), "security"),
  "hipaa-compliance": stryMutAct_9fa48("92") ? "" : (stryCov_9fa48("92"), "security"),
  "audit-logging": stryMutAct_9fa48("93") ? "" : (stryCov_9fa48("93"), "security"),
  "consent-management": stryMutAct_9fa48("94") ? "" : (stryCov_9fa48("94"), "security"),
  "audit-logging-hipaa": stryMutAct_9fa48("95") ? "" : (stryCov_9fa48("95"), "security"),
  "encryption-checks": stryMutAct_9fa48("96") ? "" : (stryCov_9fa48("96"), "security"),
  "pii-masking": stryMutAct_9fa48("97") ? "" : (stryCov_9fa48("97"), "security"),
  "access-control-validation": stryMutAct_9fa48("98") ? "" : (stryCov_9fa48("98"), "security"),
  "change-management": stryMutAct_9fa48("99") ? "" : (stryCov_9fa48("99"), "security"),
  "incident-response": stryMutAct_9fa48("100") ? "" : (stryCov_9fa48("100"), "security"),
  "deny-by-default-iam": stryMutAct_9fa48("101") ? "" : (stryCov_9fa48("101"), "security"),
  "explicit-allow-rules": stryMutAct_9fa48("102") ? "" : (stryCov_9fa48("102"), "security"),
  "network-zero-trust": stryMutAct_9fa48("103") ? "" : (stryCov_9fa48("103"), "security"),
  // ── Infra ──
  "cicd-pipelines": stryMutAct_9fa48("104") ? "" : (stryCov_9fa48("104"), "cicd"),
  "cloud-platform-guidance": stryMutAct_9fa48("105") ? "" : (stryCov_9fa48("105"), "cicd"),
  "iac-cdk-patterns": stryMutAct_9fa48("106") ? "" : (stryCov_9fa48("106"), "cicd"),
  "iac-containers": stryMutAct_9fa48("107") ? "" : (stryCov_9fa48("107"), "cicd"),
  // ── Domain-specific ──
  "smart-contract-patterns": stryMutAct_9fa48("108") ? "" : (stryCov_9fa48("108"), "web3"),
  "gas-optimization": stryMutAct_9fa48("109") ? "" : (stryCov_9fa48("109"), "web3"),
  "wallet-offchain": stryMutAct_9fa48("110") ? "" : (stryCov_9fa48("110"), "web3"),
  "game-loop-timing": stryMutAct_9fa48("111") ? "" : (stryCov_9fa48("111"), "game"),
  "ecs-architecture": stryMutAct_9fa48("112") ? "" : (stryCov_9fa48("112"), "game"),
  "asset-input-management": stryMutAct_9fa48("113") ? "" : (stryCov_9fa48("113"), "game"),
  "game-testing": stryMutAct_9fa48("114") ? "" : (stryCov_9fa48("114"), "game"),
  "game-smoke-testing": stryMutAct_9fa48("115") ? "" : (stryCov_9fa48("115"), "game"),
  "web-game-performance": stryMutAct_9fa48("116") ? "" : (stryCov_9fa48("116"), "game"),
  "phaser3-setup": stryMutAct_9fa48("117") ? "" : (stryCov_9fa48("117"), "game"),
  "pixijs-setup": stryMutAct_9fa48("118") ? "" : (stryCov_9fa48("118"), "game"),
  "threejs-webgl-setup": stryMutAct_9fa48("119") ? "" : (stryCov_9fa48("119"), "game")
});

/** Human-readable descriptions for each domain used in the wayfinding table. */
const DOMAIN_DESCRIPTIONS: Readonly<Record<string, string>> = stryMutAct_9fa48("120") ? {} : (stryCov_9fa48("120"), {
  architecture: stryMutAct_9fa48("121") ? "" : (stryCov_9fa48("121"), "Architecture, SOLID, hexagonal layers, DTOs, ports/adapters, production standards"),
  testing: stryMutAct_9fa48("122") ? "" : (stryCov_9fa48("122"), "Tests, TDD, coverage, test doubles, property-based, mutation testing"),
  cicd: stryMutAct_9fa48("123") ? "" : (stryCov_9fa48("123"), "CI/CD, environments, deployment strategy, graceful shutdown, infra-as-code"),
  api: stryMutAct_9fa48("124") ? "" : (stryCov_9fa48("124"), "REST/GraphQL endpoints, auth, rate limiting, versioning, contracts"),
  frontend: stryMutAct_9fa48("125") ? "" : (stryCov_9fa48("125"), "React components, state management, accessibility, performance, mobile"),
  realtime: stryMutAct_9fa48("126") ? "" : (stryCov_9fa48("126"), "State machines, WebSockets, events, CQRS, real-time patterns"),
  data: stryMutAct_9fa48("127") ? "" : (stryCov_9fa48("127"), "ETL pipelines, data validation, lineage, data guardrails, medallion architecture"),
  analytics: stryMutAct_9fa48("128") ? "" : (stryCov_9fa48("128"), "Analytics architecture, dashboards, query optimization"),
  ml: stryMutAct_9fa48("129") ? "" : (stryCov_9fa48("129"), "ML training, experiment tracking, model versioning, inference, feature stores"),
  observability: stryMutAct_9fa48("130") ? "" : (stryCov_9fa48("130"), "Logging, tracing, health checks, alerting, X-Ray instrumentation"),
  spec: stryMutAct_9fa48("131") ? "" : (stryCov_9fa48("131"), "ADRs, artifact grammar, use cases, GS self-refinement, naming conventions"),
  protocols: stryMutAct_9fa48("132") ? "" : (stryCov_9fa48("132"), "Clarification protocol, feature completion, code generation, known pitfalls"),
  security: stryMutAct_9fa48("133") ? "" : (stryCov_9fa48("133"), "FINTECH invariants, HIPAA, SOC2, OWASP, zero-trust, audit gates"),
  web3: stryMutAct_9fa48("134") ? "" : (stryCov_9fa48("134"), "Smart contract patterns, gas optimization, wallet/off-chain integration"),
  game: stryMutAct_9fa48("135") ? "" : (stryCov_9fa48("135"), "Game loop, ECS architecture, asset management, WebGL, performance")
});

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
export function renderSentinelTree(blocks: InstructionBlock[], context: RenderContext): SentinelFile[] {
  if (stryMutAct_9fa48("136")) {
    {}
  } else {
    stryCov_9fa48("136");
    const byDomain = groupBlocksByDomain(blocks);
    const files: SentinelFile[] = stryMutAct_9fa48("137") ? ["Stryker was here"] : (stryCov_9fa48("137"), []);

    // Generate domain standards files
    const domainsWithContent: Array<{
      domain: string;
      description: string;
    }> = stryMutAct_9fa48("138") ? ["Stryker was here"] : (stryCov_9fa48("138"), []);
    for (const [domain, domainBlocks] of byDomain) {
      if (stryMutAct_9fa48("139")) {
        {}
      } else {
        stryCov_9fa48("139");
        if (stryMutAct_9fa48("142") ? domainBlocks.length !== 0 : stryMutAct_9fa48("141") ? false : stryMutAct_9fa48("140") ? true : (stryCov_9fa48("140", "141", "142"), domainBlocks.length === 0)) continue;
        const content = renderDomainFile(domain, domainBlocks, context);
        files.push(stryMutAct_9fa48("143") ? {} : (stryCov_9fa48("143"), {
          relativePath: stryMutAct_9fa48("144") ? `` : (stryCov_9fa48("144"), `.claude/standards/${domain}.md`),
          content
        }));
        const description = stryMutAct_9fa48("145") ? DOMAIN_DESCRIPTIONS[domain] && domain : (stryCov_9fa48("145"), DOMAIN_DESCRIPTIONS[domain] ?? domain);
        domainsWithContent.push(stryMutAct_9fa48("146") ? {} : (stryCov_9fa48("146"), {
          domain,
          description
        }));
      }
    }

    // Sort domains for consistent wayfinding table order
    const domainOrder = stryMutAct_9fa48("147") ? [] : (stryCov_9fa48("147"), [stryMutAct_9fa48("148") ? "" : (stryCov_9fa48("148"), "architecture"), stryMutAct_9fa48("149") ? "" : (stryCov_9fa48("149"), "testing"), stryMutAct_9fa48("150") ? "" : (stryCov_9fa48("150"), "cicd"), stryMutAct_9fa48("151") ? "" : (stryCov_9fa48("151"), "api"), stryMutAct_9fa48("152") ? "" : (stryCov_9fa48("152"), "frontend"), stryMutAct_9fa48("153") ? "" : (stryCov_9fa48("153"), "realtime"), stryMutAct_9fa48("154") ? "" : (stryCov_9fa48("154"), "data"), stryMutAct_9fa48("155") ? "" : (stryCov_9fa48("155"), "analytics"), stryMutAct_9fa48("156") ? "" : (stryCov_9fa48("156"), "ml"), stryMutAct_9fa48("157") ? "" : (stryCov_9fa48("157"), "observability"), stryMutAct_9fa48("158") ? "" : (stryCov_9fa48("158"), "spec"), stryMutAct_9fa48("159") ? "" : (stryCov_9fa48("159"), "protocols"), stryMutAct_9fa48("160") ? "" : (stryCov_9fa48("160"), "security"), stryMutAct_9fa48("161") ? "" : (stryCov_9fa48("161"), "web3"), stryMutAct_9fa48("162") ? "" : (stryCov_9fa48("162"), "game")]);
    stryMutAct_9fa48("163") ? domainsWithContent : (stryCov_9fa48("163"), domainsWithContent.sort(stryMutAct_9fa48("164") ? () => undefined : (stryCov_9fa48("164"), (a, b) => stryMutAct_9fa48("165") ? (domainOrder.indexOf(a.domain) ?? 99) + (domainOrder.indexOf(b.domain) ?? 99) : (stryCov_9fa48("165"), (stryMutAct_9fa48("166") ? domainOrder.indexOf(a.domain) && 99 : (stryCov_9fa48("166"), domainOrder.indexOf(a.domain) ?? 99)) - (stryMutAct_9fa48("167") ? domainOrder.indexOf(b.domain) && 99 : (stryCov_9fa48("167"), domainOrder.indexOf(b.domain) ?? 99))))));

    // Generate sentinel CLAUDE.md (prepend so it's first in the list)
    files.unshift(stryMutAct_9fa48("168") ? {} : (stryCov_9fa48("168"), {
      relativePath: stryMutAct_9fa48("169") ? "" : (stryCov_9fa48("169"), "CLAUDE.md"),
      content: renderSentinelClaudeMd(domainsWithContent, context)
    }));
    return files;
  }
}

// ── Private helpers ───────────────────────────────────────────────────

/**
 * Group instruction blocks by domain category using the BLOCK_DOMAIN_MAP.
 * Blocks with unrecognized IDs fall into "protocols" (catch-all).
 */
function groupBlocksByDomain(blocks: InstructionBlock[]): Map<string, InstructionBlock[]> {
  if (stryMutAct_9fa48("170")) {
    {}
  } else {
    stryCov_9fa48("170");
    const map = new Map<string, InstructionBlock[]>();
    for (const block of blocks) {
      if (stryMutAct_9fa48("171")) {
        {}
      } else {
        stryCov_9fa48("171");
        const domain = stryMutAct_9fa48("172") ? BLOCK_DOMAIN_MAP[block.id] && "protocols" : (stryCov_9fa48("172"), BLOCK_DOMAIN_MAP[block.id] ?? (stryMutAct_9fa48("173") ? "" : (stryCov_9fa48("173"), "protocols")));
        const existing = stryMutAct_9fa48("174") ? map.get(domain) && [] : (stryCov_9fa48("174"), map.get(domain) ?? (stryMutAct_9fa48("175") ? ["Stryker was here"] : (stryCov_9fa48("175"), [])));
        existing.push(block);
        map.set(domain, existing);
      }
    }
    return map;
  }
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
function renderDomainFile(domain: string, blocks: InstructionBlock[], context: RenderContext): string {
  if (stryMutAct_9fa48("176")) {
    {}
  } else {
    stryCov_9fa48("176");
    const date = new Date().toISOString().split(stryMutAct_9fa48("177") ? "" : (stryCov_9fa48("177"), "T"))[0];
    const lines: string[] = stryMutAct_9fa48("178") ? [] : (stryCov_9fa48("178"), [stryMutAct_9fa48("179") ? `` : (stryCov_9fa48("179"), `<!-- ForgeCraft sentinel: ${domain} | ${date} | npx forgecraft-mcp refresh . --apply to update -->`), stryMutAct_9fa48("180") ? "Stryker was here!" : (stryCov_9fa48("180"), "")]);
    for (const block of blocks) {
      if (stryMutAct_9fa48("181")) {
        {}
      } else {
        stryCov_9fa48("181");
        const rendered = stryMutAct_9fa48("182") ? renderTemplate(block.content, context) : (stryCov_9fa48("182"), renderTemplate(block.content, context).trim());
        if (stryMutAct_9fa48("184") ? false : stryMutAct_9fa48("183") ? true : (stryCov_9fa48("183", "184"), rendered)) {
          if (stryMutAct_9fa48("185")) {
            {}
          } else {
            stryCov_9fa48("185");
            lines.push(rendered);
            lines.push(stryMutAct_9fa48("186") ? "Stryker was here!" : (stryCov_9fa48("186"), ""));
          }
        }
      }
    }
    return lines.join(stryMutAct_9fa48("187") ? "" : (stryCov_9fa48("187"), "\n"));
  }
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
function renderSentinelClaudeMd(domains: Array<{
  domain: string;
  description: string;
}>, context: RenderContext): string {
  if (stryMutAct_9fa48("188")) {
    {}
  } else {
    stryCov_9fa48("188");
    const date = new Date().toISOString().split(stryMutAct_9fa48("189") ? "" : (stryCov_9fa48("189"), "T"))[0];
    const tagList = context.tags.map(stryMutAct_9fa48("190") ? () => undefined : (stryCov_9fa48("190"), t => stryMutAct_9fa48("191") ? `` : (stryCov_9fa48("191"), `[${t}]`))).join(stryMutAct_9fa48("192") ? "" : (stryCov_9fa48("192"), " "));
    const lines: string[] = stryMutAct_9fa48("193") ? [] : (stryCov_9fa48("193"), [stryMutAct_9fa48("194") ? `` : (stryCov_9fa48("194"), `# CLAUDE.md — ${context.projectName}`), stryMutAct_9fa48("195") ? "Stryker was here!" : (stryCov_9fa48("195"), ""), stryMutAct_9fa48("196") ? `` : (stryCov_9fa48("196"), `<!-- ForgeCraft sentinel | ${date} | tags: ${context.tags.join(stryMutAct_9fa48("197") ? "" : (stryCov_9fa48("197"), ", "))} | npx forgecraft-mcp refresh . --apply to update -->`), stryMutAct_9fa48("198") ? `` : (stryCov_9fa48("198"), `<!-- Load standards files only when the current task requires them. -->`), stryMutAct_9fa48("199") ? "Stryker was here!" : (stryCov_9fa48("199"), ""), stryMutAct_9fa48("200") ? `` : (stryCov_9fa48("200"), `## Project Identity`), stryMutAct_9fa48("201") ? `` : (stryCov_9fa48("201"), `- **Project**: ${context.projectName}`), stryMutAct_9fa48("202") ? `` : (stryCov_9fa48("202"), `- **Language**: ${context.language}`), stryMutAct_9fa48("203") ? `` : (stryCov_9fa48("203"), `- **Release Phase**: ${stryMutAct_9fa48("204") ? context.releasePhase && "development" : (stryCov_9fa48("204"), context.releasePhase ?? (stryMutAct_9fa48("205") ? "" : (stryCov_9fa48("205"), "development")))}`), stryMutAct_9fa48("206") ? `` : (stryCov_9fa48("206"), `- **Tags**: ${tagList}`), stryMutAct_9fa48("207") ? "Stryker was here!" : (stryCov_9fa48("207"), ""), stryMutAct_9fa48("208") ? `` : (stryCov_9fa48("208"), `**Current work → read \`Status.md\` first.**`), stryMutAct_9fa48("209") ? "Stryker was here!" : (stryCov_9fa48("209"), ""), stryMutAct_9fa48("210") ? `` : (stryCov_9fa48("210"), `---`), stryMutAct_9fa48("211") ? "Stryker was here!" : (stryCov_9fa48("211"), ""), stryMutAct_9fa48("212") ? `` : (stryCov_9fa48("212"), `## Critical Rules — Always Active`), stryMutAct_9fa48("213") ? `` : (stryCov_9fa48("213"), `_These apply regardless of task. Never defer them._`), stryMutAct_9fa48("214") ? "Stryker was here!" : (stryCov_9fa48("214"), ""), stryMutAct_9fa48("215") ? `` : (stryCov_9fa48("215"), `**Hygiene (disk safety)**`), stryMutAct_9fa48("216") ? `` : (stryCov_9fa48("216"), `- Check before installing: \`code --list-extensions | grep -i <name>\` · \`docker ps -a --filter name=<svc>\` · \`.venv\` reuse if major.minor matches.`), stryMutAct_9fa48("217") ? `` : (stryCov_9fa48("217"), `- Never \`docker run\` without checking for an existing container. Prefer \`docker compose up\`.`), stryMutAct_9fa48("218") ? `` : (stryCov_9fa48("218"), `- Workspace >2 GB outside \`node_modules/\`/\`.next/\`/\`dist/\` → warn before continuing.`), stryMutAct_9fa48("219") ? `` : (stryCov_9fa48("219"), `- Synthetic data >100 MB or >7 days old without reference → ask before retaining.`), stryMutAct_9fa48("220") ? "Stryker was here!" : (stryCov_9fa48("220"), ""), stryMutAct_9fa48("221") ? `` : (stryCov_9fa48("221"), `**Code integrity**`), stryMutAct_9fa48("222") ? `` : (stryCov_9fa48("222"), `- No hardcoded config. No mocks in production code. Never skip layers: API → services → repositories.`), stryMutAct_9fa48("223") ? `` : (stryCov_9fa48("223"), `- Every public function has a JSDoc comment with typed params and returns.`), stryMutAct_9fa48("224") ? `` : (stryCov_9fa48("224"), `- Split a file when you use "and" to describe what it does.`), stryMutAct_9fa48("225") ? "Stryker was here!" : (stryCov_9fa48("225"), ""), stryMutAct_9fa48("226") ? `` : (stryCov_9fa48("226"), `**Commits**`), stryMutAct_9fa48("227") ? `` : (stryCov_9fa48("227"), `- Conventional commits: \`feat|fix|refactor|docs|test|chore(scope): description\``), stryMutAct_9fa48("228") ? `` : (stryCov_9fa48("228"), `- One logical change per commit. Update \`Status.md\` at end of every session.`), stryMutAct_9fa48("229") ? `` : (stryCov_9fa48("229"), `- Commit BEFORE any risky refactor.`), stryMutAct_9fa48("230") ? "Stryker was here!" : (stryCov_9fa48("230"), ""), stryMutAct_9fa48("231") ? `` : (stryCov_9fa48("231"), `**Data**`), stryMutAct_9fa48("232") ? `` : (stryCov_9fa48("232"), `- NEVER sample, truncate, or subset data unless explicitly instructed.`), stryMutAct_9fa48("233") ? `` : (stryCov_9fa48("233"), `- State exact row counts, column sets, and filters for every data operation.`), stryMutAct_9fa48("234") ? "Stryker was here!" : (stryCov_9fa48("234"), ""), stryMutAct_9fa48("235") ? `` : (stryCov_9fa48("235"), `**TDD**`), stryMutAct_9fa48("236") ? `` : (stryCov_9fa48("236"), `- Write a failing test (\`test: [RED]\` commit) BEFORE the implementation commit.`), stryMutAct_9fa48("237") ? `` : (stryCov_9fa48("237"), `- Tests are specifications — name them as behaviors, not as code paths.`), stryMutAct_9fa48("238") ? "Stryker was here!" : (stryCov_9fa48("238"), ""), stryMutAct_9fa48("239") ? `` : (stryCov_9fa48("239"), `---`), stryMutAct_9fa48("240") ? "Stryker was here!" : (stryCov_9fa48("240"), "")]);

    // Wayfinding table
    if (stryMutAct_9fa48("244") ? domains.length <= 0 : stryMutAct_9fa48("243") ? domains.length >= 0 : stryMutAct_9fa48("242") ? false : stryMutAct_9fa48("241") ? true : (stryCov_9fa48("241", "242", "243", "244"), domains.length > 0)) {
      if (stryMutAct_9fa48("245")) {
        {}
      } else {
        stryCov_9fa48("245");
        lines.push(stryMutAct_9fa48("246") ? `` : (stryCov_9fa48("246"), `## Wayfinding — Load Standards on Demand`));
        lines.push(stryMutAct_9fa48("247") ? `` : (stryCov_9fa48("247"), `| When working on… | Read |`));
        lines.push(stryMutAct_9fa48("248") ? `` : (stryCov_9fa48("248"), `|---|---|`));
        for (const {
          domain,
          description
        } of domains) {
          if (stryMutAct_9fa48("249")) {
            {}
          } else {
            stryCov_9fa48("249");
            lines.push(stryMutAct_9fa48("250") ? `` : (stryCov_9fa48("250"), `| ${description} | \`.claude/standards/${domain}.md\` |`));
          }
        }
        lines.push(stryMutAct_9fa48("251") ? `` : (stryCov_9fa48("251"), `| Project-specific rules, framework choices, corrections log | \`.claude/standards/project-specific.md\` |`));
        lines.push(stryMutAct_9fa48("252") ? "Stryker was here!" : (stryCov_9fa48("252"), ""));
        lines.push(stryMutAct_9fa48("253") ? `` : (stryCov_9fa48("253"), `---`));
        lines.push(stryMutAct_9fa48("254") ? "Stryker was here!" : (stryCov_9fa48("254"), ""));
      }
    }
    lines.push(stryMutAct_9fa48("255") ? `` : (stryCov_9fa48("255"), `## Session Protocol`));
    lines.push(stryMutAct_9fa48("256") ? `` : (stryCov_9fa48("256"), `1. Read \`Status.md\` — know what's in progress before writing a line.`));
    lines.push(stryMutAct_9fa48("257") ? `` : (stryCov_9fa48("257"), `2. Load the relevant standards file(s) from the wayfinding table above.`));
    lines.push(stryMutAct_9fa48("258") ? `` : (stryCov_9fa48("258"), `3. Update \`Status.md\` before ending the session.`));
    lines.push(stryMutAct_9fa48("259") ? "Stryker was here!" : (stryCov_9fa48("259"), ""));
    return lines.join(stryMutAct_9fa48("260") ? "" : (stryCov_9fa48("260"), "\n"));
  }
}