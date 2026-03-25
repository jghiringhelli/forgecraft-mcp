/**
 * Dispatch helpers: sub-resource routers and utility functions.
 */

import type { ToolResult } from "../shared/types.js";
import type { ForgecraftArgs } from "./forgecraft-schema.js";
import { ACTIONS } from "./forgecraft-schema.js";
import {
  listTagsHandler,
  listHooksHandler,
  listSkillsHandler,
} from "./list.js";
import { getNfrTemplateHandler } from "./get-nfr.js";
import {
  getDesignReferenceHandler,
  getGuidanceHandler,
} from "./get-reference.js";
import { getPlaybookHandler } from "./get-playbook.js";

/**
 * Dispatch the `list` action based on the `resource` sub-parameter.
 *
 * @param args - Unified tool arguments
 * @returns Tool result from the appropriate list handler
 */
export async function dispatchList(args: ForgecraftArgs): Promise<ToolResult> {
  const resource = args.resource ?? "tags";

  switch (resource) {
    case "tags":
      return listTagsHandler();
    case "hooks":
      return listHooksHandler({ tags: args.tags });
    case "skills":
      return listSkillsHandler({ tags: args.tags });
    default:
      return errorResult(
        `Invalid resource '${resource}' for list action. Use: tags, hooks, or skills.`,
      );
  }
}

/**
 * Dispatch the `get_reference` action based on the `resource` sub-parameter.
 *
 * @param args - Unified tool arguments
 * @returns Tool result from the appropriate reference handler
 */
export async function dispatchGetReference(
  args: ForgecraftArgs,
): Promise<ToolResult> {
  const resource = args.resource ?? "design_patterns";

  switch (resource) {
    case "nfr": {
      const tags = requireParam(args.tags, "tags", "get_reference[nfr]");
      return getNfrTemplateHandler({ tags });
    }
    case "design_patterns": {
      const tags = requireParam(
        args.tags,
        "tags",
        "get_reference[design_patterns]",
      );
      return getDesignReferenceHandler({ tags });
    }
    case "playbook": {
      const tags = requireParam(args.tags, "tags", "get_reference[playbook]");
      return getPlaybookHandler({ tags, phase: args.name });
    }
    case "guidance":
      return getGuidanceHandler();
    default:
      return errorResult(
        `Invalid resource '${resource}' for get_reference action. Use: nfr, design_patterns, playbook, or guidance.`,
      );
  }
}

/**
 * Require a parameter that is mandatory for a given action.
 * Throws with a clear error if missing.
 *
 * @param value - The parameter value to check
 * @param paramName - Parameter name for the error message
 * @param action - Action name for the error message
 * @returns The value if present
 */
export function requireParam<T>(
  value: T | undefined,
  paramName: string,
  action: string,
): T {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    throw new Error(
      `Missing required parameter '${paramName}' for action '${action}'.`,
    );
  }
  return value;
}

/**
 * Build an error result in MCP tool response format.
 *
 * @param message - The error message to return
 * @returns MCP tool error result
 */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

/**
 * Fallback error for unknown actions.
 *
 * @param action - The unrecognized action string
 * @returns MCP tool error result listing valid actions
 */
export function unknownActionResult(action: string): ToolResult {
  return errorResult(
    `Unknown action: ${action}. Valid actions: ${ACTIONS.join(", ")}`,
  );
}
