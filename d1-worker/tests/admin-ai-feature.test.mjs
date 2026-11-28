import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAdminRoutes } from "../.test-build/admin.js";

const owner = { id: "owner-1", role: "owner", account_status: "active", banned: 0 };
const superAdmin = { ...owner, id: "super-1", role: "super_admin" };
const member = { ...owner, id: "member-1", role: "user" };

function makeEnv(aiAvailable = true) {
  const writes = [];
  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() { writes.push({ sql, values }); return { meta: { changes: 1 } }; },
        async all() { return { results: [{ key: "ai_assistant", enabled: 0 }] }; },
        async first() { return null; },
      };
    },
  };
  return { DB, writes, AI: aiAvailable ? { async run() { return { response: "ok" }; } } : undefined };
}

function patchRequest(enabled) {
  return new Request("https://worker.test/api/admin/features/ai_assistant", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_enabled_globally: enabled }),
  });
}

void describe("central AI assistant feature control", () => {
  void it("allows only Owner and Super Admin to read feature controls", async () => {
    const env = makeEnv();
    const denied = await handleAdminRoutes(new Request("https://worker.test/api/admin/features"), env, {
      path: "/api/admin/features", method: "GET", user: member,
    });
    assert.equal(denied?.status, 403);

    const ownerResponse = await handleAdminRoutes(new Request("https://worker.test/api/admin/features"), env, {
      path: "/api/admin/features", method: "GET", user: owner,
    });
    assert.equal(ownerResponse?.status, 200);
    const data = (await ownerResponse.json()).data;
    assert.equal(data.find((row) => row.feature_key === "ai_assistant").ready, true);
  });

  void it("denies feature changes from ordinary members", async () => {
    const env = makeEnv();
    const response = await handleAdminRoutes(patchRequest(true), env, {
      path: "/api/admin/features/ai_assistant", method: "PATCH", user: member,
    });
    assert.equal(response?.status, 403);
    assert.equal(env.writes.length, 0);
  });

  void it("lets Owner and Super Admin update the central flag using an upsert", async () => {
    for (const admin of [owner, superAdmin]) {
      const env = makeEnv();
      const response = await handleAdminRoutes(patchRequest(true), env, {
        path: "/api/admin/features/ai_assistant", method: "PATCH", user: admin,
      });
      assert.equal(response?.status, 200);
      assert.match(env.writes[0].sql, /INSERT INTO feature_flags.*ON CONFLICT\(key\) DO UPDATE/i);
      assert.deepEqual(env.writes[0].values, ["ai_assistant", 1]);
    }
  });

  void it("prevents enabling until the Workers AI binding is ready, but allows disabling", async () => {
    const env = makeEnv(false);
    const enable = await handleAdminRoutes(patchRequest(true), env, {
      path: "/api/admin/features/ai_assistant", method: "PATCH", user: owner,
    });
    assert.equal(enable?.status, 409);
    assert.equal(env.writes.length, 0);

    const disable = await handleAdminRoutes(patchRequest(false), env, {
      path: "/api/admin/features/ai_assistant", method: "PATCH", user: owner,
    });
    assert.equal(disable?.status, 200);
    assert.deepEqual(env.writes[0].values, ["ai_assistant", 0]);
  });
});
