# Proposal: CLI Mode + Minimal MCP Sentinel

## Problem Statement

ForgeCraft is a **setup-time tool** — users run it once to generate CLAUDE.md, hooks, skills, and forgecraft.yaml, then never need it again until their project scope changes. However, as an MCP server, its tool schemas are sent with **every AI request** in every conversation, wasting tokens continuously for a tool that's only used occasionally.

In v0.4.0 we consolidated from 16 MCP tools to 2, reducing overhead by ~70%. This proposal goes further: move the actual work to CLI commands and reduce the MCP server to a single near-zero-cost "sentinel" tool.

## Current Architecture (v0.4.0)

```
MCP Server (always running while configured)
├── setup_project    — 7 params, ~300 char description
└── forgecraft       — 25 params, ~400 char description
    ├── action: refresh, scaffold, generate, audit, review
    ├── action: list, classify, get_reference, convert
    └── action: add_hook, add_module, configure_mcp
```

**Token cost:** ~1,500 tokens per request (2 tool schemas sent every turn).

## Proposed Architecture

```
CLI Binary (npx forgecraft-mcp <command>)
├── npx forgecraft-mcp setup <dir> [--tags ...] [--tier ...] [--targets ...]
├── npx forgecraft-mcp refresh <dir> [--apply] [--add-tags ...] [--remove-tags ...]
├── npx forgecraft-mcp audit <dir> [--tags ...]
├── npx forgecraft-mcp scaffold <dir> --tags ... [--language ...] [--dry-run]
├── npx forgecraft-mcp review --tags ... [--scope ...]
├── npx forgecraft-mcp list [tags|hooks|skills] [--tags ...]
└── npx forgecraft-mcp serve   ← starts MCP stdio server (current behavior, kept as default for backward compat)

MCP Server (minimal sentinel — 1 tool, ~200 tokens)
└── forgecraft { project_dir }  — diagnoses project state, recommends CLI commands
```

**Token cost:** ~200 tokens per request (1 tool, 1 param, short description).

## Detailed Design

### 1. CLI Entry Point

The existing `src/index.ts` has `#!/usr/bin/env node` and is the `bin` entry in package.json (`forgecraft-mcp`). Currently it immediately starts the MCP stdio server.

**Change:** Add argument parsing before the MCP server start. If subcommands are provided, run them directly and exit. If no subcommand (or `serve`), start the MCP server as before.

**Recommended library:** `commander` (already a common choice, lightweight). Alternatively, parse `process.argv` manually since we only need a few subcommands — avoids adding a dependency.

**Entry point logic:**
```typescript
#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "serve") {
  // Start MCP stdio server (current behavior)
  startMcpServer();
} else {
  // CLI mode — run subcommand and exit
  runCliCommand(args);
}
```

### 2. CLI Subcommands

Each subcommand maps directly to an existing handler function. No new business logic needed — just argument parsing and output formatting.

#### `setup <dir>`
Maps to: `setupProjectHandler()`
```
npx forgecraft-mcp setup .
npx forgecraft-mcp setup /path/to/project --tags UNIVERSAL API --tier recommended
npx forgecraft-mcp setup . --targets claude cursor --dry-run
```
Flags:
- `--tags <tags...>` — override auto-detected tags
- `--tier <core|recommended|optional>` — content depth (default: recommended)
- `--targets <targets...>` — AI assistant targets (default: claude)
- `--name <name>` — project name (default: inferred from directory)
- `--description <text>` — project description for better tag detection
- `--dry-run` — preview without writing files

#### `refresh <dir>`
Maps to: `refreshProjectHandler()`
```
npx forgecraft-mcp refresh .
npx forgecraft-mcp refresh . --apply
npx forgecraft-mcp refresh . --apply --add-tags HIPAA --remove-tags WEB-STATIC
```
Flags:
- `--apply` — write changes (default: preview only)
- `--add-tags <tags...>` — explicitly add tags
- `--remove-tags <tags...>` — explicitly remove tags
- `--tier <core|recommended|optional>` — override tier
- `--targets <targets...>` — override output targets

#### `audit <dir>`
Maps to: `auditProjectHandler()`
```
npx forgecraft-mcp audit .
npx forgecraft-mcp audit . --tags UNIVERSAL API HIPAA
npx forgecraft-mcp audit . --no-anti-patterns
```
Flags:
- `--tags <tags...>` — tags to audit against (required, or read from forgecraft.yaml)
- `--no-anti-patterns` — skip source file scanning

#### `scaffold <dir>`
Maps to: `scaffoldProjectHandler()`
```
npx forgecraft-mcp scaffold . --tags UNIVERSAL API
npx forgecraft-mcp scaffold . --tags UNIVERSAL API --language python --dry-run
```
Flags:
- `--tags <tags...>` — required
- `--language <typescript|python>` — default: typescript
- `--name <name>` — project name
- `--targets <targets...>` — output targets
- `--dry-run` — preview
- `--force` — overwrite existing files

#### `review`
Maps to: `reviewProjectHandler()`
```
npx forgecraft-mcp review --tags UNIVERSAL API
npx forgecraft-mcp review --tags UNIVERSAL --scope focused
```
Flags:
- `--tags <tags...>` — required
- `--scope <comprehensive|focused>` — default: comprehensive

#### `list [resource]`
Maps to: `listTagsHandler()`, `listHooksHandler()`, `listSkillsHandler()`
```
npx forgecraft-mcp list tags
npx forgecraft-mcp list hooks --tags UNIVERSAL
npx forgecraft-mcp list skills --tags API
```
Resource: `tags` (default), `hooks`, `skills`
Flags:
- `--tags <tags...>` — filter (for hooks/skills)

#### Other subcommands (lower priority)
- `classify <dir>` — suggest tags
- `generate <dir>` — generate instruction files only
- `convert <dir>` — migration plan
- `add-hook <name> <dir>` — install a single hook
- `add-module <name> <dir>` — scaffold a module

### 3. Minimal MCP Sentinel Tool

Replace the current 2 MCP tools with a single diagnostic tool:

```typescript
const sentinelSchema = z.object({
  project_dir: z.string().describe("Absolute path to project root."),
});

async function sentinelHandler(args) {
  const projectDir = args.project_dir;
  const hasConfig = existsSync(join(projectDir, "forgecraft.yaml"));
  const hasClaudeMd = existsSync(join(projectDir, "CLAUDE.md"));
  const hasHooks = existsSync(join(projectDir, ".claude", "hooks"));

  const recommendations: string[] = [];

  if (!hasConfig && !hasClaudeMd) {
    recommendations.push(
      "Project has no engineering standards configured.",
      "Run: `npx forgecraft-mcp setup " + projectDir + "`",
      "This will auto-detect your stack, generate CLAUDE.md, hooks, and skills."
    );
  } else if (hasConfig && !hasHooks) {
    recommendations.push(
      "Project has config but missing hooks/skills.",
      "Run: `npx forgecraft-mcp scaffold " + projectDir + "`"
    );
  } else if (hasConfig) {
    // Check if config is stale (forgecraft.yaml modified long ago but project changed)
    recommendations.push(
      "Project is configured. To re-sync after changes:",
      "Run: `npx forgecraft-mcp refresh " + projectDir + " --apply`",
      "",
      "To audit against standards:",
      "Run: `npx forgecraft-mcp audit " + projectDir + "`"
    );
  }

  recommendations.push(
    "",
    "---",
    "ForgeCraft is a setup-time tool. Once your project is configured,",
    "you can remove it from your MCP servers to save tokens.",
    "Re-add it temporarily when you need to refresh or audit."
  );

  return {
    content: [{ type: "text", text: recommendations.join("\n") }],
  };
}
```

**MCP registration:**
```typescript
server.tool(
  "forgecraft",
  "Setup-time tool for engineering standards. Diagnoses project state and recommends CLI commands. Remove this MCP server after setup is complete.",
  sentinelSchema.shape,
  sentinelHandler,
);
```

### 4. Output Formatting for CLI

MCP handlers return `{ content: [{ type: "text", text: "..." }] }`. For CLI mode, we need to extract the text and print it to stdout. The handlers already produce well-formatted markdown text, so this is straightforward:

```typescript
async function runCliCommand(args: string[]): Promise<void> {
  const command = args[0];
  // ... parse flags with commander or manual parsing ...

  const result = await handler(parsedArgs);
  const text = result.content[0]?.text ?? "";

  // Strip markdown formatting for terminal output, or just print as-is
  // (most terminals render markdown reasonably)
  console.log(text);
  process.exit(0);
}
```

### 5. Reading Config from forgecraft.yaml

For CLI commands like `audit` where `--tags` is required, we should also support reading tags from `forgecraft.yaml` if it exists. This way users don't have to re-specify tags every time:

```
npx forgecraft-mcp audit .               # reads tags from forgecraft.yaml
npx forgecraft-mcp audit . --tags API     # explicit override
```

The `loadUserOverrides()` function in `src/registry/loader.ts` already does this — just wire it into the CLI argument resolution.

## Implementation Plan

### Phase 1: CLI Entry Point + Core Commands
**Files:**
- `src/index.ts` — add argument detection, route to CLI or MCP server
- `src/cli.ts` — **new**, CLI argument parser and command dispatcher
- `package.json` — add `commander` dependency (optional, could parse manually)

**Commands to implement first:** `setup`, `refresh`, `audit` (the three most common operations)

**Tests:**
- `tests/cli.test.ts` — test argument parsing and command routing
- Existing handler tests remain valid (handlers unchanged)

### Phase 2: Remaining CLI Commands
Add `scaffold`, `review`, `list`, `classify`, `generate`, `convert`, `add-hook`, `add-module`

### Phase 3: MCP Sentinel
- `src/tools/sentinel.ts` — **new**, minimal diagnostic tool
- `src/index.ts` — replace current 2-tool registration with 1 sentinel tool
- Update `server.json` description

### Phase 4: Documentation + Messaging
- Update README.md with CLI usage
- Update `setup_project` output to recommend removing MCP server
- Update npm/MCP Registry descriptions

## Migration Path

**v0.4.0 (current):** 2 MCP tools, no CLI
**v0.5.0:** Add CLI commands alongside existing MCP tools (non-breaking)
**v1.0.0:** Replace 2 MCP tools with 1 sentinel tool (breaking MCP interface change)

This lets existing MCP users transition gradually — they can start using CLI commands in v0.5.0 while their MCP config still works, then update to the sentinel in v1.0.0.

## File Summary

| File | Action | Phase |
|------|--------|-------|
| `src/index.ts` | Modify — add CLI/MCP routing | 1 |
| `src/cli.ts` | **New** — CLI argument parser | 1 |
| `src/tools/sentinel.ts` | **New** — minimal MCP tool | 3 |
| `tests/cli.test.ts` | **New** — CLI tests | 1 |
| `package.json` | Modify — add commander dep (optional) | 1 |
| `server.json` | Modify — update description | 3 |
| `README.md` | Modify — add CLI usage docs | 4 |

## Key Decisions Still Open

1. **Argument parser:** Use `commander` (adds ~30KB dependency) or parse `process.argv` manually (no deps, but more code)?
   - Recommendation: `commander` — it's standard for Node CLI tools, handles help text and validation.

2. **Default behavior with no args:** Start MCP server (backward compatible) or show help?
   - Recommendation: Start MCP server (backward compat). Use `serve` subcommand as explicit alias.

3. **Should the sentinel tool actually DO anything, or just recommend CLI commands?**
   - Recommendation: Just diagnose and recommend. Keeps the MCP tool near-zero cost. The AI can then tell the user to run the CLI command, or run it via bash tool itself.

4. **Should we keep the full MCP tools as a `--full-mcp` flag?**
   - Recommendation: No. The CLI replaces the need for full MCP tools. Keep it simple.
