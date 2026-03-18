/**
 * add_module tool handler.
 *
 * Scaffolds a new feature module following established patterns.
 */
// @ts-nocheck


import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_TAGS } from "../shared/types.js";
import type { Tag } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

export const addModuleSchema = z.object({
  module_name: z
    .string()
    .describe("Name of the module (e.g. 'connections', 'auth', 'payments')."),
  tags: z
    .array(z.enum(ALL_TAGS as unknown as [string, ...string[]]))
    .default(["UNIVERSAL"])
    .describe("Tags to apply to the module for pattern selection."),
  language: z
    .enum(["typescript", "python"])
    .default("typescript")
    .describe("Programming language for generated files."),
  project_dir: z
    .string()
    .describe("Absolute path to the project root directory."),
});

// ── Handler ──────────────────────────────────────────────────────────

export async function addModuleHandler(
  args: z.infer<typeof addModuleSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const tags = args.tags as Tag[];
  const moduleName = args.module_name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const className = toPascalCase(moduleName);

  const filesCreated: string[] = [];

  if (args.language === "typescript") {
    const moduleDir = join(args.project_dir, "src", "modules", moduleName);
    const files = generateTypeScriptModule(moduleDir, moduleName, className, tags);
    filesCreated.push(...files);
  } else {
    const moduleDir = join(args.project_dir, "src", moduleName);
    const files = generatePythonModule(moduleDir, moduleName, className, tags);
    filesCreated.push(...files);
  }

  let text = `# Module Created: ${moduleName}\n\n`;
  text += `**Tags:** ${tags.map((t) => `[${t}]`).join(" ")}\n`;
  text += `**Language:** ${args.language}\n\n`;
  text += `## Files Created\n`;
  text += filesCreated.map((f) => `- \`${f}\``).join("\n");
  text += `\n\n## Next Steps\n`;
  text += `1. Define the \`${className}\` interface in the types file\n`;
  text += `2. Implement the service logic\n`;
  text += `3. Wire up routes/handlers\n`;
  text += `4. Write tests\n`;

  return { content: [{ type: "text", text }] };
}

/**
 * Generate TypeScript module files.
 */
function generateTypeScriptModule(
  moduleDir: string,
  moduleName: string,
  className: string,
  tags: Tag[],
): string[] {
  mkdirSync(moduleDir, { recursive: true });
  const files: string[] = [];
  const relBase = `src/modules/${moduleName}`;

  // Types
  const typesContent = `/**
 * ${className} module types.
 */

export interface ${className} {
  readonly id: string;
  // TODO: Define ${className} properties
}

export interface Create${className}Input {
  // TODO: Define creation input
}

export interface Update${className}Input {
  readonly id: string;
  // TODO: Define update input
}
`;
  writeFileSync(join(moduleDir, "types.ts"), typesContent);
  files.push(`${relBase}/types.ts`);

  // Interface
  const interfaceContent = `/**
 * ${className} service interface.
 *
 * Defines the contract — implementations are swappable.
 */

import type { ${className}, Create${className}Input, Update${className}Input } from "./types.js";

export interface I${className}Service {
  create(input: Create${className}Input): Promise<${className}>;
  findById(id: string): Promise<${className} | null>;
  update(input: Update${className}Input): Promise<${className}>;
  delete(id: string): Promise<void>;
}
`;
  writeFileSync(join(moduleDir, "interface.ts"), interfaceContent);
  files.push(`${relBase}/interface.ts`);

  // Service implementation
  const serviceContent = `/**
 * ${className} service implementation.
 */

import type { ${className}, Create${className}Input, Update${className}Input } from "./types.js";
import type { I${className}Service } from "./interface.js";

export class ${className}Service implements I${className}Service {
  async create(input: Create${className}Input): Promise<${className}> {
    // TODO: Implement creation logic
    throw new Error("Not implemented");
  }

  async findById(id: string): Promise<${className} | null> {
    // TODO: Implement find logic
    throw new Error("Not implemented");
  }

  async update(input: Update${className}Input): Promise<${className}> {
    // TODO: Implement update logic
    throw new Error("Not implemented");
  }

  async delete(id: string): Promise<void> {
    // TODO: Implement delete logic
    throw new Error("Not implemented");
  }
}
`;
  writeFileSync(join(moduleDir, "service.ts"), serviceContent);
  files.push(`${relBase}/service.ts`);

  // Index barrel
  const indexContent = `export type { ${className}, Create${className}Input, Update${className}Input } from "./types.js";
export type { I${className}Service } from "./interface.js";
export { ${className}Service } from "./service.js";
`;
  writeFileSync(join(moduleDir, "index.ts"), indexContent);
  files.push(`${relBase}/index.ts`);

  // API routes if API tag present
  if (tags.includes("API")) {
    const routesContent = `/**
 * ${className} API routes.
 */

// TODO: Register routes with your HTTP framework
// Example:
// router.post("/${moduleName}", create${className}Handler);
// router.get("/${moduleName}/:id", get${className}Handler);
// router.put("/${moduleName}/:id", update${className}Handler);
// router.delete("/${moduleName}/:id", delete${className}Handler);

export {};
`;
    writeFileSync(join(moduleDir, "routes.ts"), routesContent);
    files.push(`${relBase}/routes.ts`);
  }

  // Test file
  const testDir = join(moduleDir, "__tests__");
  mkdirSync(testDir, { recursive: true });

  const testContent = `import { describe, it, expect } from "vitest";
import { ${className}Service } from "../service.js";

describe("${className}Service", () => {
  it("should be defined", () => {
    const service = new ${className}Service();
    expect(service).toBeDefined();
  });

  // TODO: Add comprehensive tests
});
`;
  writeFileSync(join(testDir, `${moduleName}.test.ts`), testContent);
  files.push(`${relBase}/__tests__/${moduleName}.test.ts`);

  return files;
}

/**
 * Generate Python module files.
 */
function generatePythonModule(
  moduleDir: string,
  moduleName: string,
  className: string,
  _tags: Tag[],
): string[] {
  mkdirSync(moduleDir, { recursive: true });
  const files: string[] = [];
  const relBase = `src/${moduleName}`;

  // __init__.py
  writeFileSync(
    join(moduleDir, "__init__.py"),
    `"""${className} module."""\n`,
  );
  files.push(`${relBase}/__init__.py`);

  // models.py
  const modelsContent = `"""${className} data models."""

from dataclasses import dataclass


@dataclass
class ${className}:
    id: str
    # TODO: Define ${className} fields


@dataclass
class Create${className}Input:
    # TODO: Define creation input
    pass


@dataclass
class Update${className}Input:
    id: str
    # TODO: Define update input
`;
  writeFileSync(join(moduleDir, "models.py"), modelsContent);
  files.push(`${relBase}/models.py`);

  // service.py
  const serviceContent = `"""${className} service."""

from .models import ${className}, Create${className}Input, Update${className}Input


class ${className}Service:
    async def create(self, input: Create${className}Input) -> ${className}:
        raise NotImplementedError

    async def find_by_id(self, id: str) -> ${className} | None:
        raise NotImplementedError

    async def update(self, input: Update${className}Input) -> ${className}:
        raise NotImplementedError

    async def delete(self, id: str) -> None:
        raise NotImplementedError
`;
  writeFileSync(join(moduleDir, "service.py"), serviceContent);
  files.push(`${relBase}/service.py`);

  return files;
}

/**
 * Convert kebab-case to PascalCase.
 */
function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
