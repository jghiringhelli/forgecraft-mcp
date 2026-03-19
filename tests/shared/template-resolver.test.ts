/**
 * Tests for template-resolver.ts
 */
import { describe, it, expect } from "vitest";
import { resolveTemplatePlaceholders } from "../../src/shared/template-resolver.js";
import type { PlaceholderContext } from "../../src/shared/template-resolver.js";

describe("resolveTemplatePlaceholders", () => {
  it("substitutes {{repo_url}} with provided value", () => {
    const context: PlaceholderContext = { repoUrl: "https://github.com/acme/app" };
    const result = resolveTemplatePlaceholders("Repo: {{repo_url}}", context);
    expect(result).toBe("Repo: https://github.com/acme/app");
  });

  it("substitutes {{repo_url}} with FILL marker when undefined", () => {
    const context: PlaceholderContext = {};
    const result = resolveTemplatePlaceholders("Repo: {{repo_url}}", context);
    expect(result).toContain("FILL");
  });

  it("substitutes {{framework}} when provided", () => {
    const context: PlaceholderContext = { framework: "Next.js" };
    const result = resolveTemplatePlaceholders("Framework: {{framework}}", context);
    expect(result).toBe("Framework: Next.js");
  });

  it("removes lines with {{framework}} when not detected", () => {
    const context: PlaceholderContext = {};
    const result = resolveTemplatePlaceholders("Line 1\n- Framework: {{framework}}\nLine 3", context);
    expect(result).not.toContain("{{framework}}");
    expect(result).not.toContain("Framework:");
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 3");
  });

  it("substitutes {{domain}} when provided", () => {
    const context: PlaceholderContext = { domain: "healthcare" };
    const result = resolveTemplatePlaceholders("Domain: {{domain}}", context);
    expect(result).toBe("Domain: healthcare");
  });

  it("substitutes {{domain}} with FILL marker when undefined", () => {
    const context: PlaceholderContext = {};
    const result = resolveTemplatePlaceholders("Domain: {{domain}}", context);
    expect(result).toContain("FILL");
  });

  it("substitutes {{sensitive_data}} when provided", () => {
    const context: PlaceholderContext = { sensitiveData: "YES" };
    const result = resolveTemplatePlaceholders("Sensitive: {{sensitive_data}}", context);
    expect(result).toBe("Sensitive: YES");
  });

  it("leaves unknown {{placeholders}} untouched", () => {
    const context: PlaceholderContext = {};
    const result = resolveTemplatePlaceholders("{{unknown_var}}", context);
    expect(result).toBe("{{unknown_var}}");
  });

  it("substitutes multiple {{repo_url}} occurrences", () => {
    const context: PlaceholderContext = { repoUrl: "https://github.com/org/repo" };
    const result = resolveTemplatePlaceholders("{{repo_url}} and {{repo_url}}", context);
    expect(result).toBe("https://github.com/org/repo and https://github.com/org/repo");
  });

  it("does not substitute {{sensitive_data}} when sensitiveData is undefined", () => {
    const context: PlaceholderContext = {};
    const result = resolveTemplatePlaceholders("Sensitive: {{sensitive_data}}", context);
    expect(result).toBe("Sensitive: {{sensitive_data}}");
  });
});
