import { SupabaseClient } from "@supabase/supabase-js";
import { jsonResponse, readJsonObject } from "./http-utils";
import { readUserProfile } from "./profile";

const ADMIN_RPCS = new Set([
  "admin_add_country", "admin_add_payment_method", "admin_assign_role",
  "admin_available_gains", "admin_ban_user", "admin_escrow_action",
  "admin_gains_breakdown", "admin_grant_membership", "admin_grant_permission",
  "admin_list_invitations", "admin_list_ledger", "admin_list_open_escrows",
  "admin_list_providers", "admin_list_reports", "admin_list_tickets",
  "admin_list_users", "admin_moderate_user", "admin_money_circulation",
  "admin_money_circulation_full", "admin_remove_gateway_credentials",
  "admin_remove_support_agent", "admin_resolve_dispute", "admin_resolve_report",
  "admin_review_kyc", "admin_revoke_invitation", "admin_revoke_membership",
  "admin_set_app_setting", "admin_set_call_host", "admin_set_gateway_credentials",
  "admin_set_provider_active", "admin_set_video_host", "admin_set_video_posts",
  "admin_toggle_calls", "admin_toggle_payment_method", "admin_toggle_video",
  "admin_topup_my_wallet", "admin_unban_user", "admin_update_region",
  "admin_withdraw_from_my_wallet", "admin_withdraw_gains_to_wallet",
  "admin_withdraw_platform_gains",
]);

const MAX_PAGE_SIZE = 200;

function pageSize(url: URL, fallback = 50): number {
  const raw = url.searchParams.get("limit");
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(parsed)));
}

function pageOffset(url: URL): number {
  const raw = url.searchParams.get("offset");
  if (raw === null || raw.trim() === "") return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100_000, Math.floor(parsed)));
}

function errorStatus(message: string): number {
  const value = message.toLowerCase();
  return /not authenticated|unauthorized|not authorized|staff only|only staff|permission|forbidden/.test(value)
    ? 403
    : 400;
}

async function rpc(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null; status: number }> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const message = error.message || "database_operation_failed";
    return { data: null, error: "database_operation_failed", status: errorStatus(message) };
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const value = data as Record<string, unknown>;
    if (value.ok === false) {
      const message = typeof value.error === "string" ? value.error : "operation_not_allowed";
      return { data: null, error: message, status: errorStatus(message) };
    }
  }
  return { data, error: null, status: 200 };
}

function success(data: unknown, headers: Headers): Response {
  return jsonResponse({ success: true, data }, 200, headers);
}

function failure(error: string, status: number, headers: Headers): Response {
  return jsonResponse({ success: false, error }, status, headers);
}

function normalizedAdminPath(pathname: string): string {
  return pathname.startsWith("/api/admin/")
    ? "/api/v1/admin/" + pathname.slice("/api/admin/".length)
    : pathname;
}

export async function handleAuthenticatedApi(
  request: Request,
  userId: string,
  supabase: SupabaseClient,
  headers: Headers,
): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizedAdminPath(url.pathname);
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/api/v1/me/profile") {
    const profile = await readUserProfile(supabase, userId);
    return profile ? success(profile, headers) : failure("profile_not_found", 404, headers);
  }

  if (method === "GET" && path === "/api/v1/wallet") {
    const { data, error } = await supabase.from("wallets")
      .select("available_funds,referral_earnings_available")
      .eq("user_id", userId)
      .abortSignal(AbortSignal.timeout(5_000))
      .maybeSingle();
    if (error) return failure("wallet_lookup_failed", 502, headers);
    return success(data, headers);
  }

  if (method === "GET" && path === "/api/v1/ledger") {
    const limit = pageSize(url, 50);
    const flow = url.searchParams.get("flow");
    let query = supabase.from("transactional_ledger")
      .select("id,flow_direction,operator_reference,gross_amount,system_fee_cut,net_amount,currency_code,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (flow === "CASH_IN" || flow === "CASH_OUT") query = query.eq("flow_direction", flow);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("ledger_lookup_failed", 502, headers);
    return success(data || [], headers);
  }

  if (method === "GET" && path === "/api/v1/orders") {
    const { data, error } = await supabase.from("orders")
      .select("id,listing_id,buyer_id,seller_id,amount,currency_code,escrow_status,escrow_created_at,order_status,order_type,updated_at")
      .or("buyer_id.eq." + userId + ",seller_id.eq." + userId)
      .order("updated_at", { ascending: false })
      .limit(pageSize(url, 50))
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("orders_lookup_failed", 502, headers);
    return success(data || [], headers);
  }

  if (method === "POST" && path === "/api/v1/orders/services") {
    const body = await readJsonObject(request);
    if (!body) return failure("invalid_json_body", 400, headers);
    const serviceId = typeof body.service_id === "string" ? body.service_id : "";
    const packageId = typeof body.package_id === "string" ? body.package_id : "";
    const requirements = typeof body.requirements === "string" ? body.requirements.slice(0, 5000) : null;
    if (!serviceId || !packageId) return failure("service_and_package_required", 400, headers);
    const result = await rpc(supabase, "create_service_order", {
      p_service_id: serviceId,
      p_package_id: packageId,
      p_requirements: requirements,
      p_pay_from_wallet: true,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  if (method === "GET" && path === "/api/v1/admin/ledger") {
    const flow = url.searchParams.get("flow");
    const result = await rpc(supabase, "admin_list_ledger", {
      p_limit: pageSize(url, 50),
      p_offset: pageOffset(url),
      p_flow: flow === "CASH_IN" || flow === "CASH_OUT" ? flow : null,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  if (method === "GET" && path === "/api/v1/admin/escrows") {
    const result = await rpc(supabase, "admin_list_open_escrows", { p_limit: pageSize(url, 100) });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  if (method === "GET" && path === "/api/v1/admin/finance") {
    const names = ["admin_available_gains", "admin_gains_breakdown", "admin_money_circulation_full"] as const;
    const results = await Promise.all(names.map((name) => rpc(supabase, name, {})));
    const failed = results.find((item) => item.error);
    if (failed) return failure(failed.error || "finance_summary_failed", failed.status, headers);
    return success({
      available_gains: results[0].data,
      gains_breakdown: results[1].data,
      money_circulation: results[2].data,
    }, headers);
  }

  if (method === "GET" && path === "/api/v1/admin/gains") {
    const { data, error } = await supabase.from("system_gains")
      .select("id,source_type,amount_earned,currency_code,processed_at")
      .order("processed_at", { ascending: false })
      .limit(pageSize(url, 100))
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("gains_lookup_failed", 502, headers);
    return success(data || [], headers);
  }

  if (method === "GET" && path === "/api/v1/admin/payment-methods") {
    const { data, error } = await supabase.from("payment_methods")
      .select("id,method_name,display_label,is_active,admin_only,icon")
      .order("display_label", { ascending: true })
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("payment_methods_lookup_failed", 502, headers);
    return success(data || [], headers);
  }

  if (method === "GET" && path === "/api/v1/admin/regions") {
    const { data, error } = await supabase.from("regional_market_configurations")
      .select("country_iso,currency_code,base_marketplace_fee_pct,premium_subscriber_fee_pct,withdrawal_fee_pct,is_operational,fee_fixed_premium,fee_fixed_base")
      .order("country_iso", { ascending: true })
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("regions_lookup_failed", 502, headers);
    return success(data || [], headers);
  }

  if (method === "GET" && path === "/api/v1/admin/providers") {
    const result = await rpc(supabase, "admin_list_providers", {});
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  if (method === "GET" && path === "/api/v1/admin/users") {
    const result = await rpc(supabase, "admin_list_users", {
      p_search: url.searchParams.get("search") || null,
      p_role_filter: url.searchParams.get("role") || null,
      p_banned_only: url.searchParams.get("banned_only") === "true",
      p_limit: pageSize(url, 50),
      p_offset: pageOffset(url),
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  if (method === "GET" && path === "/api/v1/admin/reports") {
    const status = url.searchParams.get("status") || "open";
    const result = await rpc(supabase, "admin_list_reports", {
      p_status: status === "all" ? null : status,
      p_limit: pageSize(url, 100),
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  if (method === "GET" && path === "/api/v1/admin/tickets") {
    const result = await rpc(supabase, "admin_list_tickets", {
      p_status: url.searchParams.get("status") || null,
      p_limit: pageSize(url, 100),
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  const escrowAction = path.match(/^\/api\/v1\/admin\/escrows\/([0-9a-f-]{36})\/action$/i);
  if (method === "POST" && escrowAction) {
    const body = await readJsonObject(request);
    if (!body) return failure("invalid_json_body", 400, headers);
    const kind = body.kind === "service" ? "service" : body.kind === "order" ? "order" : "";
    const action = ["release", "refund", "cancel", "dispute"].includes(String(body.action)) ? String(body.action) : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
    if (!kind || !action || reason.length < 10) return failure("invalid_escrow_action", 400, headers);
    const result = await rpc(supabase, "admin_escrow_action", {
      p_kind: kind, p_id: escrowAction[1], p_action: action, p_reason: reason,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  const reportUpdate = path.match(/^\/api\/v1\/admin\/reports\/([0-9a-f-]{36})$/i);
  if ((method === "PATCH" || method === "POST") && reportUpdate) {
    const body = await readJsonObject(request);
    if (!body) return failure("invalid_json_body", 400, headers);
    const decision = ["resolved", "dismissed", "under_review"].includes(String(body.decision)) ? String(body.decision) : "";
    const note = typeof body.note === "string" ? body.note.slice(0, 2000) : null;
    if (!decision) return failure("invalid_report_decision", 400, headers);
    const result = await rpc(supabase, "admin_resolve_report", {
      p_report_id: reportUpdate[1], p_decision: decision, p_note: note,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  const adminRpc = path.match(/^\/api\/v1\/admin\/rpc\/([a-z_]+)$/);
  if (method === "POST" && adminRpc) {
    const name = adminRpc[1];
    if (!ADMIN_RPCS.has(name)) return failure("rpc_not_allowed", 404, headers);
    const body = await readJsonObject(request, 64_000);
    if (!body) return failure("invalid_json_body", 400, headers);
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? body.args as Record<string, unknown>
      : {};
    const result = await rpc(supabase, name, args);
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  return failure("not_found", 404, headers);
}
