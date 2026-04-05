/**
 * CLI mode for ForgeCraft.
 *
 * Handles `npx forgecraft-mcp <command> [args]` invocations.
 * Each subcommand maps directly to an existing handler function.
 * Returns `true` when a command is handled so the caller skips MCP server startup.
 */

import { parseCliArgs } from "./cli/args.js";
import { showHelp } from "./cli/help.js";
import {
  cmdSetup,
  cmdRefresh,
  cmdAdvice,
  cmdMetrics,
  cmdAudit,
  cmdScaffold,
  cmdReview,
  cmdList,
  cmdClassify,
  cmdGenerate,
  cmdConvert,
  cmdAddHook,
  cmdVerify,
  cmdAddModule,
  cmdCheckCascade,
  cmdViolations,
  cmdStatus,
} from "./cli/commands.js";

// ── Entry Point ──────────────────────────────────────────────────────

/**
 * Run CLI mode. Returns `true` when a command was handled, `false` to fall
 * through to MCP server startup.
 *
 * @param argv - Raw process.argv (will be sliced from index 2)
 */
export async function runCli(argv: string[]): Promise<boolean> {
  const args = argv.slice(2);
  if (args.length === 0) return false; // no args → start MCP server

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return true;
  }

  const { command, positional, flags } = parseCliArgs(args);

  if (command === "serve") return false;

  try {
    switch (command) {
      case "setup":
        await cmdSetup(positional, flags);
        break;
      case "refresh":
        await cmdRefresh(positional, flags);
        break;
      case "audit":
        await cmdAudit(positional, flags);
        break;
      case "scaffold":
        await cmdScaffold(positional, flags);
        break;
      case "review":
        await cmdReview(positional, flags);
        break;
      case "list":
        await cmdList(positional, flags);
        break;
      case "classify":
        await cmdClassify(positional, flags);
        break;
      case "generate":
        await cmdGenerate(positional, flags);
        break;
      case "convert":
        await cmdConvert(positional, flags);
        break;
      case "add-hook":
        await cmdAddHook(positional, flags);
        break;
      case "add-module":
        await cmdAddModule(positional, flags);
        break;
      case "check-cascade":
        await cmdCheckCascade(positional, flags);
        break;
      case "violations":
        await cmdViolations(positional, flags);
        break;
      case "status":
        await cmdStatus(positional, flags);
        break;
      case "verify":
        await cmdVerify(positional, flags);
        break;
      case "advice":
        await cmdAdvice(positional, flags);
        break;
      case "metrics":
        await cmdMetrics(positional, flags);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }

  return true;
}
