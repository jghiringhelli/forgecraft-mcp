/**
 * generate_slo_probe tool handler.
 *
 * Reads SLO probe specs from .forgecraft/slo/*.yaml and scaffolds executable
 * probe files in tests/slo/. Idempotent — skips existing unless force=true.
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

export const generateSloProbeSchema = z.object({
  project_dir: z.string().describe("Absolute path to the project root."),
  force: z
    .boolean()
    .optional()
    .describe("Overwrite existing probe files. Default: false."),
});

export type GenerateSloProbeInput = z.infer<typeof generateSloProbeSchema>;

// ── Types ─────────────────────────────────────────────────────────────

export interface SloProbeSpec {
  service: string;
  title?: string;
  nfr_source?: string;
  probes?: Array<{
    id: string;
    type: string;
    description?: string;
    alert_name?: string;
    metric?: string;
    query?: string;
    threshold?: number;
    operator?: string;
    dashboard_name?: string;
  }>;
}

export interface SloGenerateResult {
  service: string;
  probeId: string;
  probeType: string;
  probeFile: string;
  status: "generated" | "skipped" | "error";
  reason?: string;
}

// ── Probe type → file extension ───────────────────────────────────────

export function sloExtensionForType(probeType: string): string {
  switch (probeType) {
    case "alert_exists":
      return ".alert.sh";
    case "metric_present":
      return ".metric.sh";
    case "dashboard_exists":
      return ".dashboard.sh";
    case "slo_assertion":
      return ".slo.sh";
    case "synthetic_load":
      return ".k6.js";
    default:
      return ".sh";
  }
}

// ── Probe content generators ──────────────────────────────────────────

function generateAlertExistsContent(
  service: string,
  probeId: string,
  description: string,
  alertName?: string,
): string {
  const name = alertName ?? "TODO_AlertName";
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: alert_exists
# Description: ${description}
set -euo pipefail

ALERTMANAGER_URL="\${ALERTMANAGER_URL:-http://localhost:9093}"
ALERT_NAME="${name}"

if ! command -v curl &>/dev/null; then
  echo "FAIL: ${probeId} — curl not found"
  exit 1
fi

# Query Prometheus rules API for alert rule
PROMETHEUS_URL="\${PROMETHEUS_URL:-http://localhost:9090}"
RESPONSE=$(curl -s --max-time 10 "$PROMETHEUS_URL/api/v1/rules" || echo "")

if [ -z "$RESPONSE" ]; then
  echo "FAIL: ${probeId} — could not reach Prometheus at $PROMETHEUS_URL"
  exit 1
fi

if echo "$RESPONSE" | grep -q "$ALERT_NAME"; then
  echo "PASS: ${probeId} — alert rule $ALERT_NAME exists"
else
  echo "FAIL: ${probeId} — alert rule $ALERT_NAME not found in Prometheus rules"
  exit 1
fi
`;
}

function generateMetricPresentContent(
  service: string,
  probeId: string,
  description: string,
  metric?: string,
): string {
  const metricName = metric ?? "TODO_metric_name";
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: metric_present
# Description: ${description}
set -euo pipefail

PROMETHEUS_URL="\${PROMETHEUS_URL:-http://localhost:9090}"
METRIC="${metricName}"

if ! command -v curl &>/dev/null; then
  echo "FAIL: ${probeId} — curl not found"
  exit 1
fi

RESPONSE=$(curl -s --max-time 10 "$PROMETHEUS_URL/api/v1/query?query=$METRIC" || echo "")

if [ -z "$RESPONSE" ]; then
  echo "FAIL: ${probeId} — could not reach Prometheus at $PROMETHEUS_URL"
  exit 1
fi

RESULT_COUNT=$(echo "$RESPONSE" | grep -o '"result":\[' | wc -l || echo "0")
DATA=$(echo "$RESPONSE" | grep -o '"result":\[\]' || echo "")

if [ -n "$DATA" ]; then
  echo "FAIL: ${probeId} — metric $METRIC returns no data in Prometheus"
  exit 1
else
  echo "PASS: ${probeId} — metric $METRIC is present in Prometheus"
fi
`;
}

function generateDashboardExistsContent(
  service: string,
  probeId: string,
  description: string,
): string {
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: dashboard_exists
# Description: ${description}
set -euo pipefail

GRAFANA_URL="\${GRAFANA_URL:-http://localhost:3000}"
# TODO: set actual dashboard UID or title
DASHBOARD_SEARCH="TODO_dashboard_name"

if ! command -v curl &>/dev/null; then
  echo "FAIL: ${probeId} — curl not found"
  exit 1
fi

RESPONSE=$(curl -s --max-time 10 "$GRAFANA_URL/api/search?query=$DASHBOARD_SEARCH" || echo "")

if [ -z "$RESPONSE" ]; then
  echo "FAIL: ${probeId} — could not reach Grafana at $GRAFANA_URL"
  exit 1
fi

COUNT=$(echo "$RESPONSE" | grep -o '"uid"' | wc -l || echo "0")
if [ "$COUNT" -gt 0 ]; then
  echo "PASS: ${probeId} — dashboard '$DASHBOARD_SEARCH' exists in Grafana"
else
  echo "FAIL: ${probeId} — dashboard '$DASHBOARD_SEARCH' not found in Grafana"
  exit 1
fi
`;
}

function generateSloAssertionContent(
  service: string,
  probeId: string,
  description: string,
  query?: string,
  threshold?: number,
  operator?: string,
): string {
  const queryStr = query ?? "TODO_prometheus_query";
  const thresholdStr = threshold !== undefined ? String(threshold) : "0.999";
  const operatorStr = operator ?? ">=";
  return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: slo_assertion
# Description: ${description}
set -euo pipefail

PROMETHEUS_URL="\${PROMETHEUS_URL:-http://localhost:9090}"
# TODO: replace with actual PromQL query
QUERY="${queryStr}"
THRESHOLD="${thresholdStr}"
OPERATOR="${operatorStr}"

if ! command -v curl &>/dev/null; then
  echo "FAIL: ${probeId} — curl not found"
  exit 1
fi

RESPONSE=$(curl -s --max-time 10 "$PROMETHEUS_URL/api/v1/query?query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))" 2>/dev/null || echo "$QUERY")" || echo "")

if [ -z "$RESPONSE" ]; then
  echo "FAIL: ${probeId} — could not reach Prometheus at $PROMETHEUS_URL"
  exit 1
fi

# TODO: extract numeric value and compare against threshold
VALUE=$(echo "$RESPONSE" | grep -o '"value":\[[^]]*\]' | grep -o '[0-9.]*"$' | tr -d '"' || echo "")

if [ -z "$VALUE" ]; then
  echo "FAIL: ${probeId} — no value returned for query: $QUERY"
  exit 1
fi

# Compare value against threshold using awk
RESULT=$(awk "BEGIN { print ($VALUE $OPERATOR $THRESHOLD) ? \"pass\" : \"fail\" }")
if [ "$RESULT" = "pass" ]; then
  echo "PASS: ${probeId} — SLO assertion: $VALUE $OPERATOR $THRESHOLD"
else
  echo "FAIL: ${probeId} — SLO violation: $VALUE is not $OPERATOR $THRESHOLD"
  exit 1
fi
`;
}

function generateK6SloContent(
  service: string,
  probeId: string,
  description: string,
): string {
  return `// Service: ${service}
// Probe: ${probeId}
// Type: synthetic_load
// Description: ${description}
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    // TODO: set actual SLO thresholds from docs/nfr-contracts.md
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // TODO: set actual endpoint URL
  const res = http.get('\${__ENV.TARGET_URL:-http://localhost:3000}/api/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
`;
}

export function generateSloProbeContent(
  service: string,
  probeId: string,
  probeType: string,
  description: string,
  extra?: {
    alert_name?: string;
    metric?: string;
    query?: string;
    threshold?: number;
    operator?: string;
  },
): string {
  switch (probeType) {
    case "alert_exists":
      return generateAlertExistsContent(
        service,
        probeId,
        description,
        extra?.alert_name,
      );
    case "metric_present":
      return generateMetricPresentContent(
        service,
        probeId,
        description,
        extra?.metric,
      );
    case "dashboard_exists":
      return generateDashboardExistsContent(service, probeId, description);
    case "slo_assertion":
      return generateSloAssertionContent(
        service,
        probeId,
        description,
        extra?.query,
        extra?.threshold,
        extra?.operator,
      );
    case "synthetic_load":
      return generateK6SloContent(service, probeId, description);
    default:
      return `#!/usr/bin/env bash
# Service: ${service}
# Probe: ${probeId}
# Type: ${probeType}
# Description: ${description}
set -euo pipefail

PROMETHEUS_URL="\${PROMETHEUS_URL:-http://localhost:9090}"
GRAFANA_URL="\${GRAFANA_URL:-http://localhost:3000}"
ALERTMANAGER_URL="\${ALERTMANAGER_URL:-http://localhost:9093}"

# TODO: implement probe check for ${probeId}
echo "TODO: implement ${probeId}"
exit 1
`;
  }
}

// ── Handler ───────────────────────────────────────────────────────────

export async function generateSloProbeHandler(
  args: GenerateSloProbeInput,
): Promise<ToolResult> {
  const projectDir = resolve(args.project_dir);
  const force = args.force ?? false;

  const sloSpecDir = join(projectDir, ".forgecraft", "slo");
  if (!existsSync(sloSpecDir)) {
    return {
      content: [
        {
          type: "text",
          text: "No SLO probe specs found. Create .forgecraft/slo/service.yaml to define SLO contracts.",
        },
      ],
    };
  }

  let specFiles: string[] = [];
  try {
    specFiles = readdirSync(sloSpecDir).filter(
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
          text: "No SLO probe specs found. Create .forgecraft/slo/service.yaml to define SLO contracts.",
        },
      ],
    };
  }

  const sloDir = join(projectDir, "tests", "slo");
  try {
    mkdirSync(sloDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const results: SloGenerateResult[] = [];

  for (const specFile of specFiles) {
    let spec: SloProbeSpec;
    try {
      const raw = readFileSync(join(sloSpecDir, specFile), "utf-8");
      spec = yaml.load(raw) as SloProbeSpec;
    } catch {
      continue;
    }

    if (!spec?.service || !spec.probes) continue;

    for (const probe of spec.probes) {
      const ext = sloExtensionForType(probe.type);
      const fileName = `${spec.service}-${probe.id}${ext}`;
      const filePath = join(sloDir, fileName);
      const relPath = `tests/slo/${fileName}`;

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

      const content = generateSloProbeContent(
        spec.service,
        probe.id,
        probe.type,
        probe.description ?? probe.id,
        {
          alert_name: probe.alert_name,
          metric: probe.metric,
          query: probe.query,
          threshold: probe.threshold,
          operator: probe.operator,
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

  return { content: [{ type: "text", text: formatSloReport(results) }] };
}

// ── Report formatter ──────────────────────────────────────────────────

function formatSloReport(results: SloGenerateResult[]): string {
  const generated = results.filter((r) => r.status === "generated");
  const skipped = results.filter((r) => r.status === "skipped");
  const errors = results.filter((r) => r.status === "error");

  const lines: string[] = [
    "## SLO Probe Generation Report",
    "",
    `Generated: ${generated.length}  Skipped: ${skipped.length}  No spec: ${errors.length}`,
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

  lines.push("", "To run: call run_slo_probe");
  return lines.join("\n");
}
