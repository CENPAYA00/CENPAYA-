import { SupabaseClient } from "@supabase/supabase-js";
import { Env } from "./env.js";
import { jsonResponse, readJsonObject } from "./http-utils.js";
import { createPaymentWorkerClient } from "./supabase.js";

type Gateway = "FAPSHI" | "CAMPAY";
type Credentials = { api_public_key?: string; api_secret_key?: string };
type ProviderStatus = { status: string; amount: number; currency: string };
const BODY_LIMIT = 16_384;
const TIMEOUT_MS = 12_000;

function environment(env: Env): "sandbox" | "production" {
  return env.PAYMENT_ENVIRONMENT?.toLowerCase() === "sandbox" ? "sandbox" : "production";
}
function baseUrl(provider: Gateway, env: "sandbox" | "production"): string {
  if (provider === "FAPSHI") return env === "sandbox" ? "https://sandbox.fapshi.com" : "https://live.fapshi.com";
  return env === "sandbox" ? "https://demo.campay.net/api" : "https://api.campay.net/api";
}
function isGateway(value: unknown): value is Gateway {
  return value === "FAPSHI" || value === "CAMPAY";
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function amount(value: unknown, minimum: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(n) && n >= minimum ? n : null;
}
function phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/[^0-9]/g, "");
  if (digits.length === 9 && digits.startsWith("6")) digits = "237" + digits;
  return /^2376[0-9]{8}$/.test(digits) ? digits : null;
}
const SYSTEM_WORKER_SUBJECT = "00000000-0000-4000-8000-000000000001";

async function serviceClient(env: Env, subject = SYSTEM_WORKER_SUBJECT): Promise<SupabaseClient> {
  return createPaymentWorkerClient(env, subject);
}
async function credentials(db: SupabaseClient, provider: Gateway, env: Env): Promise<Credentials> {
  const { data, error } = await db.rpc("worker_get_gateway_credentials", {
    p_provider_name: provider, p_environment: environment(env),
  });
  const value = object(data) as Credentials;
  if (error || !value.api_secret_key || (provider === "FAPSHI" && !value.api_public_key)) {
    throw new Error("gateway_credentials_unavailable");
  }
  return value;
}
async function providerFetch(url: string, init: RequestInit): Promise<{ response: Response; data: Record<string, unknown> }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let data: Record<string, unknown> = {};
  try { data = object(JSON.parse(await response.text())); } catch { /* non-JSON provider response */ }
  return { response, data };
}
async function providerStatus(
  provider: Gateway, creds: Credentials, env: Env, reference: string,
): Promise<ProviderStatus> {
  const base = baseUrl(provider, environment(env));
  let result: { response: Response; data: Record<string, unknown> };
  if (provider === "FAPSHI") {
    result = await providerFetch(base + "/payment-status/" + encodeURIComponent(reference), {
      method: "GET", headers: { apiuser: creds.api_public_key!, apikey: creds.api_secret_key! },
    });
  } else {
    result = await providerFetch(base + "/transaction/" + encodeURIComponent(reference) + "/", {
      method: "GET", headers: { Authorization: "Token " + creds.api_secret_key },
    });
  }
  if (!result.response.ok) throw new Error("provider_status_unavailable");
  const n = Number(result.data.amount);
  const status = text(result.data.status).toUpperCase();
  const currency = text(result.data.currency || result.data.currency_code || "XAF").toUpperCase();
  if (!Number.isFinite(n) || !status) throw new Error("provider_status_invalid");
  return { status, amount: n, currency };
}
async function callRpc(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error("financial_operation_failed");
  return data;
}

/**
 * A provider 4xx is a definitive rejection, but releasing a reservation is a
 * separate database operation. Retry that idempotent state transition and emit
 * a structured error for Cloudflare observability if it cannot be confirmed.
 */
async function finalizeProviderRejection(
  db: SupabaseClient,
  operation: "topup" | "withdrawal",
  rpcName: string,
  args: Record<string, unknown>,
  operationId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (await callRpc(db, rpcName, args) === true) return true;
    } catch {
      // The RPC may have failed before or after committing. The SQL transition
      // must remain idempotent; retrying must never create a second payment.
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
  }
  console.error(JSON.stringify({
    event: "payment_rejection_finalization_failed",
    operation,
    operation_id: operationId,
    rpc: rpcName,
    attempts: 3,
    severity: "critical",
  }));
  return false;
}

async function retryRpcTrue(
  db: SupabaseClient, rpcName: string, args: Record<string, unknown>, operationId: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (await callRpc(db, rpcName, args) === true) return true;
    } catch {
      // These state transitions are idempotent; retry protects against transient
      // network failures both before and after a database commit.
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
  }
  console.error(JSON.stringify({
    event: "payment_state_transition_unconfirmed", operation_id: operationId,
    rpc: rpcName, attempts: 3, severity: "critical",
  }));
  return false;
}

async function enforcePaymentRateLimit(
  userId: string,
  action: "topup" | "withdrawal" | "payment_status",
  env: Env,
  headers: Headers,
): Promise<Response | null> {
  if (!env.D1_IDENTITY || !env.D1_INTERNAL_CALL_SECRET) {
    return jsonResponse({ success: false, error: "payment_rate_limit_unavailable" }, 503, headers);
  }
  try {
    const response = await env.D1_IDENTITY.fetch(
      "https://d1-identity.internal/internal/v1/rate-limit/consume",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET,
        },
        body: JSON.stringify({ user_id: userId, action }),
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (response.status === 429) {
      return jsonResponse({ success: false, error: "payment_rate_limit_exceeded" }, 429, headers);
    }
    if (!response.ok) {
      return jsonResponse({ success: false, error: "payment_rate_limit_unavailable" }, 503, headers);
    }
    return null;
  } catch {
    // Fail closed for money-moving requests if the limiter cannot be reached.
    return jsonResponse({ success: false, error: "payment_rate_limit_unavailable" }, 503, headers);
  }
}
async function startTopup(
  provider: Gateway, creds: Credentials, env: Env, id: string, amountXaf: number,
  phoneNumber: string | null, email: string, description = "CenPaya wallet top-up",
): Promise<{ reference: string; checkoutUrl: string | null }> {
  const base = baseUrl(provider, environment(env));
  if (provider === "FAPSHI") {
    const { response, data } = await providerFetch(base + "/initiate-pay", {
      method: "POST",
      headers: { "Content-Type": "application/json", apiuser: creds.api_public_key!, apikey: creds.api_secret_key! },
      body: JSON.stringify({ amount: amountXaf, email, userId: id, externalId: id, message: description }),
    });
    if (!response.ok) throw new Error("provider_rejected_" + response.status);
    const reference = text(data.transId);
    if (!reference) throw new Error("provider_reference_missing");
    return { reference, checkoutUrl: text(data.link, 2000) || null };
  }
  if (!phoneNumber) throw new Error("phone_required");
  const { response, data } = await providerFetch(base + "/collect/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Token " + creds.api_secret_key },
    body: JSON.stringify({
      amount: String(amountXaf), currency: "XAF", from: phoneNumber,
      description, external_reference: id,
    }),
  });
  if (!response.ok) throw new Error("provider_rejected_" + response.status);
  const reference = text(data.reference);
  if (!reference) throw new Error("provider_reference_missing");
  return { reference, checkoutUrl: text(data.link, 2000) || null };
}
async function startPayout(
  provider: Gateway, creds: Credentials, env: Env, id: string, amountXaf: number,
  phoneNumber: string, destinationProvider: string, recipientName: string,
): Promise<string> {
  const base = baseUrl(provider, environment(env));
  if (provider === "FAPSHI") {
    const { response, data } = await providerFetch(base + "/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json", apiuser: creds.api_public_key!, apikey: creds.api_secret_key! },
      body: JSON.stringify({
        amount: amountXaf, phone: phoneNumber, name: recipientName,
        medium: destinationProvider === "orange_money" ? "orange money" : "mobile money",
        userId: id, externalId: id, message: "CenPaya wallet withdrawal",
      }),
    });
    if (!response.ok) throw new Error("provider_rejected_" + response.status);
    const reference = text(data.transId);
    if (!reference) throw new Error("provider_reference_missing");
    return reference;
  }
  const { response, data } = await providerFetch(base + "/withdraw/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Token " + creds.api_secret_key },
    body: JSON.stringify({
      amount: String(amountXaf), currency: "XAF", to: phoneNumber,
      description: "CenPaya wallet withdrawal", external_reference: id,
    }),
  });
  if (!response.ok) throw new Error("provider_rejected_" + response.status);
  const reference = text(data.reference);
  if (!reference) throw new Error("provider_reference_missing");
  return reference;
}

export async function handleAuthenticatedPaymentApi(
  request: Request, userId: string, userDb: SupabaseClient, env: Env, headers: Headers,
): Promise<Response | null> {
  const url = new URL(request.url), method = request.method.toUpperCase();

  if (method === "GET" && url.pathname === "/api/v1/subscriptions/options") {
    const { data, error } = await userDb.rpc("cenpaya_momo_membership_options", {
      p_user_id: userId, p_environment: environment(env), p_supported: ["FAPSHI", "CAMPAY"],
    });
    const options = object(data);
    if (error || options.ok !== true) return jsonResponse({ success: false, error: "subscription_options_unavailable" }, 503, headers);
    return jsonResponse({ success: true, data: options }, 200, headers);
  }

  if (method === "POST" && url.pathname === "/api/v1/subscriptions") {
    const limited = await enforcePaymentRateLimit(userId, "topup", env, headers);
    if (limited) return limited;
    const body = await readJsonObject(request, BODY_LIMIT);
    if (!body) return jsonResponse({ success: false, error: "invalid_json_body" }, 400, headers);
    const idem = text(body.idempotency_key, 128);
    if (idem.length < 8) return jsonResponse({ success: false, error: "idempotency_key_required" }, 400, headers);
    const methodName = text(body.method, 32).toLowerCase();
    if (methodName === "wallet") {
      const { data, error } = await userDb.rpc("cenpaya_activate_membership", { p_user_id: userId, p_idempotency_key: idem });
      const result = object(data);
      if (error) return jsonResponse({ success: false, error: "subscription_payment_failed" }, 502, headers);
      if (result.ok !== true) {
        const code = String(result.error || "subscription_payment_failed").toLowerCase().includes("insufficient") ? "insufficient_wallet_balance" : "subscription_payment_failed";
        return jsonResponse({ success: false, error: code, data: result }, 409, headers);
      }
      return jsonResponse({ success: true, data: result }, 200, headers);
    }

    const provider = text(body.provider, 24).toUpperCase();
    const paymentMethod = text(body.payment_method, 32).toUpperCase();
    const { data: userInfo, error: userInfoError } = await userDb.from("users").select("phone,momo_number,email").eq("id", userId).maybeSingle();
    const mobile = phone(body.phone) || phone(userInfo?.momo_number || userInfo?.phone);
    if (userInfoError || !isGateway(provider) || !["MTN_MOMO", "ORANGE_MONEY", "AIRTEL_MONEY", "MOOV_MONEY"].includes(paymentMethod) || !mobile) {
      return jsonResponse({ success: false, error: "invalid_subscription_payment_request" }, 400, headers);
    }
    const { data: optionData, error: optionError } = await userDb.rpc("cenpaya_momo_membership_options", {
      p_user_id: userId, p_environment: environment(env), p_supported: ["FAPSHI", "CAMPAY"],
    });
    const optionResult = object(optionData);
    const available = Array.isArray(optionResult.options) ? optionResult.options as Array<Record<string, unknown>> : [];
    const selected = available.find(option => String(option.provider).toUpperCase() === provider && String(option.payment_method).toUpperCase() === paymentMethod);
    if (optionError || optionResult.ok !== true || !selected) return jsonResponse({ success: false, error: "subscription_payment_method_unavailable" }, 409, headers);

    const { data: startedData, error: startError } = await userDb.rpc("cenpaya_momo_membership_start", {
      p_user_id: userId, p_idempotency_key: idem, p_provider: provider, p_payment_method: paymentMethod, p_phone: mobile,
    });
    const started = object(startedData);
    if (startError || started.ok !== true || typeof started.payment_id !== "string") {
      return jsonResponse({ success: false, error: String(started.error || "subscription_payment_start_failed") }, 409, headers);
    }
    if (started.status === "succeeded" || started.provider_reference) {
      return jsonResponse({ success: true, data: { payment_id: started.payment_id, status: started.status, gross_amount: started.gross_amount, gateway_fee: started.gateway_fee, currency: started.currency } }, 200, headers);
    }

    let db: SupabaseClient, creds: Credentials;
    try { db = await serviceClient(env, userId); creds = await credentials(db, provider, env); }
    catch { return jsonResponse({ success: false, error: "payment_provider_not_configured" }, 503, headers); }

    if (env.D1_IDENTITY && env.D1_INTERNAL_CALL_SECRET) {
      try {
        const idemResponse = await env.D1_IDENTITY.fetch("https://d1-identity.internal/internal/v1/idempotency/consume", {
          method: "POST", headers: { "Content-Type": "application/json", "X-CenPaya-Internal-Secret": env.D1_INTERNAL_CALL_SECRET },
          body: JSON.stringify({ user_id: userId, scope: "membership_payment", idempotency_key: idem }), signal: AbortSignal.timeout(3_000),
        });
        if (idemResponse.status === 409) return jsonResponse({ success: false, error: "idempotency_conflict" }, 409, headers);
        if (!idemResponse.ok) return jsonResponse({ success: false, error: "idempotency_service_unavailable" }, 503, headers);
      } catch { return jsonResponse({ success: false, error: "idempotency_service_unavailable" }, 503, headers); }
    } else return jsonResponse({ success: false, error: "idempotency_service_unavailable" }, 503, headers);

    const email = typeof userInfo?.email === "string" ? userInfo.email.trim() : "";
    if (provider === "FAPSHI" && !email) return jsonResponse({ success: false, error: "verified_email_required_for_fapshi" }, 400, headers);
    try {
      const initiated = await startTopup(provider, creds, env, started.payment_id, Number(started.gross_amount), provider === "CAMPAY" ? mobile : null, email, "CenPaya premium membership");
      const attached = object(await callRpc(db, "cenpaya_momo_membership_attach", { p_payment_id: started.payment_id, p_provider_reference: initiated.reference }));
      if (attached.ok !== true) throw new Error("membership_reference_not_recorded");
      return jsonResponse({ success: true, data: { payment_id: started.payment_id, status: "pending", provider, provider_reference: initiated.reference, payment_url: initiated.checkoutUrl, gross_amount: started.gross_amount, gateway_fee: started.gateway_fee, currency: started.currency } }, 200, headers);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "provider_initiation_failed";
      const definitive = reason.startsWith("provider_rejected_");
      try { await callRpc(db, "cenpaya_momo_membership_fail", { p_payment_id: started.payment_id, p_reason: reason, p_uncertain: !definitive }); } catch { /* Keep uncertain payments for provider reconciliation. */ }
      return jsonResponse({ success: false, error: definitive ? "payment_provider_rejected_request" : "payment_initiation_uncertain_contact_support" }, definitive ? 502 : 503, headers);
    }
  }

  const subscriptionStatus = url.pathname.match(/^\/api\/v1\/subscriptions\/([0-9a-f-]{36})$/i);
  if (method === "GET" && subscriptionStatus) {
    const limited = await enforcePaymentRateLimit(userId, "payment_status", env, headers);
    if (limited) return limited;
    let result = object(await callRpc(userDb, "cenpaya_momo_membership_get", { p_payment_id: subscriptionStatus[1] }));
    if (!result.id || result.user_id !== userId) return jsonResponse({ success: false, error: "subscription_payment_not_found" }, 404, headers);
    if (result.provider_reference && ["pending", "expired"].includes(String(result.status))) {
      try {
        const provider = String(result.provider).toUpperCase() as Gateway;
        if (isGateway(provider)) {
          const db = await serviceClient(env, userId);
          const creds = await credentials(db, provider, env);
          const verified = await providerStatus(provider, creds, env, String(result.provider_reference));
          if (verified.status === "SUCCESSFUL" || verified.status === "FAILED") {
            await callRpc(db, "cenpaya_momo_membership_confirm", {
              p_payment_id: subscriptionStatus[1], p_provider_reference: String(result.provider_reference),
              p_success: verified.status === "SUCCESSFUL", p_paid_amount: verified.amount, p_currency: verified.currency,
              p_reason: verified.status === "FAILED" ? "Provider reported failed payment" : null,
            });
            result = object(await callRpc(userDb, "cenpaya_momo_membership_get", { p_payment_id: subscriptionStatus[1] }));
          }
        }
      } catch { /* Keep the payment pending while provider status is uncertain. */ }
    }
    return jsonResponse({ success: true, data: result }, 200, headers);
  }
  if (method === "POST" && url.pathname === "/api/v1/wallet/topups") {
    const limited = await enforcePaymentRateLimit(userId, "topup", env, headers);
    if (limited) return limited;
    const body = await readJsonObject(request, BODY_LIMIT);
    if (!body) return jsonResponse({ success: false, error: "invalid_json_body" }, 400, headers);
    const value = amount(body.amount, 100);
    const providerName = String(body.provider || "").toUpperCase();
    const idem = text(body.idempotency_key, 128);
    const mobile = providerName === "CAMPAY" ? phone(body.phone) : null;
    if (!value || !isGateway(providerName) || idem.length < 8 || (providerName === "CAMPAY" && !mobile)) {
      return jsonResponse({ success: false, error: "invalid_topup_request" }, 400, headers);
    }

    const { data: topupId, error: createError } = await userDb.rpc("create_wallet_topup_intent", {
      p_amount: value, p_provider: providerName, p_idempotency_key: idem,
    });
    if (createError || typeof topupId !== "string") {
      return jsonResponse({ success: false, error: "topup_intent_creation_failed" }, 400, headers);
    }
    const { data: current, error: statusError } = await userDb.rpc("get_wallet_topup_status", { p_topup_id: topupId });
    if (statusError) return jsonResponse({ success: false, error: "topup_status_unavailable" }, 502, headers);
    const existing = object(current);
    if (existing.status === "completed" || existing.status === "failed" || existing.provider_reference) {
      return jsonResponse({ success: true, data: existing }, 200, headers);
    }
    if (existing.initiation_in_progress === true) {
      return jsonResponse({ success: false, error: "topup_initiation_in_progress_check_status" }, 409, headers);
    }

    let email = "";
    if (providerName === "FAPSHI") {
      const { data: userInfo, error: userInfoError } = await userDb.from("users")
        .select("email").eq("id", userId).maybeSingle();
      email = typeof userInfo?.email === "string" ? userInfo.email.trim() : "";
      if (userInfoError || !email) {
        return jsonResponse({ success: false, error: "verified_email_required_for_fapshi" }, 400, headers);
      }
    }

    let db: SupabaseClient, creds: Credentials;
    try { db = await serviceClient(env, userId); creds = await credentials(db, providerName, env); }
    catch { return jsonResponse({ success: false, error: "payment_provider_not_configured" }, 503, headers); }

    const claimed = await callRpc(db, "claim_wallet_topup_initiation", { p_topup_id: topupId });
    if (claimed !== true) {
      return jsonResponse({ success: false, error: "topup_initiation_already_claimed_check_status" }, 409, headers);
    }

    try {
      const started = await startTopup(providerName, creds, env, topupId, value, mobile, email);
      const recorded = await retryRpcTrue(db, "record_wallet_topup_provider_reference", {
        p_topup_id: topupId, p_provider: providerName,
        p_provider_transaction_id: started.reference, p_checkout_url: started.checkoutUrl,
      });
      if (recorded !== true) throw new Error("reference_not_recorded");
      return jsonResponse({ success: true, data: {
        id: topupId, provider: providerName, amount: value, currency_code: "XAF",
        status: "pending", provider_reference: started.reference, checkout_url: started.checkoutUrl,
      } }, 200, headers);
    } catch (error) {
      if (error instanceof Error && /^provider_rejected_4\d\d$/.test(error.message)) {
        const finalized = await finalizeProviderRejection(
          db, "topup", "fail_wallet_topup_from_gateway", {
            p_topup_id: topupId, p_provider: providerName,
            p_provider_transaction_id: "initiating:" + topupId,
          }, topupId,
        );
        if (!finalized) {
          return jsonResponse({ success: false, error: "payment_initiation_uncertain_contact_support" }, 502, headers);
        }
        return jsonResponse({ success: false, error: "payment_provider_rejected_request" }, 400, headers);
      }
      return jsonResponse({ success: false, error: "payment_initiation_uncertain_contact_support" }, 502, headers);
    }
  }

  const topupStatus = url.pathname.match(/^\/api\/v1\/wallet\/topups\/([0-9a-f-]{36})$/i);
  if (method === "GET" && topupStatus) {
    const limited = await enforcePaymentRateLimit(userId, "payment_status", env, headers);
    if (limited) return limited;
    const { data, error } = await userDb.rpc("get_wallet_topup_status", { p_topup_id: topupStatus[1] });
    if (error) return jsonResponse({ success: false, error: "topup_status_unavailable" }, 502, headers);
    if (!data) return jsonResponse({ success: false, error: "topup_not_found" }, 404, headers);
    let state = object(data);
    const providerReference = typeof state.provider_reference === "string" ? state.provider_reference : "";
    if (state.status === "pending" && providerReference) {
      try {
        const provider = String(state.provider).toUpperCase();
        if (isGateway(provider)) {
          const db = await serviceClient(env, userId);
          const creds = await credentials(db, provider, env);
          const verified = await providerStatus(provider, creds, env, providerReference);
          if (verified.amount === Number(state.amount) && verified.currency === String(state.currency_code || "XAF").toUpperCase()) {
            let rpcName = "";
            let args: Record<string, unknown> = {};
            if (verified.status === "SUCCESSFUL") {
              rpcName = "settle_wallet_topup_from_gateway";
              args = { p_topup_id: topupStatus[1], p_provider: provider, p_provider_transaction_id: providerReference, p_amount: verified.amount, p_currency_code: verified.currency };
            } else if (verified.status === "FAILED") {
              rpcName = "fail_wallet_topup_from_gateway";
              args = { p_topup_id: topupStatus[1], p_provider: provider, p_provider_transaction_id: state.provider_reference };
            }
            if (rpcName && await retryRpcTrue(db, rpcName, args, topupStatus[1])) {
              const refreshed = await userDb.rpc("get_wallet_topup_status", { p_topup_id: topupStatus[1] });
              if (!refreshed.error && refreshed.data) state = object(refreshed.data);
            }
          }
        }
      } catch {
        // Preserve pending/reserved state whenever the provider result is uncertain.
      }
    }
    return jsonResponse({ success: true, data: state }, 200, headers);
  }

  if (method === "POST" && url.pathname === "/api/v1/wallet/withdrawals") {
    const limited = await enforcePaymentRateLimit(userId, "withdrawal", env, headers);
    if (limited) return limited;
    const body = await readJsonObject(request, BODY_LIMIT);
    if (!body) return jsonResponse({ success: false, error: "invalid_json_body" }, 400, headers);
    const value = amount(body.amount, 500);
    const gateway = String(body.gateway_provider || "").toUpperCase();
    const destination = String(body.destination_provider || "").toLowerCase();
    const source = body.source_bucket === "referral" ? "referral" : "available";
    const mobile = phone(body.destination_phone);
    const idem = text(body.idempotency_key, 128);
    if (!value || !isGateway(gateway) || !["mtn_momo", "orange_money"].includes(destination) || !mobile || idem.length < 8) {
      return jsonResponse({ success: false, error: "invalid_withdrawal_request" }, 400, headers);
    }

    let db: SupabaseClient, creds: Credentials;
    try { db = await serviceClient(env, userId); creds = await credentials(db, gateway, env); }
    catch { return jsonResponse({ success: false, error: "payment_provider_not_configured" }, 503, headers); }

    let withdrawalId: unknown;
    try {
      withdrawalId = await callRpc(db, "create_withdrawal_idempotent", {
        p_user_id: userId, p_amount: value, p_source_bucket: source,
        p_destination_phone: mobile, p_destination_provider: destination,
        p_gateway_provider: gateway, p_idempotency_key: idem,
      });
    } catch {
      return jsonResponse({ success: false, error: "withdrawal_request_failed" }, 400, headers);
    }
    if (typeof withdrawalId !== "string") return jsonResponse({ success: false, error: "withdrawal_request_failed" }, 400, headers);

    const { data: current, error: lookupError } = await db.from("user_withdrawals")
      .select("id,status,gateway_reference,net_disbursement")
      .eq("id", withdrawalId).eq("user_id", userId).maybeSingle();
    if (lookupError || !current) return jsonResponse({ success: false, error: "withdrawal_status_unavailable" }, 502, headers);
    if (current.status !== "pending" || current.gateway_reference) {
      const visible = {
        ...current,
        gateway_reference: String(current.gateway_reference || "").startsWith("initiating:")
          ? null : current.gateway_reference,
      };
      return jsonResponse({ success: true, data: visible }, 200, headers);
    }

    const claimed = await callRpc(db, "claim_withdrawal_provider_payout", {
      p_withdrawal_id: withdrawalId, p_gateway_provider: gateway,
    });
    if (claimed !== true) {
      return jsonResponse({ success: true, data: { id: withdrawalId, status: "pending" } }, 200, headers);
    }

    const { data: userInfo } = await userDb.from("users").select("username").eq("id", userId).maybeSingle();
    const recipientName = typeof userInfo?.username === "string" && userInfo.username.trim()
      ? userInfo.username.trim() : "CenPaya user";

    try {
      const reference = await startPayout(gateway, creds, env, withdrawalId, value, mobile, destination, recipientName);
      const recorded = await retryRpcTrue(db, "record_withdrawal_provider_reference", {
        p_withdrawal_id: withdrawalId, p_gateway_provider: gateway, p_gateway_reference: reference,
      });
      if (recorded !== true) throw new Error("reference_not_recorded");
      let state = "pending";
      try {
        const verified = await providerStatus(gateway, creds, env, reference);
        if (verified.amount === Number(current.net_disbursement) && verified.currency === "XAF") {
          if (verified.status === "SUCCESSFUL") {
            await callRpc(db, "finalize_withdrawal_from_gateway", {
              p_withdrawal_id: withdrawalId, p_gateway_provider: gateway, p_outcome: "completed",
              p_gateway_reference: reference, p_failure_reason: null,
            });
            state = "completed";
          } else if (verified.status === "FAILED") {
            await callRpc(db, "finalize_withdrawal_from_gateway", {
              p_withdrawal_id: withdrawalId, p_gateway_provider: gateway, p_outcome: "failed",
              p_gateway_reference: reference, p_failure_reason: "Provider reported failed payout",
            });
            state = "failed";
          }
        }
      } catch { /* Keep funds reserved while the provider result is uncertain. */ }
      return jsonResponse({ success: true, data: { id: withdrawalId, status: state, gateway_reference: reference } }, 200, headers);
    } catch (error) {
      if (error instanceof Error && /^provider_rejected_4\d\d$/.test(error.message)) {
        const finalized = await finalizeProviderRejection(
          db, "withdrawal", "finalize_withdrawal_from_gateway", {
            p_withdrawal_id: withdrawalId, p_gateway_provider: gateway,
            p_outcome: "failed", p_gateway_reference: null,
            p_failure_reason: "Provider rejected payout request",
          }, String(withdrawalId),
        );
        if (!finalized) {
          return jsonResponse({ success: false, error: "withdrawal_initiation_uncertain_contact_support" }, 502, headers);
        }
        return jsonResponse({ success: false, error: "payment_provider_rejected_request" }, 400, headers);
      }
      return jsonResponse({ success: false, error: "withdrawal_initiation_uncertain_contact_support" }, 502, headers);
    }
  }

  const withdrawalStatus = url.pathname.match(/^\/api\/v1\/wallet\/withdrawals\/([0-9a-f-]{36})$/i);
  if (method === "GET" && withdrawalStatus) {
    const limited = await enforcePaymentRateLimit(userId, "payment_status", env, headers);
    if (limited) return limited;
    const selectWithdrawal = () => userDb.from("user_withdrawals")
      .select("id,requested_amount,fee_charged,net_disbursement,status,source_bucket,destination_phone,destination_provider,gateway_provider,gateway_reference,failure_reason,currency_code,created_at,processed_at,completed_at")
      .eq("id", withdrawalStatus[1]).eq("user_id", userId).maybeSingle();
    let { data, error } = await selectWithdrawal();
    if (error) return jsonResponse({ success: false, error: "withdrawal_status_unavailable" }, 502, headers);
    if (!data) return jsonResponse({ success: false, error: "withdrawal_not_found" }, 404, headers);
    const reference = String(data.gateway_reference || "");
    const provider = String(data.gateway_provider || "").toUpperCase();
    if (data.status === "pending" && reference && !reference.startsWith("initiating:") && isGateway(provider)) {
      try {
        const db = await serviceClient(env, userId);
        const creds = await credentials(db, provider, env);
        const verified = await providerStatus(provider, creds, env, reference);
        if (verified.amount === Number(data.net_disbursement) && verified.currency === String(data.currency_code || "XAF").toUpperCase()) {
          if (verified.status === "SUCCESSFUL" || verified.status === "FAILED") {
            const finalized = await retryRpcTrue(db, "finalize_withdrawal_from_gateway", {
              p_withdrawal_id: withdrawalStatus[1], p_gateway_provider: provider,
              p_outcome: verified.status === "SUCCESSFUL" ? "completed" : "failed",
              p_gateway_reference: reference,
              p_failure_reason: verified.status === "FAILED" ? "Provider reported failed payout" : null,
            }, withdrawalStatus[1]);
            if (finalized) {
              const refreshed = await selectWithdrawal();
              data = refreshed.data;
              error = refreshed.error;
            }
          }
        }
      } catch {
        // Do not release reserved funds while provider status is unavailable.
      }
    }
    if (error) return jsonResponse({ success: false, error: "withdrawal_status_unavailable" }, 502, headers);
    if (!data) return jsonResponse({ success: false, error: "withdrawal_not_found" }, 404, headers);
    const visible = {
      ...data,
      gateway_reference: String(data.gateway_reference || "").startsWith("initiating:")
        ? null : data.gateway_reference,
    };
    return jsonResponse({ success: true, data: visible }, 200, headers);
  }

  return null;
}
