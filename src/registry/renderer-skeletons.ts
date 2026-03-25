/**
 * Document skeleton renderers.
 *
 * Generates boilerplate markdown documents (Status.md, PRD, Tech Spec)
 * seeded with project context.
 */

import type { RenderContext } from "./renderer-types.js";

/**
 * Render a Status.md skeleton with project info.
 *
 * @param context - Project render context
 * @returns Status.md content ready to write
 */
export function renderStatusMd(context: RenderContext): string {
  return `# Status.md

## Last Updated: ${new Date().toISOString().split("T")[0]}
## Session Summary
Project initialized with ForgeCraft. Tags: ${context.tags.join(", ")}.

## Project Structure
\`\`\`
[Run 'tree -L 3 --dirsfirst' to populate]
\`\`\`

## Feature Tracker
| Feature | Status | Branch | Notes |
|---------|--------|--------|-------|
| | ⬚ Not Started | | |

## Known Bugs
| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Technical Debt
| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| | | | |

## Current Context
- Working on:
- Blocked by:
- Decisions pending:
- Next steps:

## Architecture Decision Log
| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
| | | | |
`;
}

/**
 * Render a PRD skeleton.
 *
 * @param context - Project render context
 * @returns PRD.md content ready to write
 */
export function renderPrdSkeleton(context: RenderContext): string {
  return `# PRD: ${context.projectName}

## Background & Context
[Why this project exists, what problem it solves]

## Stakeholders
[Who owns it, who uses it, who's affected]

## User Stories
[Organized by feature area]
- US-001: As a [type], I want [action] so that [benefit]

## Requirements
### Functional Requirements
- FR-001: [requirement]

### Non-Functional Requirements
[Generated from active tags: ${context.tags.join(", ")}]

## Out of Scope
[Explicitly list what this project does NOT do]

## Success Metrics
[How do we know this project succeeded?]

## Open Questions
[Unresolved decisions]
`;
}

/**
 * Render a Tech Spec skeleton.
 *
 * @param context - Project render context
 * @returns TechSpec.md content ready to write
 */
export function renderTechSpecSkeleton(context: RenderContext): string {
  return `# Tech Spec: ${context.projectName}

## Overview
[One paragraph translating PRD to technical approach]

## Architecture
### System Diagram
[Mermaid diagram or description of components]

### Tech Stack
- Runtime: ${context.language}
- Framework: ${context.framework ?? "[TBD]"}

### Data Flow
[How data moves through the system]

## API Contracts
[Key endpoints, request/response shapes]

## Security & Compliance
[Auth approach, encryption, audit logging]

## Dependencies
[External services, APIs, libraries with version pins]

## Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| | H/M/L | H/M/L | |
`;
}
