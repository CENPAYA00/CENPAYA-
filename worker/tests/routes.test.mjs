import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAuthenticatedApi } from "../.test-build/routes.js";

void describe("CenPaya financial API routes", () => {
  void it("derives wallet and escrow ownership from the authenticated identity", async () => {
    const userId = "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11";
    const filteredUsers = [];
    const rows = {
      user_balances: [],
      wallets: { available_funds: 1250, referral_earnings_available: 0 },
      buyer_escrow_summary: null,
    };
    const supabase = {
      from: (table) => {
        assert.ok(Object.prototype.hasOwnProperty.call(rows, table), "unexpected table " + table);
        const result = { data: rows[table], error: null };
        const query = {
          select: () => query,
          eq: (key, value) => { assert.equal(key, "user_id"); filteredUsers.push(value); return query; },
          order: () => query,
          abortSignal: () => query,
          maybeSingle: async () => result,
          then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
        };
        return query;
      },
    };
    const response = await handleAuthenticatedApi(
      new Request("https://worker.test/api/v1/wallet"),
      userId,
      supabase,
      new Headers(),
      {},
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.available_funds, 1250);
    assert.equal(filteredUsers.length, 3);
    assert.ok(filteredUsers.every((value) => value === userId));
  });

  void it("rejects marketplace checkout quotes for negotiable price ranges", async () => {
    const supabase = {
      rpc: async () => { throw new Error("fee calculation must not run for an unagreed range"); },
    };
    const env = {
      D1_INTERNAL_CALL_SECRET: "test-secret",
      D1_IDENTITY: {
        fetch: async () => new Response(JSON.stringify({
          success: true,
          data: {
            price_is_range: true,
            price_min: 20000,
            price_max: 50000,
            price: 20000,
            currency_code: "XAF",
            seller_id: "9d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c12",
          },
        }), { status: 200, headers: { "content-type": "application/json" } }),
      },
    };
    const response = await handleAuthenticatedApi(
      new Request("https://worker.test/api/v1/checkout/quote?listing_id=listing-1"),
      "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11",
      supabase,
      new Headers(),
      env,
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "negotiable_price_requires_seller_agreement");
  });

  void it("rejects freelance checkout quotes for negotiable price ranges", async () => {
    const supabase = {
      rpc: async () => { throw new Error("fee calculation must not run for an unagreed range"); },
    };
    const env = {
      D1_INTERNAL_CALL_SECRET: "test-secret",
      D1_IDENTITY: {
        fetch: async () => new Response(JSON.stringify({
          success: true,
          data: {
            price_is_range: 1,
            price: 20000,
            price_min: 20000,
            price_max: 50000,
            currency_code: "XAF",
            listing_type: "service",
            seller_id: "9d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c12",
          },
        }), { status: 200, headers: { "content-type": "application/json" } }),
      },
    };
    const response = await handleAuthenticatedApi(
      new Request("https://worker.test/api/v1/checkout/service-quote?service_id=9d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c12"),
      "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11",
      supabase,
      new Headers(),
      env,
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "negotiable_price_requires_seller_agreement");
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

  void it("accepts a Vice Admin appointment without requiring a D1 workspace sync", async () => {
    let invoked = null;
    const supabase = {
      rpc: async (name, args) => {
        invoked = { name, args };
        return { data: { ok: true, role: "vice_admin", title: "Operations Supervisor", department: "Operations", permissions: [] }, error: null };
      },
    };
    const request = new Request("https://worker.test/api/v1/staff/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(32) }),
    });
    const response = await handleAuthenticatedApi(request, "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11", supabase, new Headers(), {});
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(invoked.name, "accept_staff_invitation");
    assert.equal(payload.data.role, "vice_admin");
    assert.equal(payload.data.title, "Operations Supervisor");
  });

  void it("allows an authenticated user to accept an invitation through the typed RPC gateway", async () => {
    let invoked = null;
    const supabase = {
      rpc: async (name, args) => { invoked = { name, args }; return { data: { ok: true, role: "vice_admin" }, error: null }; },
    };
    const request = new Request("https://worker.test/api/v1/admin/rpc/accept_staff_invitation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: { p_token: "a".repeat(32) } }),
    });
    const response = await handleAuthenticatedApi(request, "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11", supabase, new Headers(), {});
    assert.equal(response.status, 200);
    assert.equal(invoked.name, "accept_staff_invitation");
    assert.equal(invoked.args.p_token, "a".repeat(32));
  });

  void it("allows the extended Vice Admin invitation RPC contract", async () => {
    let invoked = null;
    const supabase = {
      rpc: async (name, args) => { invoked = { name, args }; return { data: { ok: true }, error: null }; },
    };
    const request = new Request("https://worker.test/api/v1/admin/rpc/admin_invite_staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: {
        p_email: "vice@example.com", p_role: "vice_admin", p_permissions: [],
        p_title: "Operations Supervisor", p_department: "Operations", p_supervisor_id: null,
      } }),
    });
    const response = await handleAuthenticatedApi(request, "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11", supabase, new Headers(), {});
    assert.equal(response.status, 200);
    assert.equal(invoked.name, "admin_invite_staff");
    assert.equal(invoked.args.p_role, "vice_admin");
  });

  void it("rejects malformed team task evidence before reaching Supabase", async () => {
    let invoked = false;
    const supabase = { rpc: async () => { invoked = true; return { data: { ok: true }, error: null }; } };
    const request = new Request("https://worker.test/api/v1/admin/rpc/team_update_task", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: {
        p_task_id: "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11",
        p_status: "submitted", p_body: "Report submitted", p_attachment_url: "javascript:alert(1)",
      } }),
    });
    const response = await handleAuthenticatedApi(request, "8d4c4d42-5b92-4bd3-9f9d-8f3e8f9e5c11", supabase, new Headers(), {});
    assert.equal(response.status, 400);
    assert.equal(invoked, false);
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
