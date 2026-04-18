/**
 * Tests for src/tools/probe-templates.ts template generators.
 */

import { describe, it, expect } from "vitest";
import {
  generateWsShProbe,
  generateA11yProbe,
  generateConsumerContractProbe,
  generateProviderContractProbe,
  generateGrpcShProbe,
  generateZapShProbe,
  generateSimProbe,
  generateK6Probe,
  generateMqShProbe,
  generateLogShProbe,
  generateProbeContent,
} from "../../src/tools/probe-templates.js";

describe("probe template generators", () => {
  it("generateWsShProbe includes ucId and WS_URL env var reference", () => {
    const out = generateWsShProbe("UC-007", "WebSocket", "msg received");
    expect(out).toContain("UC-007");
    expect(out).toContain("WS_URL");
    expect(out).toContain("wscat");
  });

  it("generateA11yProbe includes ucId and axe check", () => {
    const out = generateA11yProbe("UC-003", "Accessibility");
    expect(out).toContain("UC-003");
    expect(out).toContain("AxeBuilder");
    expect(out).toContain("BASE_URL");
  });

  it("generateConsumerContractProbe includes ucId", () => {
    const out = generateConsumerContractProbe("UC-005", "Contract");
    expect(out).toContain("UC-005");
    expect(out).toContain("PactV3");
    expect(out).toContain("Not implemented");
  });

  it("generateProviderContractProbe includes ucId and PROVIDER_URL", () => {
    const out = generateProviderContractProbe("UC-006", "Provider");
    expect(out).toContain("UC-006");
    expect(out).toContain("PROVIDER_URL");
    expect(out).toContain("verifyProvider");
  });

  it("generateGrpcShProbe includes ucId and GRPC_HOST env var", () => {
    const out = generateGrpcShProbe("UC-008", "gRPC", "response received");
    expect(out).toContain("UC-008");
    expect(out).toContain("GRPC_HOST");
    expect(out).toContain("grpcurl");
  });

  it("generateZapShProbe includes ucId and TARGET_URL env var", () => {
    const out = generateZapShProbe("UC-009", "Security");
    expect(out).toContain("UC-009");
    expect(out).toContain("TARGET_URL");
    expect(out).toContain("zap");
  });

  it("generateSimProbe includes ucId", () => {
    const out = generateSimProbe("UC-010", "Simulation");
    expect(out).toContain("UC-010");
    expect(out).toContain("Probe not yet implemented");
  });

  it("generateK6Probe uses __ENV.API_URL (no hardcoded host)", () => {
    const out = generateK6Probe("UC-011", "Load", "p95<500ms");
    expect(out).toContain("__ENV.API_URL");
    expect(out).not.toContain("localhost");
    expect(out).toContain("k6/http");
  });

  it("generateMqShProbe uses KAFKA_BROKER env var (no hardcoded host)", () => {
    const out = generateMqShProbe("UC-012", "Queue", "event published");
    expect(out).toContain("KAFKA_BROKER");
    expect(out).not.toContain("localhost");
  });

  it("generateLogShProbe includes ucId and LOG_FILE env var", () => {
    const out = generateLogShProbe("UC-013", "Logs", "log appears");
    expect(out).toContain("UC-013");
    expect(out).toContain("LOG_FILE");
  });

  describe("generateProbeContent dispatch", () => {
    const details = { precondition: "pre", postcondition: "post", steps: [] };

    it("dispatches websocket → generateWsShProbe", () => {
      const out = generateProbeContent("UC-001", "T", "websocket", details);
      expect(out).toContain("WS_URL");
    });

    it("dispatches a11y → generateA11yProbe", () => {
      const out = generateProbeContent("UC-001", "T", "a11y", details);
      expect(out).toContain("AxeBuilder");
    });

    it("dispatches contract_consumer → generateConsumerContractProbe", () => {
      const out = generateProbeContent(
        "UC-001",
        "T",
        "contract_consumer",
        details,
      );
      expect(out).toContain("PactV3");
    });

    it("dispatches contract_provider → generateProviderContractProbe", () => {
      const out = generateProbeContent(
        "UC-001",
        "T",
        "contract_provider",
        details,
      );
      expect(out).toContain("verifyProvider");
    });

    it("dispatches grpc → generateGrpcShProbe", () => {
      const out = generateProbeContent("UC-001", "T", "grpc", details);
      expect(out).toContain("GRPC_HOST");
    });

    it("dispatches security_scan → generateZapShProbe", () => {
      const out = generateProbeContent("UC-001", "T", "security_scan", details);
      expect(out).toContain("TARGET_URL");
    });

    it("dispatches headless_sim → generateSimProbe", () => {
      const out = generateProbeContent("UC-001", "T", "headless_sim", details);
      expect(out).toContain("Probe not yet implemented");
    });
  });
});
