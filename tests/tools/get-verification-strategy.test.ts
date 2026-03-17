/**
 * Tests for the get_verification_strategy tool handler.
 */
import { describe, it, expect } from "vitest";
import { getVerificationStrategyHandler } from "../../src/tools/get-verification-strategy.js";

describe("getVerificationStrategyHandler", () => {
  it("returns verification strategies heading for UNIVERSAL", async () => {
    const result = await getVerificationStrategyHandler({
      tags: ["UNIVERSAL"],
    });
    const text = result.content[0]!.text;
    expect(text).toContain("Verification Strateg");
  });

  it("includes the requested tag in output", async () => {
    const result = await getVerificationStrategyHandler({
      tags: ["UNIVERSAL"],
    });
    expect(result.content[0]!.text).toContain("[UNIVERSAL]");
  });

  it("filters by phase when phase param provided", async () => {
    const result = await getVerificationStrategyHandler({
      tags: ["UNIVERSAL"],
      phase: "contract-definition",
    });
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });

  it("returns content for API tag", async () => {
    const result = await getVerificationStrategyHandler({
      tags: ["UNIVERSAL", "API"],
    });
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });
});
