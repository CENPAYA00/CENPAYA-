import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeListingText } from "../.test-build/ai-indicator.js";

void describe("Gemini AI Indicator", () => {
  void it("returns unavailable without blocking when the API key is absent", async () => {
    const result = await analyzeListingText({}, "Phone", "A used phone", "product");
    assert.equal(result.status, "unavailable");
    assert.equal(result.classification, "inconclusive");
    assert.equal(result.confidence, null);
  });

  void it("sends only listing text to Gemini and parses the structured result", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedInit = {};
    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init || {};
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          classification: "possible_ai_assisted", confidence: 0.78, reason: "Some repeated generic phrasing."
        }) }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const result = await analyzeListingText({ GEMINI_API_KEY: "test-key" }, "Phone for sale", "Good condition and works well.", "product");
      assert.equal(result.status, "completed");
      assert.equal(result.classification, "possible_ai_assisted");
      assert.equal(result.confidence, 0.78);
      assert.equal(result.model, "gemini-2.5-flash");
      assert.match(capturedUrl, /gemini-2\.5-flash:generateContent/);
      assert.equal(capturedInit.headers["x-goog-api-key"], "test-key");
      assert.match(capturedInit.body, /Phone for sale/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  void it("fails open for listing publication when Gemini is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
    try {
      const result = await analyzeListingText({ GEMINI_API_KEY: "test-key" }, "Service", "Description", "service");
      assert.equal(result.status, "unavailable");
      assert.equal(result.classification, "inconclusive");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
