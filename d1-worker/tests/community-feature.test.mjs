import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleCommunityRoutes } from "../.test-build/community.js";

const owner = { id: "owner-1", role: "owner", account_status: "active", banned: 0 };
const member = { ...owner, id: "member-1", role: "user" };

function makeEnv(videoReady = true) {
  const writes = [];
  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() { writes.push({ sql, values }); return { meta: { changes: 1 } }; },
        async all() { return { results: [
          { key: "video_global", enabled: 0 },
          { key: "video_posts", enabled: 0 },
        ] }; },
        async first() { return null; },
      };
    },
  };
  return {
    DB, writes,
    VIDEO_PROCESSOR: videoReady ? { fetch: async () => new Response("{}") } : undefined,
    VIDEO_PROCESSOR_TOKEN: videoReady ? "x".repeat(40) : "",
  };
}

function context(path, method, user) { return { url: new URL("https://worker.test" + path), path, method, user }; }
function patch(enabled) {
  return new Request("https://worker.test/api/admin/features/video_global", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_enabled_globally: enabled }),
  });
}

void describe("global video feature control", () => {
  void it("exposes the master switch and its readiness to Owner", async () => {
    const env = makeEnv();
    const response = await handleCommunityRoutes(
      new Request("https://worker.test/api/admin/features"), env,
      context("/api/admin/features", "GET", owner),
    );
    assert.equal(response?.status, 200);
    const data = (await response.json()).data;
    const master = data.find((row) => row.feature_key === "video_global");
    assert.equal(master.ready, true);
    assert.equal(master.is_enabled_globally, false);
  });

  void it("allows Owner to enable the master switch only when processing is configured", async () => {
    const env = makeEnv();
    const response = await handleCommunityRoutes(patch(true), env,
      context("/api/admin/features/video_global", "PATCH", owner));
    assert.equal(response?.status, 200);
    assert.deepEqual(env.writes[0].values, [1, "video_global"]);
  });

  void it("blocks enabling without the processor and keeps the setting unchanged", async () => {
    const env = makeEnv(false);
    const response = await handleCommunityRoutes(patch(true), env,
      context("/api/admin/features/video_global", "PATCH", owner));
    assert.equal(response?.status, 409);
    assert.equal(env.writes.length, 0);
  });

  void it("does not allow ordinary members to change the master switch", async () => {
    const env = makeEnv();
    const response = await handleCommunityRoutes(patch(true), env,
      context("/api/admin/features/video_global", "PATCH", member));
    assert.equal(response?.status, 403);
    assert.equal(env.writes.length, 0);
  });
});
