/**
 * scaffold-spec-stubs: Spec stub writers for scaffold_project.
 *
 * Manages UNFILLED stub documents that are detectable by check_cascade.
 * Diagram stubs are structured (real Mermaid syntax with placeholder labels)
 * so they function as grammar production rules from day one, not empty files.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const USE_CASES_STUB = `<!-- UNFILLED: Use Cases -->
# Use Cases

## UC-01: [Name]
**Actor**: <!-- FILL: who? -->
**Precondition**: <!-- FILL: what must be true before? -->
**Steps**: <!-- FILL: numbered steps -->
**Success**: <!-- FILL: what changed? -->

## UC-02: [Name]
<!-- FILL -->

## UC-03: [Name]
<!-- FILL -->
`;

/**
 * Build the UNFILLED stub content for docs/diagrams/c4-context.md.
 *
 * @param projectName - Human-readable project name for the diagram title
 * @returns Stub content with UNFILLED markers
 */
export function buildC4ContextStub(projectName: string): string {
  return `<!-- UNFILLED: C4 Context Diagram -->
<!-- Run \`forgecraft generate_diagram\` to auto-generate from your spec -->
# System Context Diagram
\`\`\`mermaid
C4Context
  title System Context: ${projectName}
  Person(user, "User", "<!-- FILL: Who uses the system? -->")
  System(system, "${projectName}", "<!-- FILL: What does the system do in one sentence? -->")
  Rel(user, system, "<!-- FILL: Primary interaction -->")
\`\`\`
`;
}

/**
 * Build the UNFILLED stub content for a sequence diagram.
 *
 * Emits a structured Mermaid sequenceDiagram with participant declarations and
 * labelled message arrows — a real grammar production rule, not an empty file.
 *
 * @param feature - Human-readable feature name (e.g. "User Authentication")
 * @returns Stub content with UNFILLED markers and structural Mermaid syntax
 */
export function buildSequenceDiagramStub(feature: string): string {
  return `<!-- UNFILLED: Sequence Diagram — ${feature} -->
<!-- Replace participant labels and messages with real actors and contracts -->
# Sequence Diagram: ${feature}

\`\`\`mermaid
sequenceDiagram
    participant Client as <!-- FILL: initiating actor, e.g. Browser / CLI / Service -->
    participant API as <!-- FILL: entry-point service, e.g. API Gateway -->
    participant Service as <!-- FILL: domain service, e.g. AuthService -->
    participant Store as <!-- FILL: persistence layer, e.g. Database -->

    Note over Client,Store: <!-- FILL: describe the primary flow in one sentence -->

    Client->>API: <!-- FILL: request, e.g. POST /login {credentials} -->
    API->>Service: <!-- FILL: delegate, e.g. authenticate(credentials) -->
    Service->>Store: <!-- FILL: query, e.g. findUserByEmail(email) -->
    Store-->>Service: <!-- FILL: result, e.g. User | null -->

    alt <!-- FILL: failure case, e.g. User not found or wrong password -->
        Service-->>API: <!-- FILL: error response, e.g. AuthError -->
        API-->>Client: <!-- FILL: HTTP error, e.g. 401 Unauthorized -->
    else <!-- FILL: success case -->
        Service-->>API: <!-- FILL: success result, e.g. JWT token -->
        API-->>Client: <!-- FILL: HTTP success, e.g. 200 OK {token} -->
    end
\`\`\`
`;
}

/**
 * Build the UNFILLED stub content for a state machine diagram.
 *
 * Emits a stateDiagram-v2 with an initial transition, named states, transitions
 * between them, and terminal states — a grammar that directly generates state
 * transition test cases.
 *
 * @param entityName - Domain entity whose lifecycle is modelled (e.g. "Order")
 * @returns Stub content with UNFILLED markers and structural Mermaid syntax
 */
export function buildStateMachineDiagramStub(entityName: string): string {
  return `<!-- UNFILLED: State Machine — ${entityName} -->
<!-- Replace state names (Draft, Pending, Active, etc.) and transition labels -->
<!-- with the actual lifecycle states of your domain entity.               -->
# State Machine: ${entityName}

\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft

    Draft --> Pending: submit()
    Pending --> Active: approve()
    Pending --> Rejected: reject()
    Active --> Completed: complete()
    Active --> Cancelled: cancel()

    Completed --> [*]
    Rejected --> [*]
    Cancelled --> [*]

    note right of Active
        FILL: add invariant or constraint
        e.g. "requires valid payment method"
    end note
\`\`\`
`;
}

/**
 * Build the UNFILLED stub content for a user flow / flowchart diagram.
 *
 * Emits a flowchart TD with Start/End rounded nodes, a decision diamond, and
 * labelled edges — the script for E2E tests and user documentation in one artifact.
 *
 * @param ucName - Use case name (e.g. "UC-01: Register User")
 * @returns Stub content with UNFILLED markers and structural Mermaid syntax
 */
export function buildFlowDiagramStub(ucName: string): string {
  return `<!-- UNFILLED: Flow Diagram — ${ucName} -->
<!-- Replace node labels and edge conditions with real user journey steps -->
# Flow: ${ucName}

\`\`\`mermaid
flowchart TD
    Start([<!-- FILL: trigger, e.g. User opens registration page -->])

    Start --> Input[<!-- FILL: first action, e.g. Fill in name, email, password -->]
    Input --> Validate{<!-- FILL: validation check, e.g. All fields valid? -->}

    Validate -->|<!-- FILL: failure label, e.g. Invalid -->| Error[<!-- FILL: error action, e.g. Show validation errors -->]
    Error --> Input

    Validate -->|<!-- FILL: success label, e.g. Valid -->| Process[<!-- FILL: main action, e.g. Create account -->]
    Process --> Check{<!-- FILL: guard check, e.g. Email already exists? -->}

    Check -->|<!-- FILL: conflict label, e.g. Yes -->| Conflict[<!-- FILL: conflict action, e.g. Show duplicate email error -->]
    Conflict --> End([<!-- FILL: exit label, e.g. User corrects email -->])

    Check -->|<!-- FILL: proceed label, e.g. No -->| Success[<!-- FILL: success action, e.g. Send confirmation email -->]
    Success --> End
\`\`\`
`;
}

/**
 * Build the UNFILLED stub content for a C4 Container diagram.
 *
 * Emits Container declarations and Rel statements for a multi-container system —
 * the topology layer that C4 Context does not capture.
 *
 * @param projectName - Human-readable project name for the diagram title
 * @returns Stub content with UNFILLED markers and structural Mermaid syntax
 */
export function buildC4ContainerStub(projectName: string): string {
  return `<!-- UNFILLED: C4 Container Diagram -->
<!-- Replace container labels, technology fields, and relations with your stack -->
# Container Diagram — ${projectName}

\`\`\`mermaid
C4Container
    title Container Diagram: ${projectName}

    Person(user, "<!-- FILL: actor name -->", "<!-- FILL: actor description -->")

    Container(web, "<!-- FILL: frontend name, e.g. Web Application -->", "<!-- FILL: technology, e.g. React -->", "<!-- FILL: responsibility -->")
    Container(api, "<!-- FILL: backend name, e.g. API Server -->", "<!-- FILL: technology, e.g. Node.js / Express -->", "<!-- FILL: responsibility -->")
    Container(db, "<!-- FILL: database name, e.g. Primary Database -->", "<!-- FILL: technology, e.g. PostgreSQL -->", "<!-- FILL: responsibility -->")

    Rel(user, web, "<!-- FILL: interaction, e.g. Uses -->", "<!-- FILL: protocol, e.g. HTTPS -->")
    Rel(web, api, "<!-- FILL: call, e.g. API calls -->", "<!-- FILL: protocol, e.g. REST / JSON -->")
    Rel(api, db, "<!-- FILL: query, e.g. Reads and writes -->", "<!-- FILL: protocol, e.g. SQL -->")
\`\`\`
`;
}

// ── Sectioned spec (§6a — targeted spec loading) ──────────────────────────
//
// VairixDX measured ~82% fewer spec tokens per task when the spec is sectioned
// and routed, because a task loads only the slice it needs and the relevant
// lines stop landing past the attention cliff. `.claude/spec-map.md` already
// routes tasks to these exact filenames; here we emit the slices + a SPEC-INDEX
// router so those pointers resolve. Sections are prescriptive (RFC 2119
// MUST/SHOULD/MAY) per ADR-0012 §3/§4: each MUST becomes an acceptance
// criterion and therefore a probe.

/** One sectioned-spec slice: filename, title, the tags that warrant it, body. */
export interface SpecSectionDef {
  /** Slice filename under docs/specs/sections/ (must match spec-map.md rows). */
  readonly file: string;
  /** Human title for the SPEC-INDEX router + the section H1. */
  readonly title: string;
  /** What this slice owns (one line, shown in the SPEC-INDEX table). */
  readonly owns: string;
  /** Tags that warrant this slice; empty array = always emitted. */
  readonly tags: readonly string[];
  /** Section-specific UNFILLED body (after the shared preamble). */
  readonly body: string;
}

/**
 * The full sectioned-spec catalog. The `tags` predicate mirrors the routing
 * rows in `buildSpecMapFile` (src/registry/sentinel-renderer.ts) exactly — keep
 * the two in sync so every spec-map pointer resolves to an emitted file.
 */
export const SPEC_SECTION_DEFS: readonly SpecSectionDef[] = [
  {
    file: "api.md",
    title: "API Surface",
    owns: "endpoints, request/response shapes, error envelope",
    tags: ["API"],
    body: `## Endpoints
<!-- FILL: one row per endpoint — METHOD /path — purpose. Phrase obligations with
     RFC 2119 keywords (MUST/SHOULD/MAY); each MUST is an acceptance criterion. -->

## Request / response shapes
<!-- FILL: the canonical request and response bodies (link a schema if one exists) -->

## Error envelope
<!-- FILL: the single error response shape every endpoint MUST return on failure -->

## Acceptance criteria
<!-- FILL: each MUST above, restated as a checkable probe in tests/harness/ -->`,
  },
  {
    file: "ui.md",
    title: "UI Screens & Flows",
    owns: "screens, components, navigation, states",
    tags: ["WEB-REACT", "WEB-NEXT", "MOBILE", "EXPO"],
    body: `## Screens
<!-- FILL: one row per screen/route — name — purpose — primary actor -->

## Components & states
<!-- FILL: key components and their states (loading / empty / error / success) -->

## Navigation / flows
<!-- FILL: how a user moves between screens; the primary happy-path flow -->

## Acceptance criteria
<!-- FILL: each MUST behavior, restated as a checkable probe (e.g. .spec.ts) -->`,
  },
  {
    file: "pipeline.md",
    title: "AI / Pipeline Stages",
    owns: "pipeline stages, extraction vs scoring, evidence",
    tags: ["ML", "DATA-PIPELINE", "ANALYTICS"],
    body: `## Stages
<!-- FILL: one row per stage — input → transform → output. Separate stochastic
     extraction (LLM, temperature 0, structured output) from deterministic scoring. -->

## Contracts per stage
<!-- FILL: the structured output schema each stage MUST emit; evidence requirements -->

## Acceptance criteria
<!-- FILL: each MUST restated as a probe; for stochastic stages require an N-run
     pass-rate distribution (see .claude/standards/ml.md), not a single green. -->`,
  },
  {
    file: "seed.md",
    title: "Seed Data & Migrations",
    owns: "seed data, migrations, fixtures",
    tags: ["DATABASE"],
    body: `## Seed data
<!-- FILL: the minimal data set the system MUST ship with (reference data, admin user) -->

## Migrations
<!-- FILL: ordered schema migrations; each MUST be reversible or explicitly one-way -->

## Acceptance criteria
<!-- FILL: each MUST restated as a probe (e.g. a .db.sh state check) -->`,
  },
  {
    file: "test-cases.md",
    title: "Test Cases & Acceptance Criteria",
    owns: "acceptance criteria, probe inputs, edge cases",
    tags: [],
    body: `## Acceptance criteria
<!-- FILL: the cross-cutting MUSTs that span sections; each becomes a harness probe -->

## Edge cases
<!-- FILL: the inputs that break naive implementations — empty, boundary, malformed -->

## Probe inputs
<!-- FILL: concrete inputs a probe in tests/harness/ exercises (the real payloads) -->`,
  },
];

/**
 * Build one sectioned-spec slice stub with the shared preamble + section body.
 *
 * @param def - The section definition (file, title, body)
 * @param projectName - Human-readable project name for the heading
 * @returns Stub content with UNFILLED + FILL markers
 */
export function buildSpecSectionStub(
  def: SpecSectionDef,
  projectName: string,
): string {
  return `<!-- UNFILLED: Spec Section — ${def.title} -->
# ${projectName} — Spec: ${def.title}

> **One slice of the spec.** Loaded on demand via \`.claude/spec-map.md\`; routed by
> \`docs/specs/SPEC-INDEX.md\`. Keep it small and prescriptive (RFC 2119
> MUST/SHOULD/MAY). When you fill a heading, record its line range in the
> SPEC-INDEX so the next session jumps straight here instead of re-reading.

${def.body}
`;
}

/**
 * Select the sectioned-spec slices warranted by a tag set: every always-on
 * slice (empty tags) plus any whose tag predicate intersects the project tags.
 *
 * @param tags - Project tags
 * @returns The applicable section definitions, in catalog order
 */
export function selectSpecSections(
  tags: readonly string[],
): readonly SpecSectionDef[] {
  return SPEC_SECTION_DEFS.filter(
    (def) => def.tags.length === 0 || def.tags.some((t) => tags.includes(t)),
  );
}

/**
 * Build docs/specs/SPEC-INDEX.md — the authoritative router for the sectioned
 * spec. `.claude/spec-map.md` is the quick task→slice cheat-sheet; this file is
 * the source of truth for which sections exist and what each owns.
 *
 * @param projectName - Human-readable project name for the heading
 * @param sections - The emitted section definitions
 * @returns SPEC-INDEX content with an UNFILLED marker (line ranges fill later)
 */
export function buildSpecIndex(
  projectName: string,
  sections: readonly SpecSectionDef[],
): string {
  const rows = sections
    .map(
      (s) => `| ${s.title} | ${s.owns} | \`docs/specs/sections/${s.file}\` |`,
    )
    .join("\n");

  return `<!-- UNFILLED: SPEC-INDEX router -->
# SPEC-INDEX — ${projectName}

> **Load the slice a task needs, never the whole spec.** \`.claude/spec-map.md\` is
> the quick task→slice cheat-sheet; this file is the authoritative list of which
> sections exist and what each owns. The monolithic \`docs/PRD.md\` remains the
> fallback and is superseded by a section as that section fills.

## Sections

| Section | Owns | File |
| --- | --- | --- |
${rows}

## Conventions

- Sections use RFC 2119 keywords (**MUST / SHOULD / MAY**); each **MUST** is an
  acceptance criterion and therefore a harness probe.
- Record line ranges here as sections fill, e.g. \`api.md §Endpoints (lines 12–48)\`,
  so the next session loads the exact slice with no re-reading.
- Behavioral contracts live in \`docs/use-cases/\`; the data model lives in
  \`docs/architecture/data-model.md\` — the spec-map routes to those directly.
`;
}

/**
 * Write the sectioned spec (docs/specs/sections/*.md + docs/specs/SPEC-INDEX.md)
 * for the given tags, using the same UNFILLED/force semantics as other stubs.
 *
 * @param projectDir - Absolute project root
 * @param projectName - Human-readable project name
 * @param tags - Project tags (drive which slices are emitted)
 * @param force - Whether to overwrite existing UNFILLED stubs
 * @param filesCreated - Mutable array to append created paths to
 * @param filesSkipped - Mutable array to append skipped paths to
 */
export function writeSpecSections(
  projectDir: string,
  projectName: string,
  tags: readonly string[],
  force: boolean,
  filesCreated: string[],
  filesSkipped: string[],
): void {
  const sections = selectSpecSections(tags);
  for (const def of sections) {
    writeSpecStub(
      `docs/specs/sections/${def.file}`,
      join(projectDir, "docs", "specs", "sections", def.file),
      buildSpecSectionStub(def, projectName),
      force,
      filesCreated,
      filesSkipped,
    );
  }
  writeSpecStub(
    "docs/specs/SPEC-INDEX.md",
    join(projectDir, "docs", "specs", "SPEC-INDEX.md"),
    buildSpecIndex(projectName, sections),
    force,
    filesCreated,
    filesSkipped,
  );
}

/**
 * Write a spec stub file. Only creates when the file does not exist, or when
 * force=true AND the existing file still contains the UNFILLED marker.
 *
 * @param relativePath - Relative path for tracking output
 * @param fullPath - Absolute path to write
 * @param content - Stub content to write
 * @param force - Whether to overwrite existing stubs
 * @param filesCreated - Mutable array to append created paths to
 * @param filesSkipped - Mutable array to append skipped paths to
 */
export function writeSpecStub(
  relativePath: string,
  fullPath: string,
  content: string,
  force: boolean,
  filesCreated: string[],
  filesSkipped: string[],
): void {
  mkdirSync(dirname(fullPath), { recursive: true });

  if (!existsSync(fullPath)) {
    writeFileSync(fullPath, content, "utf-8");
    filesCreated.push(relativePath);
    return;
  }

  const existing = readFileSync(fullPath, "utf-8");
  if (force && existing.includes("<!-- UNFILLED")) {
    writeFileSync(fullPath, content, "utf-8");
    filesCreated.push(relativePath);
  } else {
    filesSkipped.push(relativePath);
  }
}
