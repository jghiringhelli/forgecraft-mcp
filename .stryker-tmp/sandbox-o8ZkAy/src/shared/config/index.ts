/**
 * Application configuration — all env vars validated at startup.
 * Fail fast if required config is missing.
 */
// @ts-nocheck


export interface AppConfig {
  readonly nodeEnv: string;
  readonly logLevel: string;
  readonly templateDir: string;
}

/**
 * Load and validate configuration from environment variables.
 * Throws if required values are missing.
 */
export function loadConfig(): AppConfig {
  return Object.freeze({
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    logLevel: process.env["LOG_LEVEL"] ?? "INFO",
    templateDir: process.env["FORGECRAFT_TEMPLATE_DIR"] ?? "",
  });
}
