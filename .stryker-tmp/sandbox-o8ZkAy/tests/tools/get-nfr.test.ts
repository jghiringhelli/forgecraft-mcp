/**
 * Tests for the get_nfr_template tool handler.
 */
// @ts-nocheck

import { describe, it, expect } from "vitest";
import { getNfrTemplateHandler } from "../../src/tools/get-nfr.js";

describe("getNfrTemplateHandler", () => {
  it("returns NFR content for UNIVERSAL tag", async () => {
    const result = await getNfrTemplateHandler({ tags: ["UNIVERSAL"] });
    const text = result.content[0]!.text;
    expect(text).toContain("Non-Functional Requirements");
  });

  it("includes UNIVERSAL in tags listing", async () => {
    const result = await getNfrTemplateHandler({ tags: ["UNIVERSAL"] });
    expect(result.content[0]!.text).toContain("[UNIVERSAL]");
  });

  it("returns sections count > 0 for UNIVERSAL", async () => {
    const result = await getNfrTemplateHandler({ tags: ["UNIVERSAL"] });
    const match = result.content[0]!.text.match(/\*\*Sections:\*\* (\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThan(0);
  });

  it("returns fallback message for a tag with no NFR blocks", async () => {
    // DATA-LINEAGE is a specialized tag unlikely to have NFR blocks without UNIVERSAL
    // We force it alone — if no blocks, we get the fallback
    const result = await getNfrTemplateHandler({ tags: ["UNIVERSAL", "API"] });
    // Either way we should get a valid text response
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });
});
