import { SupabaseClient } from "@supabase/supabase-js";
import { jsonResponse, readJsonObject } from "./http-utils.js";
import { readUserProfile } from "./profile.js";
import { Env } from "./env.js";

type AdminRpcSchema = {
  required: string[];
  optional: string[];
  genericAllowed: boolean;
  validate: (args: Record<string, unknown>) => boolean;
};
const noArgs = (args: Record<string, unknown>) => Object.keys(args).length === 0;
const integerIn = (value: unknown, min: number, max: number) =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const isText = (v: unknown, max = 500, min = 1) =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
const isUuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const isBool = (v: unknown) => typeof v === "boolean";
const isNumericAmount = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1_000_000_000_000;
const isPercent = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
const isStringArray = (v: unknown) =>
  Array.isArray(v) && v.length <= 20 && v.every((item) => isText(item, 2048));
const defineRpc = (
  required: string[], optional: string[], validate: (args: Record<string, unknown>) => boolean,
  genericAllowed = true,
): AdminRpcSchema => ({ required, optional, validate, genericAllowed });

// Each RPC has an exact argument contract. High-impact actions are intentionally
// excluded from the generic gateway and must use their dedicated typed routes.
const ADMIN_RPC_SCHEMAS: Record<string, AdminRpcSchema> = {
  admin_add_country: defineRpc(
    ["p_country_iso","p_currency_code","p_base_fee_pct","p_premium_fee_pct","p_withdrawal_fee_pct"], [],
    (a) => isText(a.p_country_iso,2) && /^[A-Z]{2}$/.test(String(a.p_country_iso)) &&
      isText(a.p_currency_code,3) && /^[A-Z]{3}$/.test(String(a.p_currency_code)) &&
      isPercent(a.p_base_fee_pct) && isPercent(a.p_premium_fee_pct) && isPercent(a.p_withdrawal_fee_pct)),
  admin_add_payment_method: defineRpc(["p_method_name","p_display_label"], [],
    (a) => isText(a.p_method_name,80) && isText(a.p_display_label,120)),
  admin_assign_role: defineRpc(["p_target_user_id","p_new_role"], [],
    (a) => isUuid(a.p_target_user_id) && isText(a.p_new_role,40), false),
  admin_available_gains: defineRpc([], [], noArgs),
  admin_ban_user: defineRpc(["p_target_id","p_reason"], [],
    (a) => isUuid(a.p_target_id) && isText(a.p_reason,1000,10), false),
  admin_escrow_action: defineRpc(["p_kind","p_id","p_action","p_reason"], [],
    (a) => ["service","order"].includes(String(a.p_kind)) && isUuid(a.p_id) &&
      ["release","refund","cancel","dispute"].includes(String(a.p_action)) && isText(a.p_reason,1000,10), false),
  admin_gains_breakdown: defineRpc([], [], noArgs),
  admin_grant_membership: defineRpc(["p_target_user_id","p_reason"], [],
    (a) => isUuid(a.p_target_user_id) && isText(a.p_reason,1000,5), false),
  admin_grant_permission: defineRpc(["p_target_user_id","p_permission_key"], [],
    (a) => isUuid(a.p_target_user_id) && isText(a.p_permission_key,100)),
  admin_invite_staff: defineRpc(["p_email","p_role","p_permissions"], [],
    (a) => isText(a.p_email,254) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(a.p_email)) &&
      ["support_agent","staff_member"].includes(String(a.p_role)) &&
      Array.isArray(a.p_permissions) && a.p_permissions.length <= 10 &&
      a.p_permissions.every((p) => typeof p === "string" &&
        (a.p_role === "support_agent"
          ? ["can_resolve_disputes","can_manage_tickets","can_review_reports"].includes(p)
          : ["can_manage_listings","can_review_reports","can_review_kyc"].includes(p)))),
  admin_has_password: defineRpc([], [], noArgs),
  admin_verify_password: defineRpc(["p_password"], [], (a) => isText(a.p_password,256,1)),
  admin_set_password: defineRpc(["p_new_password"], ["p_current_password"],
    (a) => isText(a.p_new_password,256,8) &&
      (a.p_current_password === undefined || a.p_current_password === null || isText(a.p_current_password,256,1))),
  admin_list_staff_permissions: defineRpc([], [], noArgs),
  admin_revoke_permission: defineRpc(["p_target_user_id","p_permission_key"], [],
    (a) => isUuid(a.p_target_user_id) && isText(a.p_permission_key,100)),
  admin_list_invitations: defineRpc([], [], noArgs),
  admin_list_ledger: defineRpc(["p_limit","p_offset","p_flow"], [],
    (a) => integerIn(a.p_limit,1,MAX_PAGE_SIZE) && integerIn(a.p_offset,0,100_000) &&
      (a.p_flow === null || a.p_flow === "CASH_IN" || a.p_flow === "CASH_OUT")),
  admin_list_open_escrows: defineRpc(["p_limit"], [],
    (a) => integerIn(a.p_limit,1,MAX_PAGE_SIZE)),
  admin_list_providers: defineRpc([], [], noArgs),
  admin_list_users: defineRpc(["p_search","p_role_filter","p_banned_only","p_limit","p_offset"], [],
    (a) => (a.p_search === null || isText(a.p_search,120)) &&
      (a.p_role_filter === null || isText(a.p_role_filter,40)) && isBool(a.p_banned_only) &&
      integerIn(a.p_limit,1,MAX_PAGE_SIZE) && integerIn(a.p_offset,0,100_000)),
  admin_moderate_user: defineRpc(
    ["p_target_user_id","p_action","p_reason","p_duration_hours","p_evidence_urls","p_ip_address"], [],
    (a) => isUuid(a.p_target_user_id) && isText(a.p_action,40) && isText(a.p_reason,1000,5) &&
      (a.p_duration_hours === null || integerIn(a.p_duration_hours,1,87600)) &&
      (a.p_evidence_urls === null || isStringArray(a.p_evidence_urls)) &&
      (a.p_ip_address === null || isText(a.p_ip_address,64)), false),
  admin_money_circulation: defineRpc([], [], noArgs),
  admin_money_circulation_full: defineRpc([], [], noArgs),
  admin_remove_gateway_credentials: defineRpc(["p_provider_name"], ["p_environment"],
    (a) => isText(a.p_provider_name,80) &&
      (a.p_environment === undefined || ["sandbox","production"].includes(String(a.p_environment))), false),
  admin_remove_support_agent: defineRpc(["p_user_id"], [],
    (a) => isUuid(a.p_user_id), false),
  admin_resolve_dispute: defineRpc(["p_dispute_id","p_outcome","p_notes"], [],
    (a) => isUuid(a.p_dispute_id) && isText(a.p_outcome,40) && isText(a.p_notes,2000,5), false),
  admin_review_kyc: defineRpc(["p_kyc_id","p_decision","p_reason"], [],
    (a) => isUuid(a.p_kyc_id) && isText(a.p_decision,30) && isText(a.p_reason,1000,3), false),
  admin_revoke_invitation: defineRpc(["p_id"], [],
    (a) => isUuid(a.p_id)),
  admin_revoke_membership: defineRpc(["p_target_id"], [],
    (a) => isUuid(a.p_target_id), false),
  admin_set_gateway_credentials: defineRpc(
    ["p_provider_name","p_api_public_key","p_api_secret_key"], ["p_webhook_secret","p_environment"],
    (a) => isText(a.p_provider_name,80) && isText(a.p_api_public_key,2048) &&
      isText(a.p_api_secret_key,4096) &&
      (a.p_webhook_secret === undefined || a.p_webhook_secret === null || isText(a.p_webhook_secret,4096)) &&
      (a.p_environment === undefined || ["sandbox","production"].includes(String(a.p_environment))), false),
  admin_set_app_setting: defineRpc(["p_key","p_value"], [],
    (a) => {
      const key = String(a.p_key || "");
      const value = typeof a.p_value === "string" ? a.p_value.trim() : "";
      const allowed = [
        "fee_pct_member", "fee_fixed_member", "fee_pct_non_member",
        "fee_fixed_non_member", "referral_l1_points", "membership_fee", "subscription_fee",
      ];
      const numeric = Number(value);
      return allowed.includes(key) && value.length > 0 && Number.isFinite(numeric) &&
        numeric >= 0 && (!key.startsWith("fee_pct_") || numeric <= 100);
    }),
  admin_set_provider_active: defineRpc(["p_provider_name","p_active"], [],
    (a) => isText(a.p_provider_name,80) && isBool(a.p_active)),
  admin_toggle_payment_method: defineRpc(["p_method_name","p_active"], [],
    (a) => isText(a.p_method_name,80) && isBool(a.p_active)),
  admin_topup_my_wallet: defineRpc(["p_amount","p_reason"], [],
    (a) => isNumericAmount(a.p_amount) && isText(a.p_reason,500,3), false),
  admin_unban_user: defineRpc(["p_target_id"], [],
    (a) => isUuid(a.p_target_id), false),
  admin_update_region: defineRpc(
    ["p_country_iso","p_base_fee_pct","p_premium_fee_pct","p_withdrawal_fee_pct","p_is_operational"], [],
    (a) => isText(a.p_country_iso,2) && /^[A-Z]{2}$/.test(String(a.p_country_iso)) &&
      isPercent(a.p_base_fee_pct) && isPercent(a.p_premium_fee_pct) &&
      isPercent(a.p_withdrawal_fee_pct) && isBool(a.p_is_operational)),
  admin_withdraw_from_my_wallet: defineRpc(["p_amount","p_momo_number","p_provider"], [],
    (a) => isNumericAmount(a.p_amount) && isText(a.p_momo_number,32,7) &&
      ["mtn_momo","orange_money","airtel_money","moov_money"].includes(String(a.p_provider)), false),
  admin_withdraw_gains_to_wallet: defineRpc(["p_amount"], [],
    (a) => isNumericAmount(a.p_amount), false),
  admin_withdraw_platform_gains: defineRpc(["p_amount","p_gateway","p_destination"], [],
    (a) => isNumericAmount(a.p_amount) && isText(a.p_gateway,40) &&
      isText(a.p_destination,80,5), false),
};
function validAdminRpcArgs(name: string, args: Record<string, unknown>): boolean {
  const schema = ADMIN_RPC_SCHEMAS[name];
  if (!schema || !schema.genericAllowed) return false;
  const required = schema.required, allowed = new Set([...required, ...schema.optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(args, key)) &&
    Object.keys(args).every((key) => allowed.has(key)) && schema.validate(args);
}
const MAX_PAGE_SIZE = 200;
function pageSize(url: URL, fallback = 50): number {
  const raw = url.searchParams.get("limit");
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(parsed))) : fallback;
}
function pageOffset(url: URL): number {
  const raw = url.searchParams.get("offset");
  if (raw === null || raw.trim() === "") return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100_000, Math.floor(parsed))) : 0;
}
function errorStatus(message: string): number {
  return /not authenticated|unauthorized|not authorized|staff only|only staff|permission|forbidden/i.test(message) ? 403 : 400;
}
async function rpc(supabase: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { data: null as unknown, error: "database_operation_failed", status: errorStatus(error.message || "") };
  if (data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).ok === false) {
    const message = typeof (data as Record<string, unknown>).error === "string"
      ? String((data as Record<string, unknown>).error) : "operation_not_allowed";
    return { data: null as unknown, error: message, status: errorStatus(message) };
  }
  return { data, error: null as string | null, status: 200 };
}
function success(data: unknown, headers: Headers) {
  return jsonResponse({ success: true, data }, 200, headers);
}
function failure(error: string, status: number, headers: Headers) {
  return jsonResponse({ success: false, error }, status, headers);
}
function onlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(body).every((key) => keys.has(key));
}
async function enforceMarketplaceCheckoutRateLimit(env: Env, userId: string, headers: Headers): Promise<Response | null> {
  if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) {
    return jsonResponse({ success: false, error: "marketplace_rate_limit_unavailable" }, 503, headers);
  }
  try {
    const response = await env.D1_IDENTITY.fetch("https://d1-identity.internal/internal/v1/rate-limit/consume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET,
      },
      body: JSON.stringify({ user_id: userId, action: "marketplace_checkout" }),
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status === 429) {
      return jsonResponse({ success: false, error: "marketplace_checkout_rate_limit_exceeded" }, 429, headers);
    }
    if (!response.ok) {
      return jsonResponse({ success: false, error: "marketplace_rate_limit_unavailable" }, 503, headers);
    }
    return null;
  } catch {
    return jsonResponse({ success: false, error: "marketplace_rate_limit_unavailable" }, 503, headers);
  }
}

function normalizedAdminPath(pathname: string): string {
  return pathname.startsWith("/api/admin/") ? "/api/v1/admin/" + pathname.slice("/api/admin/".length) : pathname;
}

export async function handleAuthenticatedApi(
  request: Request, userId: string, supabase: SupabaseClient, headers: Headers, env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizedAdminPath(url.pathname);
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/api/v1/checkout/quote") {
    const listingId = url.searchParams.get("listing_id")?.trim() || "";
    if (!listingId || listingId.length > 128 || !env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) {
      return failure("invalid_checkout_quote_request", 400, headers);
    }
    try {
      const response = await env.D1_IDENTITY.fetch(
        "https://d1.internal/internal/v1/market/listings/" + encodeURIComponent(listingId) + "/quote",
        { method: "GET", headers: { "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET } },
      );
      const result = await response.json() as { success?: boolean; data?: Record<string, unknown> };
      if (!response.ok || !result.success || !result.data) return failure("listing_quote_unavailable", response.status === 404 ? 404 : 503, headers);
      const listing = result.data;
      const isRange = listing.price_is_range === true || listing.price_is_range === 1 || listing.price_is_range === "true";
      const amountValue = isRange ? listing.price_min : listing.price;
      const amount = Math.round(Number(amountValue));
      const currency = String(listing.currency_code || "XAF").toUpperCase();
      const sellerId = typeof listing.seller_id === "string" ? listing.seller_id : "";
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000_000) return failure("listing_price_invalid", 409, headers);
      if (currency !== "XAF") return failure("unsupported_checkout_currency", 409, headers);
      if (!sellerId || sellerId === userId) return failure("listing_not_available", 409, headers);
      const { data: feeRows, error: feeError } = await supabase.rpc("cenpaya_calculate_platform_fee", { p_seller_id: sellerId, p_amount: amount });
      const fee = Array.isArray(feeRows) ? feeRows[0] : feeRows;
      if (feeError || !fee) return failure("checkout_fee_unavailable", 503, headers);
      const feePct = Number(fee.calculated_fee_pct), feeFixed = Number(fee.calculated_fee_fixed), platformFee = Number(fee.calculated_platform_fee);
      if (!Number.isFinite(feePct) || feePct < 0 || feePct > 100 || !Number.isSafeInteger(feeFixed) || feeFixed < 0 || !Number.isSafeInteger(platformFee) || platformFee < 0) {
        return failure("checkout_fee_configuration_invalid", 503, headers);
      }
      return success({ amount, fee_pct: feePct, fee_fixed: feeFixed, platform_fee: platformFee, total: amount + platformFee, currency_code: currency }, headers);
    } catch {
      return failure("checkout_quote_unavailable", 503, headers);
    }
  }
  if (method === "POST" && path === "/api/v1/checkout/orders") {
    const body = await readJsonObject(request, 16_384);
    const listingId = typeof body?.listing_id === "string" ? body.listing_id.trim() : "";
    const paymentMethod = body?.payment_method === "wallet" ? "wallet" : "";
    const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : "";
    if (body?.payment_method === "momo") return failure("marketplace_mobile_money_checkout_unavailable", 501, headers);
    if (!body || !listingId || listingId.length > 128 || !paymentMethod || idempotencyKey.length < 16 ||
        !env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) {
      return failure("invalid_checkout_request", 400, headers);
    }
    const rateLimited = await enforceMarketplaceCheckoutRateLimit(env, userId, headers);
    if (rateLimited) return rateLimited;
    let listing: Record<string, unknown>;
    try {
      const quoteResponse = await env.D1_IDENTITY.fetch(
        "https://d1.internal/internal/v1/market/listings/" + encodeURIComponent(listingId) + "/quote",
        { method: "GET", headers: { "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET } },
      );
      const quote = await quoteResponse.json() as { success?: boolean; data?: Record<string, unknown> };
      if (!quoteResponse.ok || !quote.success || !quote.data) {
        return failure("listing_quote_unavailable", quoteResponse.status === 404 ? 404 : 503, headers);
      }
      listing = quote.data;
    } catch {
      return failure("listing_quote_unavailable", 503, headers);
    }
    const sellerId = typeof listing.seller_id === "string" ? listing.seller_id : "";
    const isRange = listing.price_is_range === true || listing.price_is_range === 1 || listing.price_is_range === "true";
    const rawAmount = isRange ? listing.price_min : listing.price;
    const amount = Math.round(Number(rawAmount));
    const currency = String(listing.currency_code || "XAF").toUpperCase();
    if (!sellerId || sellerId === userId || !Number.isSafeInteger(amount) || amount <= 0 ||
        amount > 1_000_000_000_000 || listing.status === "deleted" || listing.status === "inactive") {
      return failure("listing_not_available", 409, headers);
    }
    if (currency !== "XAF") return failure("unsupported_checkout_currency", 409, headers);
    const { data: feeRows, error: feeError } = await supabase.rpc("cenpaya_calculate_platform_fee", { p_seller_id: sellerId, p_amount: amount });
    const fee = Array.isArray(feeRows) ? feeRows[0] : feeRows;
    if (feeError || !fee) return failure("checkout_fee_unavailable", 503, headers);
    const feePct = Number(fee.calculated_fee_pct), feeFixed = Number(fee.calculated_fee_fixed), platformFee = Number(fee.calculated_platform_fee);
    if (!Number.isFinite(feePct) || feePct < 0 || feePct > 100 || !Number.isSafeInteger(feeFixed) || feeFixed < 0 || !Number.isSafeInteger(platformFee) || platformFee < 0) {
      return failure("checkout_fee_configuration_invalid", 503, headers);
    }
    const cleanText = (value: unknown, max: number) =>
      typeof value === "string" ? value.trim().slice(0, max) : "";
    const total = amount + platformFee;
    const { data: wallet, error: walletError } = await supabase.from("wallets").select("available_funds").eq("user_id", userId).maybeSingle();
    if (walletError) return failure("wallet_balance_unavailable", 502, headers);
    if (!wallet || Number(wallet.available_funds) < total) return failure("insufficient_wallet_balance", 409, headers);
    try {
      const idemResponse = await env.D1_IDENTITY.fetch("https://d1.internal/internal/v1/idempotency/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET },
        body: JSON.stringify({ user_id: userId, scope: "marketplace_order", idempotency_key: idempotencyKey }),
      });
      if (idemResponse.status === 409) return failure("idempotency_conflict", 409, headers);
      if (!idemResponse.ok) return failure("idempotency_service_unavailable", 503, headers);
    } catch { return failure("idempotency_service_unavailable", 503, headers); }
    const payload = {
      buyer_id: userId,
      seller_id: sellerId,
      listing_id: listingId,
      amount,
      currency_code: currency,
      fee_pct: feePct,
      fee_fixed: feeFixed,
      platform_fee: platformFee,
      order_type: "marketplace",
      order_status: "pending",
      escrow_status: "hold",
      escrow_created_at: new Date().toISOString(),
      shipping_country: cleanText(body.shipping_country, 2) || "CM",
      shipping_region: cleanText(body.shipping_region, 100) || null,
      shipping_city: cleanText(body.shipping_city, 100) || null,
      shipping_address: cleanText(body.shipping_address, 500) || null,
      payment_method: paymentMethod,
      payment_phone: null,
    };
    if (paymentMethod !== "wallet") return failure("marketplace_mobile_money_checkout_unavailable", 501, headers);
    const { data: order, error } = await supabase.from("orders").insert(payload).select("id").single();
    if (error || !order?.id) return failure("order_creation_failed", 409, headers);
    return success({ id: order.id, amount, fee_pct: feePct, fee_fixed: feeFixed }, headers);
  }
  if (method === "GET" && path === "/api/v1/checkout/service-quote") {
    const serviceId = url.searchParams.get("service_id") || "";
    if (!isUuid(serviceId)) return failure("invalid_service_id", 400, headers);
    if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) return failure("service_quote_unavailable", 503, headers);
    try {
      const response = await env.D1_IDENTITY.fetch(
        `https://d1.internal/internal/v1/market/listings/${encodeURIComponent(serviceId)}/quote`,
        { headers: { "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET }, signal: AbortSignal.timeout(5_000) },
      );
      const quote = await response.json() as { success?: boolean; data?: Record<string, unknown> };
      const sellerId = quote.data?.seller_id;
      const amount = Number(quote.data?.price);
      const listingType = String(quote.data?.listing_type || "");
      const currency = String(quote.data?.currency_code || "XAF").toUpperCase();
      if (!response.ok || !quote.success || !isUuid(sellerId) || !Number.isSafeInteger(amount) ||
          amount <= 0 || currency !== "XAF" || (listingType && listingType !== "service")) {
        return failure("service_quote_unavailable", 409, headers);
      }
      const fee = await rpc(supabase, "cenpaya_calculate_platform_fee", {
        p_seller_id: sellerId, p_amount: amount,
      });
      if (fee.error || !fee.data || typeof fee.data !== "object") return failure("service_quote_unavailable", 503, headers);
      const feeData = (Array.isArray(fee.data) ? fee.data[0] : fee.data) as Record<string, unknown>;
      const feePct = Number(feeData.calculated_fee_pct || 0);
      const feeFixed = Number(feeData.calculated_fee_fixed || 0);
      const platformFee = Number(feeData.calculated_platform_fee || 0);
      return success({ seller_id: sellerId, amount, fee_pct: feePct, fee_fixed: feeFixed,
        platform_fee: platformFee, total: amount + platformFee, currency_code: currency }, headers);
    } catch { return failure("service_quote_unavailable", 503, headers); }
  }

  if (method === "POST" && path === "/api/v1/checkout/service-orders") {
    const body = await readJsonObject(request, 32_000);
    if (!body || !onlyKeys(body, ["seller_id","service_id","package_id","amount","requirements","due_at","milestones","payment_method"])) {
      return failure("invalid_service_order_checkout", 400, headers);
    }
    if (!isUuid(body.seller_id) || !isUuid(body.service_id) ||
        (body.package_id !== undefined && body.package_id !== null && !isUuid(body.package_id)) ||
        !integerIn(body.amount, 1, 1_000_000_000_000) || !isText(body.requirements, 8000, 5) ||
        typeof body.due_at !== "string" || !Number.isFinite(Date.parse(body.due_at)) ||
        (body.payment_method !== undefined && body.payment_method !== "wallet") ||
        (body.milestones !== undefined && (!Array.isArray(body.milestones) || body.milestones.length > 20))) {
      return failure("invalid_service_order_checkout", 400, headers);
    }
    if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) return failure("service_quote_unavailable", 503, headers);
    try {
      const quoteResponse = await env.D1_IDENTITY.fetch(
        `https://d1.internal/internal/v1/market/listings/${encodeURIComponent(String(body.service_id))}/quote`,
        { headers: { "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET }, signal: AbortSignal.timeout(5_000) },
      );
      const quote = await quoteResponse.json() as { success?: boolean; data?: Record<string, unknown> };
      const canonicalSeller = quote.data?.seller_id;
      const canonicalAmount = Number(quote.data?.price);
      const listingType = String(quote.data?.listing_type || "");
      const quoteCurrency = String(quote.data?.currency_code || "XAF").toUpperCase();
      if (!quoteResponse.ok || !quote.success || canonicalSeller !== body.seller_id ||
          canonicalAmount !== body.amount || quoteCurrency !== "XAF" ||
          (listingType && listingType !== "service")) {
        return failure("service_quote_mismatch", 409, headers);
      }
    } catch { return failure("service_quote_unavailable", 503, headers); }

    const milestones = (body.milestones || []).map((item: any) => ({
      title: item?.title, description: item?.description || null,
      amount: item?.amount, due_at: item?.due_at || body.due_at,
    }));
    if (milestones.some((m: any) => !isText(m.title,160,2) || !integerIn(m.amount,1,1_000_000_000_000) ||
        typeof m.due_at !== "string" || !Number.isFinite(Date.parse(m.due_at)))) {
      return failure("invalid_service_order_milestones", 400, headers);
    }
    const result = await rpc(supabase, "create_service_order", {
      p_seller_id: body.seller_id, p_service_id: body.service_id,
      p_package_id: body.package_id || null,
      p_amount: body.amount, p_requirements: String(body.requirements).trim(),
      p_due_at: new Date(body.due_at).toISOString(), p_milestones: milestones,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  const serviceOrderPath = path.match(/^\/api\/v1\/service-orders\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  if (serviceOrderPath) {
    const orderId = serviceOrderPath[1];
    const actionPath = serviceOrderPath[2] || "";
    if (method === "GET" && actionPath === "") {
      const { data, error } = await supabase.from("service_orders")
        .select("*,service_order_milestones(*),service_order_deadline_changes(*)")
        .eq("id", orderId).abortSignal(AbortSignal.timeout(5_000)).maybeSingle();
      if (error) return failure("service_order_lookup_failed", 502, headers);
      return data ? success(data, headers) : failure("service_order_not_found", 404, headers);
    }
    if (method !== "POST") return failure("method_not_allowed", 405, headers);
    const body = await readJsonObject(request, 16_000);
    if (!body) return failure("invalid_json_body", 400, headers);
    let name = "";
    let args: Record<string, unknown> = { p_order_id: orderId };
    if (actionPath === "accept" && onlyKeys(body, ["confirmed_deadline"]) &&
      typeof body.confirmed_deadline === "string" && Number.isFinite(Date.parse(body.confirmed_deadline))) {
      name = "accept_service_order"; args.p_confirmed_deadline = new Date(body.confirmed_deadline).toISOString();
    }
    else if (actionPath === "confirm" && onlyKeys(body, [])) name = "buyer_confirm_service_order";
    else if (actionPath === "dispute" && onlyKeys(body, ["reason"]) && isText(body.reason,2000,10)) {
      name = "open_service_dispute"; args.p_reason = body.reason;
    } else if (actionPath === "deadline" && onlyKeys(body, ["new_deadline"]) &&
      typeof body.new_deadline === "string" && Number.isFinite(Date.parse(body.new_deadline))) {
      name = "request_service_deadline_change"; args.p_new_deadline = new Date(body.new_deadline).toISOString();
    } else if ((actionPath === "milestones/submit" || actionPath === "delivery") && onlyKeys(body, ["milestone_id","delivery_note","delivery_file_url"]) &&
      isUuid(body.milestone_id) && isText(body.delivery_note,8000,5) &&
      (body.delivery_file_url === undefined || body.delivery_file_url === null || isText(body.delivery_file_url,2048))) {
      name = "submit_service_milestone"; args.p_milestone_id = body.milestone_id;
      args.p_delivery_note = body.delivery_note; args.p_delivery_file_url = body.delivery_file_url || null;
    } else if ((actionPath === "milestones/approve" || actionPath === "approve") && onlyKeys(body, ["milestone_id"]) && isUuid(body.milestone_id)) {
      name = "approve_service_milestone"; args.p_milestone_id = body.milestone_id;
    } else if (actionPath === "milestones/revision" && onlyKeys(body, ["milestone_id","note"]) &&
      isUuid(body.milestone_id) && isText(body.note,2000,3)) {
      name = "request_service_revision"; args.p_milestone_id = body.milestone_id; args.p_note = body.note;
    } else if (actionPath === "deadline/approve" && onlyKeys(body, ["change_id"]) && isUuid(body.change_id)) {
      name = "approve_service_deadline_change"; args = { p_change_id: body.change_id };
    } else return failure("invalid_service_order_action", 400, headers);
    const result = await rpc(supabase, name, args);
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  if (method === "GET" && path === "/api/v1/me/profile") {
    const profile = await readUserProfile(supabase, userId);
    return profile ? success(profile, headers) : failure("profile_not_found", 404, headers);
  }
  if (method === "GET" && path === "/api/v1/wallet") {
    // The live financial RPCs still mutate wallets (the XAF legacy wallet).
    // user_balances is currently an empty multi-currency table, so expose its
    // rows alongside the active wallet without silently replacing XAF values.
    const [{ data: balances, error: balancesError }, { data: legacy, error: legacyError }, { data: escrow, error: escrowError }] = await Promise.all([
      supabase.from("user_balances")
        .select("currency_code,available_funds,referral_earnings_available,referral_pending_lock,referral_received_locked")
        .eq("user_id", userId).order("currency_code", { ascending: true })
        .abortSignal(AbortSignal.timeout(5_000)),
      supabase.from("wallets")
        .select("available_funds,referral_earnings_available,referral_pending_lock,referral_received_locked")
        .eq("user_id", userId).abortSignal(AbortSignal.timeout(5_000)).maybeSingle(),
      supabase.from("buyer_escrow_summary").select("*").eq("user_id", userId)
        .abortSignal(AbortSignal.timeout(5_000)).maybeSingle(),
    ]);
    if (balancesError || legacyError || escrowError) return failure("wallet_lookup_failed", 502, headers);
    // XAF remains backed by wallets until every financial RPC is migrated.
    // Keep other currency rows from user_balances and replace any duplicate XAF row.
    const allBalances = (balances || []).filter((balance) => !legacy || balance.currency_code !== "XAF");
    if (legacy) allBalances.unshift({ ...legacy, currency_code: "XAF" });
    const primary = legacy
      ? { ...legacy, currency_code: "XAF" }
      : allBalances.find((balance) => balance.currency_code === "XAF") || allBalances[0] || null;
    return success(primary ? {
      ...primary,
      balances: allBalances,
      escrow_summary: escrow || null,
      source: legacy ? "wallets_xaf_with_user_balances" : "user_balances",
    } : null, headers);
  }
  if (method === "GET" && path === "/api/v1/ledger") {
    const flow = url.searchParams.get("flow");
    let query = supabase.from("transactional_ledger")
      .select("id,flow_direction,operator_reference,gross_amount,system_fee_cut,net_amount,currency_code,status,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(pageSize(url, 50));
    if (flow === "CASH_IN" || flow === "CASH_OUT") query = query.eq("flow_direction", flow);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("ledger_lookup_failed", 502, headers);
    return success(data || [], headers);
  }
  const deliveryVerification = path.match(/^\/api\/v1\/admin\/orders\/([0-9a-f-]{36})\/verify-delivery$/i);
  if (method === "POST" && deliveryVerification) {
    const body = await readJsonObject(request, 4096);
    if (!body || !onlyKeys(body, ["delivery_method", "tracking_number", "estimated_delivery_at", "inspection_window_hours"])) {
      return failure("invalid_delivery_verification", 400, headers);
    }
    const deliveryMethod = body.delivery_method;
    const trackingNumber = body.tracking_number;
    const estimatedDeliveryAt = body.estimated_delivery_at;
    const inspectionHours = body.inspection_window_hours;
    if ((deliveryMethod !== "courier" && deliveryMethod !== "seller_transport") ||
        (trackingNumber !== null && trackingNumber !== undefined && !isText(trackingNumber, 200)) ||
        typeof estimatedDeliveryAt !== "string" || !Number.isFinite(Date.parse(estimatedDeliveryAt)) ||
        !integerIn(inspectionHours, 1, 168)) {
      return failure("invalid_delivery_verification", 400, headers);
    }
    const result = await rpc(supabase, "admin_verify_order_delivery", {
      p_order_id: deliveryVerification[1],
      p_delivery_method: deliveryMethod,
      p_tracking_number: trackingNumber || null,
      p_estimated_delivery_at: new Date(estimatedDeliveryAt).toISOString(),
      p_inspection_window_hours: inspectionHours,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }

  const orderAction = path.match(/^\/api\/v1\/orders\/([0-9a-f-]{36})\/action$/i);
  if (method === "POST" && orderAction) {
    const body = await readJsonObject(request, 4096);
    const action = typeof body?.action === "string" ? body.action : "";
    if (!body || !onlyKeys(body, ["action", "photo_url", "photo_hash", "reason"])) return failure("invalid_order_action", 400, headers);
    if (action === "mark_delivered") {
      const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() : "";
      const photoHash = typeof body.photo_hash === "string" ? body.photo_hash.trim() : "";
      if (photoUrl.length > 2048 || photoHash.length > 500) return failure("invalid_delivery_proof", 400, headers);
      const result = await rpc(supabase, "seller_mark_delivered", { p_order_id: orderAction[1], p_photo_url: photoUrl || null, p_photo_hash: photoHash || null });
      return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
    }
    if (action === "mark_received") {
      const result = await rpc(supabase, "buyer_mark_received", { p_order_id: orderAction[1] });
      return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
    }
    if (action === "dispute") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length < 10 || reason.length > 2000) return failure("invalid_dispute_reason", 400, headers);
      const result = await rpc(supabase, "open_product_dispute", { p_order_id: orderAction[1], p_reason: reason });
      return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
    }
    return failure("unsupported_order_action", 400, headers);
  }
  const orderDetail = path.match(/^\/api\/v1\/orders\/([0-9a-f-]{36})$/i);
  if (method === "GET" && orderDetail) {
    const { data, error } = await supabase.from("orders").select("*").eq("id", orderDetail[1])
      .or("buyer_id.eq." + userId + ",seller_id.eq." + userId).maybeSingle();
    if (error) return failure("order_lookup_failed", 502, headers);
    return data ? success(data, headers) : failure("order_not_found", 404, headers);
  }
  if (method === "GET" && path === "/api/v1/orders") {
    const { data, error } = await supabase.from("orders")
      .select("*")
      .or("buyer_id.eq." + userId + ",seller_id.eq." + userId)
      .order("escrow_created_at", { ascending: false }).limit(pageSize(url, 50));
    if (error) return failure("orders_lookup_failed", 502, headers);
    return success(data || [], headers);
  }
  if (method === "GET" && path === "/api/v1/admin/ledger") {
    const flow = url.searchParams.get("flow");
    const result = await rpc(supabase, "admin_list_ledger", {
      p_limit: pageSize(url, 50), p_offset: pageOffset(url),
      p_flow: flow === "CASH_IN" || flow === "CASH_OUT" ? flow : null,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "GET" && path === "/api/v1/admin/escrows") {
    const result = await rpc(supabase, "admin_list_open_escrows", { p_limit: pageSize(url, 100) });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "GET" && path === "/api/v1/admin/settings") {
    const { data, error } = await supabase.from("app_settings").select("key,value").order("key", { ascending: true });
    if (error) return failure("settings_lookup_failed", 502, headers);
    return success(data || [], headers);
  }
  const adminSetting = path.match(/^\/api\/v1\/admin\/settings\/([a-z0-9_]{1,100})$/);
  if (method === "POST" && adminSetting) {
    const body = await readJsonObject(request, 4096);
    if (!body || !onlyKeys(body, ["value"]) || (typeof body.value !== "string" && typeof body.value !== "number" && typeof body.value !== "boolean")) {
      return failure("invalid_setting_value", 400, headers);
    }
    const result = await rpc(supabase, "admin_set_app_setting", { p_key: adminSetting[1], p_value: String(body.value) });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "GET" && path === "/api/v1/admin/overview") {
    if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) return failure("overview_service_unavailable", 503, headers);
    try {
      const [d1Response, orders, gains, circulation] = await Promise.all([
        env.D1_IDENTITY.fetch("https://d1.internal/internal/v1/admin/overview", { headers: { "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET } }),
        supabase.from("orders").select("id", { count: "exact", head: true }).abortSignal(AbortSignal.timeout(5_000)),
        supabase.from("system_gains").select("amount_earned").abortSignal(AbortSignal.timeout(5_000)),
        rpc(supabase, "admin_money_circulation_full", {}),
      ]);
      const d1 = await d1Response.json() as { success?: boolean; data?: { total_users?: number; total_listings?: number } };
      if (!d1Response.ok || !d1.success || orders.error || gains.error || circulation.error) return failure("overview_lookup_failed", 502, headers);
      const platformGains = (gains.data || []).reduce((sum, row) => sum + Number(row.amount_earned || 0), 0);
      return success({ total_users: Number(d1.data?.total_users || 0), total_listings: Number(d1.data?.total_listings || 0), total_orders: orders.count || 0, platform_gains: platformGains, money_circulation: circulation.data }, headers);
    } catch { return failure("overview_lookup_failed", 503, headers); }
  }
  if (method === "GET" && path === "/api/v1/admin/finance") {
    const names = ["admin_available_gains", "admin_gains_breakdown", "admin_money_circulation_full"] as const;
    const results = await Promise.all(names.map((name) => rpc(supabase, name, {})));
    const failed = results.find((item) => item.error);
    if (failed) return failure(failed.error || "finance_summary_failed", failed.status, headers);
    return success({
      available_gains: results[0].data, gains_breakdown: results[1].data,
      money_circulation: results[2].data,
    }, headers);
  }
  if (method === "GET" && path === "/api/v1/admin/gains") {
    const { data, error } = await supabase.from("system_gains")
      .select("id,source_type,amount_earned,currency_code,processed_at")
      .order("processed_at", { ascending: false }).limit(pageSize(url, 100))
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("gains_lookup_failed", 502, headers);
    return success(data || [], headers);
  }
  if (method === "GET" && path === "/api/v1/admin/payment-methods") {
    const { data, error } = await supabase.from("payment_methods")
      .select("id,method_name,display_label,is_active,admin_only,icon")
      .order("display_label", { ascending: true }).abortSignal(AbortSignal.timeout(5_000));
    if (error) return failure("payment_methods_lookup_failed", 502, headers);
    return success(data || [], headers);
  }
  if (method === "GET" && (path === "/api/v1/admin/regions" || path === "/api/v1/admin/countries")) {
    const { data, error } = await supabase.from("regional_market_configurations")
      .select("country_iso,currency_code,base_marketplace_fee_pct,premium_subscriber_fee_pct,withdrawal_fee_pct,is_operational,fee_fixed_premium,fee_fixed_base")
      .order("country_iso", { ascending: true }).abortSignal(AbortSignal.timeout(5_000));
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
      p_limit: pageSize(url, 50), p_offset: pageOffset(url),
    });
    if (result.error) return failure(result.error, result.status, headers);
    const payload = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
    return success(Array.isArray(payload.users) ? payload.users : [], headers);
  }
  const escrowAction = path.match(/^\/api\/v1\/admin\/escrows\/([0-9a-f-]{36})\/action$/i);
  if (method === "POST" && escrowAction) {
    const body = await readJsonObject(request);
    if (!body || !onlyKeys(body, ["kind", "action", "reason"])) return failure("invalid_json_body", 400, headers);
    const kind = body.kind === "service" ? "service" : body.kind === "order" ? "order" : "";
    const action = ["release", "refund", "cancel", "dispute"].includes(String(body.action)) ? String(body.action) : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
    if (!kind || !action || reason.length < 10) return failure("invalid_escrow_action", 400, headers);
    const result = await rpc(supabase, "admin_escrow_action", {
      p_kind: kind, p_id: escrowAction[1], p_action: action, p_reason: reason,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminBan = path.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/ban$/i);
  if (method === "POST" && adminBan) {
    const body = await readJsonObject(request);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!body || !onlyKeys(body, ["reason"]) || reason.length < 10 || reason.length > 1000) return failure("invalid_ban_request", 400, headers);
    const result = await rpc(supabase, "admin_ban_user", { p_target_id: adminBan[1], p_reason: reason });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminUnban = path.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/unban$/i);
  if (method === "POST" && adminUnban) {
    const result = await rpc(supabase, "admin_unban_user", { p_target_id: adminUnban[1] });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "POST" && path === "/api/v1/admin/platform-gains/withdraw") {
    const body = await readJsonObject(request);
    const amount = body?.amount;
    const gateway = typeof body?.gateway === "string" ? body.gateway.toUpperCase() : "";
    const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
    if (!body || !onlyKeys(body, ["amount", "gateway", "destination"]) || !Number.isSafeInteger(amount) || Number(amount) <= 0 ||
        !/^[A-Z0-9_]{2,40}$/.test(gateway) || destination.length < 7 || destination.length > 80) {
      return failure("invalid_platform_gains_withdrawal", 400, headers);
    }
    const result = await rpc(supabase, "admin_withdraw_platform_gains", {
      p_amount: Number(amount), p_gateway: gateway, p_destination: destination,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "POST" && path === "/api/v1/admin/wallet/topup") {
    const body = await readJsonObject(request);
    const amount = body?.amount;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!body || !onlyKeys(body, ["amount", "reason"]) || !Number.isSafeInteger(amount) || Number(amount) <= 0 || reason.length < 3 || reason.length > 500) {
      return failure("invalid_admin_wallet_topup", 400, headers);
    }
    const result = await rpc(supabase, "admin_topup_my_wallet", { p_amount: Number(amount), p_reason: reason });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "POST" && path === "/api/v1/admin/wallet/withdraw") {
    const body = await readJsonObject(request);
    const amount = body?.amount;
    const momo = typeof body?.momo_number === "string" ? body.momo_number.trim() : "";
    const provider = typeof body?.provider === "string" ? body.provider.toLowerCase() : "";
    if (!body || !onlyKeys(body, ["amount", "momo_number", "provider"]) || !Number.isSafeInteger(amount) || Number(amount) < 1000 || momo.length < 8 || momo.length > 32 ||
        !["mtn_momo", "orange_money", "airtel_money", "moov_money"].includes(provider)) {
      return failure("invalid_admin_wallet_withdrawal", 400, headers);
    }
    const result = await rpc(supabase, "admin_withdraw_from_my_wallet", {
      p_amount: Number(amount), p_momo_number: momo, p_provider: provider,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "POST" && path === "/api/v1/admin/gains/withdraw-to-wallet") {
    const body = await readJsonObject(request);
    const amount = body?.amount;
    if (!body || !onlyKeys(body, ["amount"]) || !Number.isSafeInteger(amount) || Number(amount) <= 0) {
      return failure("invalid_gains_withdrawal", 400, headers);
    }
    const result = await rpc(supabase, "admin_withdraw_gains_to_wallet", { p_amount: Number(amount) });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "POST" && path === "/api/v1/admin/gateway-credentials") {
    const body = await readJsonObject(request, 16_384);
    const provider = typeof body?.provider_name === "string" ? body.provider_name.trim() : "";
    const publicKey = typeof body?.api_public_key === "string" ? body.api_public_key.trim() : "";
    const secretKey = typeof body?.api_secret_key === "string" ? body.api_secret_key.trim() : "";
    const webhookSecret = typeof body?.webhook_secret === "string" ? body.webhook_secret.trim() : null;
    const environment = typeof body?.environment === "string" ? body.environment : "production";
    if (!body || !onlyKeys(body, ["provider_name", "api_public_key", "api_secret_key", "webhook_secret", "environment"]) ||
        (body.webhook_secret !== undefined && body.webhook_secret !== null && typeof body.webhook_secret !== "string") ||
        !provider || provider.length > 80 || !publicKey || publicKey.length > 2048 ||
        !secretKey || secretKey.length > 4096 || (webhookSecret !== null && webhookSecret.length > 4096) ||
        !["sandbox", "production"].includes(environment)) {
      return failure("invalid_gateway_credentials_request", 400, headers);
    }
    const result = await rpc(supabase, "admin_set_gateway_credentials", {
      p_provider_name: provider, p_api_public_key: publicKey, p_api_secret_key: secretKey,
      p_webhook_secret: webhookSecret, p_environment: environment,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "POST" && path === "/api/v1/admin/gateway-credentials/remove") {
    const body = await readJsonObject(request);
    const provider = typeof body?.provider_name === "string" ? body.provider_name.trim() : "";
    const environment = typeof body?.environment === "string" ? body.environment : "production";
    if (!body || !onlyKeys(body, ["provider_name", "environment"]) || !provider || provider.length > 80 || !["sandbox", "production"].includes(environment)) {
      return failure("invalid_gateway_credentials_request", 400, headers);
    }
    const result = await rpc(supabase, "admin_remove_gateway_credentials", {
      p_provider_name: provider, p_environment: environment,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  if (method === "POST" && path === "/api/v1/staff/invitations/accept") {
    const body = await readJsonObject(request, 4096);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!body || !onlyKeys(body, ["token"]) || token.length < 16 || token.length > 256) {
      return failure("invalid_staff_invitation", 400, headers);
    }
    const accepted = await rpc(supabase, "accept_staff_invitation", { p_token: token });
    if (accepted.error) return failure(accepted.error, accepted.status, headers);
    const payload = accepted.data && typeof accepted.data === "object"
      ? accepted.data as Record<string, unknown> : {};
    const role = typeof payload.role === "string" ? payload.role : "";
    if (!["support_agent","staff_member"].includes(role)) return failure("invalid_staff_role", 409, headers);
    if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) return failure("staff_workspace_sync_unavailable", 503, headers);
    try {
      const sync = await env.D1_IDENTITY.fetch("https://d1-identity.internal/internal/v1/staff/workspace/sync", {
        method: "POST",
        headers: { "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, role }),
        signal: AbortSignal.timeout(4_000),
      });
      if (!sync.ok) return failure("staff_workspace_sync_unavailable", 503, headers);
    } catch {
      return failure("staff_workspace_sync_unavailable", 503, headers);
    }
    return success({ ok: true, role }, headers);
  }

  const adminRole = path.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/role$/i);
  if (method === "POST" && adminRole) {
    const body = await readJsonObject(request);
    const role = typeof body?.role === "string" ? body.role : "";
    if (!body || !onlyKeys(body, ["role"]) || !["user", "support_agent", "staff_member", "super_admin"].includes(role)) return failure("invalid_role_assignment", 400, headers);
    const result = await rpc(supabase, "admin_assign_role", { p_target_user_id: adminRole[1], p_new_role: role });
    if (result.error) return failure(result.error, result.status, headers);
    if (["user","support_agent","staff_member","super_admin"].includes(role)) {
      if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) return failure("staff_workspace_sync_unavailable", 503, headers);
      try {
        const sync = await env.D1_IDENTITY.fetch("https://d1-identity.internal/internal/v1/staff/workspace/sync", {
          method: "POST",
          headers: { "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET, "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: adminRole[1], role }),
          signal: AbortSignal.timeout(4_000),
        });
        if (!sync.ok) return failure("staff_workspace_sync_unavailable", 503, headers);
      } catch { return failure("staff_workspace_sync_unavailable", 503, headers); }
    }
    return success(result.data, headers);
  }
  const adminPermission = path.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/permissions$/i);
  if (method === "POST" && adminPermission) {
    const body = await readJsonObject(request);
    const permission = typeof body?.permission_key === "string" ? body.permission_key.trim() : "";
    if (!body || !onlyKeys(body, ["permission_key"]) || !/^[a-z0-9_.:-]{2,100}$/i.test(permission)) return failure("invalid_permission_grant", 400, headers);
    const result = await rpc(supabase, "admin_grant_permission", {
      p_target_user_id: adminPermission[1], p_permission_key: permission,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminMembership = path.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/membership$/i);
  if (method === "POST" && adminMembership) {
    const body = await readJsonObject(request);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!body || !onlyKeys(body, ["reason"]) || reason.length < 5 || reason.length > 1000) return failure("invalid_membership_grant", 400, headers);
    const result = await rpc(supabase, "admin_grant_membership", {
      p_target_user_id: adminMembership[1], p_reason: reason,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminMembershipRevoke = path.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/membership\/revoke$/i);
  if (method === "POST" && adminMembershipRevoke) {
    const result = await rpc(supabase, "admin_revoke_membership", { p_target_id: adminMembershipRevoke[1] });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminModeration = path.match(/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/moderation$/i);
  if (method === "POST" && adminModeration) {
    const body = await readJsonObject(request, 16_384);
    const action = typeof body?.action === "string" ? body.action : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const duration = body?.duration_hours;
    const evidence = body?.evidence_urls;
    const ip = body?.ip_address;
    const validActions = ["flag", "suspend", "ban", "unban", "lift_suspension", "extend_suspension", "note"];
    if (!body || !onlyKeys(body, ["action", "reason", "duration_hours", "evidence_urls", "ip_address"]) || !validActions.includes(action) || reason.length < 10 || reason.length > 1000 ||
        (duration !== undefined && duration !== null && (!Number.isSafeInteger(duration) || Number(duration) < 1 || Number(duration) > 87600)) ||
        (evidence !== undefined && evidence !== null && (!Array.isArray(evidence) || evidence.length > 20 ||
          !evidence.every((item) => typeof item === "string" && item.length <= 2048))) ||
        (ip !== undefined && ip !== null && (typeof ip !== "string" || ip.length > 64))) {
      return failure("invalid_moderation_request", 400, headers);
    }
    const result = await rpc(supabase, "admin_moderate_user", {
      p_target_user_id: adminModeration[1], p_action: action, p_reason: reason,
      p_duration_hours: duration ?? null, p_evidence_urls: evidence ?? null, p_ip_address: ip ?? null,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminDispute = path.match(/^\/api\/v1\/admin\/disputes\/([0-9a-f-]{36})\/resolve$/i);
  if (method === "POST" && adminDispute) {
    const body = await readJsonObject(request);
    const outcome = typeof body?.outcome === "string" ? body.outcome : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;
    if (!body || !onlyKeys(body, ["outcome", "notes"]) || (body.notes !== undefined && typeof body.notes !== "string") ||
        !["buyer_wins", "seller_wins", "split", "withdrawn"].includes(outcome) || (notes !== null && notes.length > 2000)) return failure("invalid_dispute_resolution", 400, headers);
    const result = await rpc(supabase, "admin_resolve_dispute", {
      p_dispute_id: adminDispute[1], p_outcome: outcome, p_notes: notes,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminKyc = path.match(/^\/api\/v1\/admin\/kyc\/([0-9a-f-]{36})\/review$/i);
  if (method === "POST" && adminKyc) {
    const body = await readJsonObject(request);
    const decision = typeof body?.decision === "string" ? body.decision : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : null;
    if (!body || !onlyKeys(body, ["decision", "reason"]) || (body.reason !== undefined && typeof body.reason !== "string") ||
        !["approved", "rejected"].includes(decision) || (reason !== null && reason.length > 1000)) {
      return failure("invalid_kyc_review", 400, headers);
    }
    const result = await rpc(supabase, "admin_review_kyc", {
      p_kyc_id: adminKyc[1], p_decision: decision, p_reason: reason,
    });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminSupportAgent = path.match(/^\/api\/v1\/admin\/support-agents\/([0-9a-f-]{36})\/remove$/i);
  if (method === "POST" && adminSupportAgent) {
    const result = await rpc(supabase, "admin_remove_support_agent", { p_user_id: adminSupportAgent[1] });
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  const adminRpc = path.match(/^\/api\/v1\/admin\/rpc\/([a-z_]+)$/);
  if (method === "POST" && adminRpc) {
    const name = adminRpc[1];
    if (!ADMIN_RPC_SCHEMAS[name]) return failure("not_found", 404, headers);
    const body = await readJsonObject(request, 64_000);
    if (!body || !onlyKeys(body, ["args"])) return failure("invalid_json_body", 400, headers);
    const args = body.args === undefined ? {} :
      body.args && typeof body.args === "object" && !Array.isArray(body.args)
        ? body.args as Record<string, unknown> : null;
    if (!args || !validAdminRpcArgs(name, args)) {
      return failure("rpc_requires_typed_endpoint_or_invalid_arguments", 400, headers);
    }
    const result = await rpc(supabase, name, args);
    return result.error ? failure(result.error, result.status, headers) : success(result.data, headers);
  }
  return failure("not_found", 404, headers);
}
