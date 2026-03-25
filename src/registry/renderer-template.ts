/**
 * Template engine.
 *
 * Handles {{variable}}, {{variable | default: value}}, and
 * {{#if CONDITION}}...{{/if}} substitution in template strings.
 */

import { createLogger } from "../shared/logger/index.js";
import type { RenderContext } from "./renderer-types.js";

const logger = createLogger("registry/renderer-template");

/**
 * Process conditional blocks in template content.
 *
 * Supports `{{#if CONDITION}}...{{/if}}` where CONDITION is evaluated
 * against the render context. Special synthetic variables:
 * - `language_is_typescript` → true when context.language === "typescript"
 * - `language_is_python` → true when context.language === "python"
 *
 * @param template - Raw template string with conditionals
 * @param context - Render context for condition evaluation
 * @returns Template with conditionals resolved
 */
function processConditionals(
  template: string,
  context: RenderContext,
): string {
  return template.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, condition: string, content: string) => {
      const value = resolveCondition(condition, context);
      return value ? content : "";
    },
  );
}

/**
 * Resolve a conditional variable to a boolean value.
 *
 * @param name - Variable name to evaluate
 * @param context - Render context
 * @returns Whether the condition is truthy
 */
function resolveCondition(name: string, context: RenderContext): boolean {
  if (name === "language_is_typescript") {
    return context.language === "typescript";
  }
  if (name === "language_is_python") {
    return context.language === "python";
  }

  const value = resolveVariable(name, context);
  return value !== undefined && value !== null && value !== "" && value !== false;
}

/**
 * Render a template string by substituting {{variable}} placeholders.
 * Supports {{variable | default: value}} syntax and {{#if}}...{{/if}} conditionals.
 *
 * @param template - Raw template string with placeholders
 * @param context - Project context for variable substitution
 * @returns Rendered string with all placeholders resolved
 */
export function renderTemplate(
  template: string,
  context: RenderContext,
): string {
  const withConditionals = processConditionals(template, context);
  return withConditionals.replace(
    /\{\{(\s*[\w.]+\s*(?:\|\s*default:\s*[^}]+)?)\}\}/g,
    (_match, expression: string) => {
      const parts = expression.split("|").map((p) => p.trim());
      const varName = parts[0] as string;

      const value = resolveVariable(varName, context);

      if (value !== undefined && value !== null && value !== "") {
        return String(value);
      }

      if (parts.length > 1) {
        const defaultPart = parts[1] as string;
        const defaultMatch = defaultPart.match(/^default:\s*(.+)$/);
        if (defaultMatch) {
          return (defaultMatch[1] as string).trim();
        }
      }

      return `{{${varName}}}`;
    },
  );
}

/**
 * Resolve a dotted variable name from the context.
 *
 * @param name - Variable name (supports snake_case to camelCase mapping)
 * @param context - Render context
 * @returns Resolved value, or undefined if not found
 */
function resolveVariable(name: string, context: RenderContext): unknown {
  if (name === "tags") {
    return context.tags.map((t) => `\`[${t}]\``).join(" ");
  }

  const camelName = name.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );

  if (camelName in context) {
    return context[camelName];
  }

  if (name in context) {
    return context[name];
  }

  logger.debug("Unresolved template variable", { variable: name });
  return undefined;
}
