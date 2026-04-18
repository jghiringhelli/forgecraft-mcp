/**
 * generate_env_probe tool handler.
 *
 * Reads environment probe specs from .forgecraft/env/*.yaml and scaffolds
 * executable probe files in tests/env/. Idempotent — skips existing unless force=true.
 */

import { z } from "zod";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import type { ToolResult } from "../shared/types.js";

// ── Schema ───────────────────────────────────────────────────────────

export const generateEnvProbeSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  force: z
    .boolean()
    .optional()
    .describe("Overwrite existing probe files. Default: false."),
});

export type GenerateEnvProbeInput = z.infer<typeof generateEnvProbeSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export interface EnvProbeSpec {
  service: string;
  title?: string;
  probes?: Array<{
    id: string;
    type: string;
    description?: string;
    url?: string;
    vars?: string[];
    host?: string;
    port?: number;
  }>;
}

export interface EnvGenerateResult {
  service: string;
  probeId: string;
  probeType: string;
  probeFile: string;
  status: "generated" | "skipped" | "error";
  reason?: string;
}

// ── Probe type → file extension ───────────────────────────────────────

export function envExtensionForType(probeType: string): string {
  switch (probeType) {
    case "health_check":
      return ".health.sh";
    case "env_var":
      return ".env.sh";
    case "port_check":
      return ".port.sh";
    case "schema_validate":
      return ".schema.sh";
    case "docker_check":
      return ".docker.sh";
    case "migration_check":
      return ".migration.sh";
    default:
      return ".sh";
  }
}

// ── Probe content generators ──────────────────────────────────────────

function generateHealthCheckContent(
  service: string,
  probeId: string,
  description: string,
  url?: string,
): string {
  const targetUrl = url ?? "http://{{host}}:{{port}}/health";
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: health_check
# Description: ${description}
set -euo pipefail

# TODO: set actual health endpoint URL
URL="${targetUrl}"

if ! command -v curl &>/dev/null; then
  echo "FAIL: curl not found — cannot run health check"
  exit 1
fi

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "PASS: ${probeId} — health endpoint returned 200"
else
  echo "FAIL: ${probeId} — health endpoint returned $HTTP_STATUS (expected 200)"
  exit 1
fi
`;
}

function generateEnvVarContent(
  service: string,
  probeId: string,
  description: string,
  vars?: string[],
): string {
  const varList =
    vars && vars.length > 0 ? vars : ["# TODO: add required env var names"];
  const checkLines =
    vars && vars.length > 0
      ? vars
          .map(
            (v) =>
              `if [ -z "\${${v}:-}" ]; then\n  echo "FAIL: ${probeId} — required env var ${v} is not set or empty"\n  exit 1\nfi`,
          )
          .join("\n")
      : `# TODO: check required env vars\necho "TODO: implement env var checks for ${probeId}"\nexit 1`;
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: env_var
# Description: ${description}
# Required vars: ${varList.join(", ")}
set -euo pipefail

${checkLines}

echo "PASS: ${probeId} — all required env vars are set"
`;
}

function generatePortCheckContent(
  service: string,
  probeId: string,
  description: string,
  host?: string,
  port?: number,
): string {
  const targetHost = host ?? "{{db_host}}";
  const targetPort = port ?? 5432;
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: port_check
# Description: ${description}
set -euo pipefail

# TODO: set actual host and port
HOST="${targetHost}"
PORT="${targetPort}"

if command -v nc &>/dev/null; then
  if nc -z -w 5 "$HOST" "$PORT" 2>/dev/null; then
    echo "PASS: ${probeId} — port $HOST:$PORT is reachable"
  else
    echo "FAIL: ${probeId} — port $HOST:$PORT is not reachable"
    exit 1
  fi
elif command -v curl &>/dev/null; then
  if curl -s --max-time 5 "telnet://$HOST:$PORT" &>/dev/null || curl -s --connect-timeout 5 "$HOST:$PORT" &>/dev/null; then
    echo "PASS: ${probeId} — port $HOST:$PORT is reachable"
  else
    echo "FAIL: ${probeId} — port $HOST:$PORT is not reachable"
    exit 1
  fi
else
  echo "FAIL: ${probeId} — neither nc nor curl found"
  exit 1
fi
`;
}

function generateSchemaValidateContent(
  service: string,
  probeId: string,
  description: string,
): string {
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: schema_validate
# Description: ${description}
set -euo pipefail

# TODO: set path to .env.example and actual env file
ENV_EXAMPLE=".env.example"
ENV_FILE=".env"

if [ ! -f "$ENV_EXAMPLE" ]; then
  echo "FAIL: ${probeId} — .env.example not found at $ENV_EXAMPLE"
  exit 1
fi

MISSING=()
while IFS= read -r line; do
  # Extract var name (skip comments and empty lines)
  [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
  VAR_NAME=$(echo "$line" | cut -d= -f1)
  if [ -z "\${!VAR_NAME:-}" ]; then
    MISSING+=("$VAR_NAME")
  fi
done < "$ENV_EXAMPLE"

if [ \${#MISSING[@]} -gt 0 ]; then
  echo "FAIL: ${probeId} — missing env vars: \${MISSING[*]}"
  exit 1
fi

echo "PASS: ${probeId} — env schema validated against .env.example"
`;
}

function generateDockerCheckContent(
  service: string,
  probeId: string,
  description: string,
): string {
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: docker_check
# Description: ${description}
set -euo pipefail

# TODO: set actual container name
CONTAINER_NAME="${service}"

if ! command -v docker &>/dev/null; then
  echo "FAIL: ${probeId} — docker not found"
  exit 1
fi

if docker compose ps --format json 2>/dev/null | grep -q "$CONTAINER_NAME"; then
  STATUS=$(docker compose ps --format json 2>/dev/null | grep "$CONTAINER_NAME" | grep -o '"State":"[^"]*"' | head -1)
  if echo "$STATUS" | grep -q '"running"'; then
    echo "PASS: ${probeId} — container $CONTAINER_NAME is running"
  else
    echo "FAIL: ${probeId} — container $CONTAINER_NAME is not running: $STATUS"
    exit 1
  fi
elif docker ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then
  echo "PASS: ${probeId} — container $CONTAINER_NAME is running"
else
  echo "FAIL: ${probeId} — container $CONTAINER_NAME is not running"
  exit 1
fi
`;
}

function generateMigrationCheckContent(
  service: string,
  probeId: string,
  description: string,
): string {
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: migration_check
# Description: ${description}
set -euo pipefail

DB_URL="\${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo "FAIL: ${probeId} — DATABASE_URL not set"
  exit 1
fi

# TODO: adapt to your migration tool (prisma, flyway, liquibase, etc.)
if command -v prisma &>/dev/null; then
  PENDING=$(npx prisma migrate status 2>&1 | grep -c "pending" || true)
  if [ "$PENDING" -gt 0 ]; then
    echo "FAIL: ${probeId} — $PENDING pending migration(s)"
    exit 1
  fi
  echo "PASS: ${probeId} — no pending migrations"
else
  echo "TODO: implement migration check for ${probeId} — set up migration tool"
  exit 1
fi
`;
}

export function generateEnvProbeContent(
  service: string,
  probeId: string,
  probeType: string,
  description: string,
  extra?: { url?: string; vars?: string[]; host?: string; port?: number },
): string {
  switch (probeType) {
    case "health_check":
      return generateHealthCheckContent(
        service,
        probeId,
        description,
        extra?.url,
      );
    case "env_var":
      return generateEnvVarContent(service, probeId, description, extra?.vars);
    case "port_check":
      return generatePortCheckContent(
        service,
        probeId,
        description,
        extra?.host,
        extra?.port,
      );
    case "schema_validate":
      return generateSchemaValidateContent(service, probeId, description);
    case "docker_check":
      return generateDockerCheckContent(service, probeId, description);
    case "migration_check":
      return generateMigrationCheckContent(service, probeId, description);
    default:
      return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: ${probeType}
# Description: ${description}
set -euo pipefail

# TODO: implement probe check for ${probeId}
echo "TODO: implement ${probeId}"
exit 1
`;
  }
}

// ── Handler ───────────────────────────────────────────────────────────

export async function generateEnvProbeHandler(
  args: GenerateEnvProbeInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const force = args.force ?? false;

  const envSpecDir = join(projectDir, ".forgecraft", "env");
  if (!existsSync(envSpecDir)) {
    return {
      content: [
        {
          type: "text",
          text: "No env probe specs found. Create .forgecraft/env/service.yaml to define environment contracts.",
        },
      ],
    };
  }

  // Read all spec files
  let specFiles: string[] = [];
  try {
    specFiles = readdirSync(envSpecDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
    );
  } catch {
    specFiles = [];
  }

  if (specFiles.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No env probe specs found. Create .forgecraft/env/service.yaml to define environment contracts.",
        },
      ],
    };
  }

  const envDir = join(projectDir, "tests", "env");
  try {
    mkdirSync(envDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const results: EnvGenerateResult[] = [];

  for (const specFile of specFiles) {
    let spec: EnvProbeSpec;
    try {
      const raw = readFileSync(join(envSpecDir, specFile), "utf-8");
      spec = yaml.load(raw) as EnvProbeSpec;
    } catch {
      continue;
    }

    if (!spec?.service || !spec.probes) continue;

    for (const probe of spec.probes) {
      const ext = envExtensionForType(probe.type);
      const fileName = `${spec.service}-${probe.id}${ext}`;
      const filePath = join(envDir, fileName);
      const relPath = `tests/env/${fileName}`;

      if (existsSync(filePath) && !force) {
        results.push({
          service: spec.service,
          probeId: probe.id,
          probeType: probe.type,
          probeFile: relPath,
          status: "skipped",
          reason: "already exists",
        });
        continue;
      }

      const content = generateEnvProbeContent(
        spec.service,
        probe.id,
        probe.type,
        probe.description ?? probe.id,
        {
          url: probe.url,
          vars: probe.vars,
          host: probe.host,
          port: probe.port,
        },
      );

      try {
        writeFileSync(filePath, content, "utf-8");
        results.push({
          service: spec.service,
          probeId: probe.id,
          probeType: probe.type,
          probeFile: relPath,
          status: "generated",
        });
      } catch (err) {
        results.push({
          service: spec.service,
          probeId: probe.id,
          probeType: probe.type,
          probeFile: relPath,
          status: "error",
          reason: `write failed: ${String(err)}`,
        });
      }
    }
  }

  return { content: [{ type: "text", text: formatEnvReport(results) }] };
}

// ── Report formatter ──────────────────────────────────────────────────

function formatEnvReport(results: EnvGenerateResult[]): string {
  const generated = results.filter((r) => r.status === "generated");
  const skipped = results.filter((r) => r.status === "skipped");
  const noSpec = results.filter((r) => r.status === "error");

  const lines: string[] = [
    "## Env Probe Generation Report",
    "",
    `Generated: ${generated.length}  Skipped: ${skipped.length}  No spec: ${noSpec.length}`,
    "",
    "| Service | Probe | Type | File | Status |",
    "|---|---|---|---|---|",
  ];

  for (const r of results) {
    const statusLabel =
      r.status === "generated"
        ? "✅ generated"
        : r.status === "skipped"
          ? "⏭ skipped"
          : `❌ error: ${r.reason ?? ""}`;
    lines.push(
      `| ${r.service} | ${r.probeId} | ${r.probeType} | ${r.probeFile} | ${statusLabel} |`,
    );
  }

  lines.push("", "To run: call run_env_probe");
  return lines.join("\n");
}
