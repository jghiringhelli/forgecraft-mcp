/**
 * Structured logging for ForgeCraft.
 * JSON-formatted log entries with consistent fields.
 */
// @ts-nocheck


type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/** Structured log entry. */
interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

/**
 * Create a logger for a specific module.
 * Respects LOG_LEVEL environment variable.
 */
export function createLogger(module: string): Logger {
  const minLevel = (process.env["LOG_LEVEL"] ?? "INFO").toUpperCase() as LogLevel;
  return new Logger(module, minLevel);
}

/** Structured logger that outputs JSON to stderr (stdout reserved for MCP). */
export class Logger {
  constructor(
    private readonly module: string,
    private readonly minLevel: LogLevel,
  ) {}

  /** Log a debug message with optional context. */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log("DEBUG", message, context);
  }

  /** Log an info message with optional context. */
  info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  /** Log a warning message with optional context. */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  /** Log an error message with optional context. */
  error(message: string, context?: Record<string, unknown>): void {
    this.log("ERROR", message, context);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: "forgecraft",
      module: this.module,
      message,
      ...context,
    };

    // MCP uses stdout for protocol — logs go to stderr
    process.stderr.write(JSON.stringify(entry) + "\n");
  }
}
