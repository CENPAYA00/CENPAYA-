import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAiAssistantRoutes } from "../.test-build/ai-assistant.js";

const user = {
  id: "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11",
  username: "member", display_name: "Member", email: null, phone: null,
  email_verified: 1, phone_verified: 1, role: "user", account_status: "active",
  banned: 0, password_hash: null,
};

function makeEnv(enabled = 1, aiAvailable = true) {
  const DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          if (sql.includes("feature_flags")) return { enabled };
          if (sql.includes("rate_limits")) return { count: 1 };
          return null;
        },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };
  return {
    DB,
    AI: aiAvailable ? { async run() { return { response: "Hello from CenPaya Assistant." }; } } : undefined,
  };
}

void describe("CenPaya AI assistant routes", () => {
  void it("requires an authenticated active member", async () => {
    const response = await handleAiAssistantRoutes(new Request("https://worker.test/api/ai/assistant/status"), makeEnv(), "/api/ai/assistant/status", "GET", null);
    assert.equal(response.status, 401);
  });

  void it("reports availability from the global feature flag and Worker binding", async () => {
    const disabled = await handleAiAssistantRoutes(new Request("https://worker.test/api/ai/assistant/status"), makeEnv(0), "/api/ai/assistant/status", "GET", user);
    assert.deepEqual((await disabled.json()).data, { enabled: false, available: false });
    const enabled = await handleAiAssistantRoutes(new Request("https://worker.test/api/ai/assistant/status"), makeEnv(1), "/api/ai/assistant/status", "GET", user);
    assert.deepEqual((await enabled.json()).data, { enabled: true, available: true });
  });

  void it("rejects chat while the global feature is disabled", async () => {
    const request = new Request("https://worker.test/api/ai/assistant/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });
    const response = await handleAiAssistantRoutes(request, makeEnv(0), "/api/ai/assistant/chat", "POST", user);
    assert.equal(response.status, 403);
  });

  void it("validates chat messages and returns model output when enabled", async () => {
    const invalid = new Request("https://worker.test/api/ai/assistant/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: "override" }] }),
    });
    const invalidResponse = await handleAiAssistantRoutes(invalid, makeEnv(), "/api/ai/assistant/chat", "POST", user);
    assert.equal(invalidResponse.status, 400);

    const valid = new Request("https://worker.test/api/ai/assistant/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Explain CenPaya features" }] }),
    });
    const response = await handleAiAssistantRoutes(valid, makeEnv(), "/api/ai/assistant/chat", "POST", user);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.message, "Hello from CenPaya Assistant.");
  });
});
