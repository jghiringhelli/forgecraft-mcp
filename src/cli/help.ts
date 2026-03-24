/**
 * ForgeCraft CLI help text.
 */

/**
 * Print usage help to stdout.
 */
export function showHelp(): void {
  console.log(`
ForgeCraft MCP — engineering standards for AI coding assistants

USAGE
  npx forgecraft-mcp <command> [arguments] [flags]
  npx forgecraft-mcp serve                         (default — starts MCP server)

COMMANDS
  setup   <dir>          First-time project setup (auto-detects stack)
  refresh <dir>          Re-sync instruction files after project changes
  audit   <dir>          Check project against configured standards
  scaffold <dir>         Generate project structure and instruction files
  review  [dir]          Generate code review checklist
  list    [tags|hooks|skills]   Discover available resources
  classify [dir]         Suggest tags for a project
  generate <dir>         Generate instruction files only
  convert <dir>          Generate migration plan
  add-hook <name> <dir>  Install a quality-gate hook
  add-module <name> <dir> Scaffold a feature module
  verify  [dir]          Run tests + score §4.3 GS properties + report layer violations
  advice  [dir]          Quality cycle checklist + tool stack + example configs for your tags
  metrics [dir]          External quality report: LOC, coverage, layer violations, dead code, complexity
FLAGS (vary by command)
  --tags <tags...>       Project classification tags (or read from forgecraft.yaml)
  --tier <tier>          Content depth: core | recommended | optional
  --targets <targets...> AI assistant targets: claude cursor copilot windsurf cline aider
  --name <name>          Project name
  --description <text>   Project description for tag detection
  --dry-run              Preview without writing files
  --apply                Apply changes (for refresh, default is preview)
  --add-tags <tags...>   Add tags during refresh
  --remove-tags <tags...> Remove tags during refresh
  --no-anti-patterns     Skip anti-pattern scanning (for audit)
  --language <lang>      typescript | python (default: typescript)
  --scope <scope>        comprehensive | focused (for review)
  --test-cmd <cmd>       Test command override for verify (default: npm test)
  --timeout <ms>         Test suite timeout in milliseconds (default: 120000)
  --threshold <n>        Minimum GS score out of 12 for pass (default: 10)
  --mutation             Run Stryker mutation testing (slow, opt-in; used by metrics)
  --coverage-dir <path>  Path to existing coverage report directory (used by metrics)
  --force                Overwrite existing files
  --compact              Strip explanatory bullet tails and deduplicate lines (~20-40% smaller output)
  --tag <tag>            Single tag filter (for add-hook)
  --check                Drift-check mode for refresh: exit 1 if tag/tier drift detected (CI gate)
`);
}
