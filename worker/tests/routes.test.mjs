import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAuthenticatedApi } from "../.test-build/routes.js";

void describe("CenPaya financial API routes", () => {
  void it("derives the wallet owner from the authenticated identity", async () => {
    let filteredUser = null;
    const query = {
      select: () => query,
      eq: (key, value) => { assert.equal(key, "user_id"); filteredUser = value; return query; },
      maybeSingle: () => query,
      abortSignal: async () => ({ data: { available_funds: 1250, referral_earnings_available: 0 }, error: null }),
    };
    const supabase = { from: (table) => { assert.equal(table, "wallets"); return query; } };
    const response = await handleAuthenticatedApi(
      new Request("https://worker.test/api/v1/wallet"),
      "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11",
      supabase,
      new Headers(),
    );
    assert.equal(filteredUser, "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.available_funds, 1250);
  });

  void it("allows only explicitly approved financial/admin RPC names", async () => {
    let invoked = null;
    const supabase = {
      rpc: async (name, args) => { invoked = { name, args }; return { data: { ok: true }, error: null }; },
    };
    const request = new Request("https://worker.test/api/v1/admin/rpc/admin_set_app_setting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: { p_key: "fee_pct_member", p_value: "2" } }),
    });
    const response = await handleAuthenticatedApi(request, "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11", supabase, new Headers());
    assert.equal(response.status, 200);
    assert.equal(invoked.name, "admin_set_app_setting");
    assert.equal(invoked.args.p_key, "fee_pct_member");
  });

  void it("does not expose Supabase auth/password RPCs through the generic admin route", async () => {
    let invoked = false;
    const supabase = { rpc: async () => { invoked = true; return { data: { ok: true }, error: null }; } };
    const request = new Request("https://worker.test/api/v1/admin/rpc/admin_verify_password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: { p_password: "not-logged" } }),
    });
    const response = await handleAuthenticatedApi(request, "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11", supabase, new Headers());
    assert.equal(response.status, 404);
    assert.equal(invoked, false);
  });
});
