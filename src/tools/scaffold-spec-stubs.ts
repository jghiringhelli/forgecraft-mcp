/**
 * scaffold-spec-stubs: Spec stub writers for scaffold_project.
 *
 * Manages UNFILLED stub documents that are detectable by check_cascade.
 * Diagram stubs are structured (real Mermaid syntax with placeholder labels)
 * so they function as grammar production rules from day one, not empty files.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
