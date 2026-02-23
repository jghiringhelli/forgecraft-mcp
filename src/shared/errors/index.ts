/**
 * Custom error hierarchy for ForgeCraft.
 * Never throw bare Error — use these typed errors with context.
 */

/** Base error for all ForgeCraft errors. */
export class ForgeError extends Error {
  public readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
  }
}

/** A requested template or tag was not found in the registry. */
export class TemplateNotFoundError extends ForgeError {
  constructor(tag: string, section?: string) {
    super(
      `Template not found: tag=${tag}${section ? `, section=${section}` : ""}`,
      { tag, section },
    );
  }
}

/** Input validation failed for a tool call. */
export class ValidationError extends ForgeError {
  constructor(message: string, field?: string) {
    super(message, { field });
  }
}

/** File system operation failed. */
export class FileSystemError extends ForgeError {
  constructor(message: string, filePath: string) {
    super(message, { filePath });
  }
}

/** Project analysis detected an issue. */
export class AnalysisError extends ForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details ?? {});
  }
}

/** A YAML template file has invalid structure. */
export class TemplateParseError extends ForgeError {
  constructor(filePath: string, reason: string) {
    super(`Failed to parse template: ${reason}`, { filePath, reason });
  }
}

/** Remote MCP server discovery failed. */
export class DiscoveryError extends ForgeError {
  constructor(message: string, url?: string) {
    super(message, { url });
  }
}
