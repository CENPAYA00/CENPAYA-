import { test } from "node:test";
import assert from "node:assert/strict";
import { handleInternalRoutes } from "../.test-build/internal.js";

test("internal staff sync accepts the all-zero UUID without relaxing other validation", async () => {
  const statements = [];
  const userId = "00000000-0000-0000-0000-000000000000";
  const db = {
    prepare(sql) {
      const statement = {
        bind(...values) { statements.push({ sql, values }); return statement; },
        async first() { return { id: userId }; },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  const env = { DB: db, D1_INTERNAL_CALL_SECRET: "test-internal-secret" };
  const request = new Request("https://d1-worker.internal/internal/v1/staff/workspace/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CenPaya-Internal-Secret": "test-internal-secret",
    },
    body: JSON.stringify({ user_id: userId, role: "user" }),
  });
  const response = await handleInternalRoutes(
    request, env, new URL(request.url), "/internal/v1/staff/workspace/sync", "POST",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(statements.length, 3);
});

test("internal staff sync still rejects malformed UUIDs", async () => {
  const env = { DB: {}, D1_INTERNAL_CALL_SECRET: "test-internal-secret" };
  const request = new Request("https://d1-worker.internal/internal/v1/staff/workspace/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CenPaya-Internal-Secret": "test-internal-secret",
    },
    body: JSON.stringify({ user_id: "not-a-uuid", role: "user" }),
  });
  const response = await handleInternalRoutes(
    request, env, new URL(request.url), "/internal/v1/staff/workspace/sync", "POST",
  );
  assert.equal(response.status, 400);
});
