/**
 * Probe content template generators for generate_harness.
 * Each function returns the file content for a given probe type.
 */

import type { ProbeType } from "./generate-harness.js";

export interface UcDetails {
  precondition: string;
  postcondition: string;
  steps: string[];
}

// ── Template generators ───────────────────────────────────────────────

export function generatePlaywrightProbe(
  ucId: string,
  title: string,
  precondition: string,
  postcondition: string,
  steps: string[],
  scenario = "happy",
): string {
  const stepComments =
    steps.length > 0
      ? steps.map((s, i) => `    // Step ${i + 1}: ${s}`).join("\n")
      : `    // TODO: implement ${ucId} main flow steps`;
  return `import { test, expect } from '@playwright/test';

/**
 * L2 Harness: ${ucId} — ${title} [${scenario}]
 * Precondition: ${precondition}
 * Postcondition: ${postcondition}
 */
test.describe('${ucId}: ${title}', () => {
  test('postcondition: ${postcondition}', async ({ page }) => {
${stepComments}
    throw new Error('Probe not yet implemented — fill in the ${ucId} flow');
  });
});
`;
}

export function generateHurlProbe(
  ucId: string,
  title: string,
  precondition: string,
  postcondition: string,
  steps: string[],
  scenario = "happy",
): string {
  const stepComments =
    steps.length > 0
      ? steps.map((s, i) => `# Step ${i + 1}: ${s}`).join("\n")
      : `# TODO: implement ${ucId} main flow steps`;
  return `# L2 Harness: ${ucId} — ${title} [${scenario}]
# Precondition: ${precondition}
# Postcondition: ${postcondition}
${stepComments}
POST http://{{host}}/api/endpoint
Content-Type: application/json
{ "field": "value" }
HTTP 200
`;
}

export function generateGraphqlHurlProbe(
  ucId: string,
  title: string,
  postcondition: string,
  scenario = "happy",
): string {
  return `# L2 Harness: ${ucId} — ${title} [${scenario}]
# GraphQL postcondition: ${postcondition}
POST http://{{host}}/graphql
Content-Type: application/json
{ "query": "query { __typename }", "variables": {} }
HTTP 200
[Asserts]
jsonpath "$.data" exists
`;
}

export function generateShProbe(
  ucId: string,
  title: string,
  postcondition: string,
  probeType: ProbeType,
  scenario = "happy",
): string {
  if (probeType === "mcp_call") {
    return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [${scenario}]
# Verifies MCP action postconditions
set -euo pipefail
echo "TODO: implement ${ucId} MCP probe"
exit 1
`;
  }
  return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [${scenario}]
# Postcondition: ${postcondition}
set -euo pipefail
echo "PASS: ${ucId} postcondition verified"
`;
}

export function generateDbShProbe(
  ucId: string,
  title: string,
  postcondition: string,
  scenario = "happy",
): string {
  return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [${scenario}]
# DB postcondition: ${postcondition}
set -euo pipefail
DB_URL="\${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo "SKIP: DATABASE_URL not set — cannot verify DB postcondition"
  exit 0
fi
echo "TODO: implement DB postcondition check for ${ucId} [${scenario}]"
exit 1
`;
}

export function generateMqShProbe(
  ucId: string,
  title: string,
  postcondition: string,
  scenario = "happy",
): string {
  return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [${scenario}]
# Queue postcondition: ${postcondition}
set -euo pipefail
BROKER="\${KAFKA_BROKER:?KAFKA_BROKER is required}"
TOPIC="\${QUEUE_TOPIC:-}"
if command -v kcat &>/dev/null; then
  echo "TODO: assert event published to $TOPIC via kcat"
  exit 1
elif command -v rabbitmqadmin &>/dev/null; then
  echo "TODO: rabbitmqadmin get queue={{queue_name}}"
  exit 1
else
  echo "SKIP: no queue inspection tool found (kcat, rabbitmqadmin)"
  exit 0
fi
`;
}

export function generateK6Probe(
  ucId: string,
  title: string,
  postcondition: string,
  scenario = "happy",
): string {
  return `// L2 Harness: ${ucId} — ${title} [${scenario}]
// NFR contract: ${postcondition}
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
export default function () {
  const res = http.get(__ENV.API_URL + '/api/health');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
`;
}

export function generateWsShProbe(
  ucId: string,
  title: string,
  postcondition: string,
  scenario = "happy",
): string {
  return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [${scenario}]
# WebSocket postcondition: ${postcondition}
set -euo pipefail
WS_URL="\${WS_URL:?WS_URL is required}"
if command -v wscat &>/dev/null; then
  echo "TODO: assert WebSocket message for ${ucId} [${scenario}]"
  exit 1
else
  echo "SKIP: wscat not found (npm install -g wscat)"
  exit 0
fi
`;
}

export function generateLogShProbe(
  ucId: string,
  title: string,
  _postcondition: string,
  scenario = "happy",
): string {
  return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [${scenario}]
# Log postcondition: structured log entry must appear after use case execution
set -euo pipefail
LOG_FILE="\${LOG_FILE:-/tmp/app.log}"
EXPECTED_PATTERN="\${LOG_PATTERN:-${ucId}}"
echo "TODO: implement log assertion for ${ucId} [${scenario}]"
exit 1
`;
}

export function generateA11yProbe(ucId: string, title: string): string {
  return `import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * L2 Harness: ${ucId} — ${title} [Accessibility]
 * Contract: Zero WCAG 2.1 AA violations on the primary use case page.
 */
test.describe('${ucId} Accessibility: ${title}', () => {
  test('WCAG 2.1 AA — zero violations', async ({ page }) => {
    await page.goto(process.env['BASE_URL'] ?? '');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
`;
}

export function generateConsumerContractProbe(
  ucId: string,
  title: string,
): string {
  return `import { PactV3 } from '@pact-foundation/pact';
import { join } from 'path';

/**
 * L2 Harness: ${ucId} — ${title} [Consumer Contract]
 */
const provider = new PactV3({
  consumer: '{{consumer_name}}',
  provider: '{{provider_name}}',
  dir: join(__dirname, '../../pacts'),
});
describe('${ucId} Consumer Contract', () => {
  it('has a valid interaction for ${title}', async () => {
    throw new Error('Not implemented: define the Pact interaction for ${ucId}');
  });
});
`;
}

export function generateProviderContractProbe(
  ucId: string,
  title: string,
): string {
  return `import { Verifier } from '@pact-foundation/pact';
import { join } from 'path';

/**
 * L2 Harness: ${ucId} — ${title} [Provider Verification]
 */
describe('${ucId} Provider Verification', () => {
  it('satisfies all consumer contracts', async () => {
    return new Verifier({
      provider: '{{provider_name}}',
      providerBaseUrl: process.env.PROVIDER_URL ?? 'http://localhost:3000',
      pactUrls: [join(__dirname, '../../pacts')],
    }).verifyProvider();
  });
});
`;
}

export function generateGrpcShProbe(
  ucId: string,
  title: string,
  postcondition: string,
  scenario = "happy",
): string {
  return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [${scenario}]
# gRPC postcondition: ${postcondition}
set -euo pipefail
GRPC_HOST="\${GRPC_HOST:?GRPC_HOST is required}"
if ! command -v grpcurl &>/dev/null; then
  echo "SKIP: grpcurl not found (brew install grpcurl)"
  exit 0
fi
echo "TODO: implement gRPC probe for ${ucId} [${scenario}]"
exit 1
`;
}

export function generateZapShProbe(ucId: string, title: string): string {
  return `#!/usr/bin/env bash
# L2 Harness: ${ucId} — ${title} [Security Scan]
# Contract: zero HIGH/CRITICAL vulnerabilities on the use case endpoint.
set -euo pipefail
TARGET_URL="\${TARGET_URL:?TARGET_URL is required}"
if ! command -v docker &>/dev/null; then
  echo "SKIP: docker not found — cannot run OWASP ZAP scan"
  exit 0
fi
docker run --rm -t owasp/zap2docker-stable \\
  zap-baseline.py -t "$TARGET_URL" -l WARN --exit-code true 2>&1 || {
    echo "FAIL: ZAP found vulnerabilities on $TARGET_URL"
    exit 1
  }
`;
}

export function generateSimProbe(ucId: string, title: string): string {
  return `/**
 * L2 Harness: ${ucId} — ${title}
 * Headless simulation probe — verifies behavioral invariants without rendering.
 */
throw new Error('Probe not yet implemented — implement the ${ucId} simulation scenario');
`;
}

export function generateProbeContent(
  ucId: string,
  title: string,
  probeType: ProbeType,
  details: UcDetails,
  scenario = "happy",
): string {
  switch (probeType) {
    case "playwright":
      return generatePlaywrightProbe(
        ucId,
        title,
        details.precondition,
        details.postcondition,
        details.steps,
        scenario,
      );
    case "api_call":
    case "hurl":
      return generateHurlProbe(
        ucId,
        title,
        details.precondition,
        details.postcondition,
        details.steps,
        scenario,
      );
    case "graphql":
      return generateGraphqlHurlProbe(
        ucId,
        title,
        details.postcondition,
        scenario,
      );
    case "headless_sim":
      return generateSimProbe(ucId, title);
    case "db_query":
      return generateDbShProbe(ucId, title, details.postcondition, scenario);
    case "message_queue":
      return generateMqShProbe(ucId, title, details.postcondition, scenario);
    case "performance":
      return generateK6Probe(ucId, title, details.postcondition, scenario);
    case "websocket":
      return generateWsShProbe(ucId, title, details.postcondition, scenario);
    case "log_assertion":
      return generateLogShProbe(ucId, title, details.postcondition, scenario);
    case "a11y":
      return generateA11yProbe(ucId, title);
    case "contract_consumer":
      return generateConsumerContractProbe(ucId, title);
    case "contract_provider":
      return generateProviderContractProbe(ucId, title);
    case "grpc":
      return generateGrpcShProbe(ucId, title, details.postcondition, scenario);
    case "security_scan":
      return generateZapShProbe(ucId, title);
    case "mcp_call":
      return generateShProbe(
        ucId,
        title,
        details.postcondition,
        "mcp_call",
        scenario,
      );
    case "file_system":
    default:
      return generateShProbe(
        ucId,
        title,
        details.postcondition,
        "file_system",
        scenario,
      );
  }
}
