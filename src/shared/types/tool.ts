/**
 * MCP tool result and ambiguity types.
 */

/**
 * One ambiguity detected in a tool call.
 *
 * When a tool cannot determine the caller's intent with confidence,
 * it surfaces the interpretation it used and the alternatives it
 * considered, so the caller can correct course with a single follow-up.
 */
export interface ToolAmbiguity {
  /** Aspect that is ambiguous: "project_type", "roadmap_item", "cascade_step", etc. */
  readonly field: string;
  /** What the tool assumed — concrete and specific, not "I think you meant X". */
  readonly understood_as: string;
  /** Concrete example of what the tool would do under this interpretation. */
  readonly understood_example: string;
  /** Alternative interpretations with their different outcomes. */
  readonly alternatives: ReadonlyArray<{
    /** Short label, e.g. "If you meant a REST API..." */
    readonly label: string;
    /** What would happen differently under this alternative. */
    readonly action: string;
  }>;
  /** What the user should provide to resolve: e.g. "Pass project_type_override='api'" */
  readonly resolution_hint: string;
}

/**
 * Standard MCP tool result, extended with optional ambiguity annotations.
 *
 * The router formats `ambiguities` into the text output with a ⚡ prefix
 * before returning to the MCP caller. Handlers that detect ambiguous input
 * populate this field rather than silently choosing an interpretation.
 */
export interface ToolResult {
  readonly content: Array<{ readonly type: "text"; readonly text: string }>;
  readonly ambiguities?: ToolAmbiguity[];
}
