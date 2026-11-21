import { SupabaseClient } from "@supabase/supabase-js";
import { Env } from "./env.js";
import { jsonResponse, readJsonObject } from "./http-utils.js";
import { verifyHs256Jwt } from "./jwt.js";
import { createPaymentServiceClient } from "./supabase.js";

type Gateway = "FAPSHI" | "CAMPAY";
type Credentials = { api_public_key?: string; api_secret_key?: string; webhook_secret?: string };
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
function equalSecret(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}
async function webhookBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > BODY_LIMIT) return null;
    if (request.headers.get("content-type")?.toLowerCase().includes("application/x-www-form-urlencoded")) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of new URLSearchParams(raw)) result[k] = v;
      return result;
    }
    return object(JSON.parse(raw));
  } catch {
    return null;
  }
}
function service(env: Env): SupabaseClient {
  return createPaymentServiceClient(env);
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
async function startTopup(
  provider: Gateway, creds: Credentials, env: Env, id: string, amountXaf: number,
  phoneNumber: string | null, email: string,
): Promise<{ reference: string; checkoutUrl: string | null }> {
  const base = baseUrl(provider, environment(env));
  if (provider === "FAPSHI") {
    const { response, data } = await providerFetch(base + "/initiate-pay", {
      method: "POST",
      headers: { "Content-Type": "application/json", apiuser: creds.api_public_key!, apikey: creds.api_secret_key! },
      body: JSON.stringify({ amount: amountXaf, email, userId: id, externalId: id, message: "CenPaya wallet top-up" }),
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
      description: "CenPaya wallet top-up", external_reference: id,
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

  if (method === "POST" && url.pathname === "/api/v1/wallet/topups") {
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
    try { db = service(env); creds = await credentials(db, providerName, env); }
    catch { return jsonResponse({ success: false, error: "payment_provider_not_configured" }, 503, headers); }

    const claimed = await callRpc(db, "claim_wallet_topup_initiation", { p_topup_id: topupId });
    if (claimed !== true) {
      return jsonResponse({ success: false, error: "topup_initiation_already_claimed_check_status" }, 409, headers);
    }

    try {
      const started = await startTopup(providerName, creds, env, topupId, value, mobile, email);
      const recorded = await callRpc(db, "record_wallet_topup_provider_reference", {
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
        await callRpc(db, "fail_wallet_topup_from_gateway", {
          p_topup_id: topupId, p_provider: providerName,
          p_provider_transaction_id: "initiating:" + topupId,
        }).catch(() => null);
        return jsonResponse({ success: false, error: "payment_provider_rejected_request" }, 400, headers);
      }
      return jsonResponse({ success: false, error: "payment_initiation_uncertain_contact_support" }, 502, headers);
    }
  }

  const topupStatus = url.pathname.match(/^\/api\/v1\/wallet\/topups\/([0-9a-f-]{36})$/i);
  if (method === "GET" && topupStatus) {
    const { data, error } = await userDb.rpc("get_wallet_topup_status", { p_topup_id: topupStatus[1] });
    if (error) return jsonResponse({ success: false, error: "topup_status_unavailable" }, 502, headers);
    if (!data) return jsonResponse({ success: false, error: "topup_not_found" }, 404, headers);
    return jsonResponse({ success: true, data }, 200, headers);
  }

  if (method === "POST" && url.pathname === "/api/v1/wallet/withdrawals") {
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
    try { db = service(env); creds = await credentials(db, gateway, env); }
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
      const recorded = await callRpc(db, "record_withdrawal_provider_reference", {
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
        await callRpc(db, "finalize_withdrawal_from_gateway", {
          p_withdrawal_id: withdrawalId, p_gateway_provider: gateway,
          p_outcome: "failed", p_gateway_reference: null,
          p_failure_reason: "Provider rejected payout request",
        }).catch(() => null);
        return jsonResponse({ success: false, error: "payment_provider_rejected_request" }, 400, headers);
      }
      return jsonResponse({ success: false, error: "withdrawal_initiation_uncertain_contact_support" }, 502, headers);
    }
  }

  const withdrawalStatus = url.pathname.match(/^\/api\/v1\/wallet\/withdrawals\/([0-9a-f-]{36})$/i);
  if (method === "GET" && withdrawalStatus) {
    const { data, error } = await userDb.from("user_withdrawals")
      .select("id,requested_amount,fee_charged,net_disbursement,status,source_bucket,destination_phone,destination_provider,gateway_reference,failure_reason,created_at,processed_at,completed_at")
      .eq("id", withdrawalStatus[1]).eq("user_id", userId).maybeSingle();
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

export async function handleGatewayWebhook(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const provider: Gateway | null = path.endsWith("/fapshi") ? "FAPSHI" : path.endsWith("/campay") ? "CAMPAY" : null;
  if (request.method !== "POST" || !provider) return jsonResponse({ ok: false, error: "not_found" }, 404);
  const payload = await webhookBody(request);
  if (!payload) return jsonResponse({ ok: false, error: "invalid_webhook_body" }, 400);

  let db: SupabaseClient, creds: Credentials;
  try { db = service(env); creds = await credentials(db, provider, env); }
  catch { return jsonResponse({ ok: false, error: "payment_service_not_configured" }, 503); }
  if (!creds.webhook_secret) return jsonResponse({ ok: false, error: "webhook_secret_not_configured" }, 503);

  if (provider === "FAPSHI") {
    if (!equalSecret(request.headers.get("x-wh-secret") || "", creds.webhook_secret)) {
      return jsonResponse({ ok: false, error: "invalid_webhook_signature" }, 401);
    }
  } else {
    const signature = request.headers.get("x-campay-signature") || text(payload.signature, 8192);
    try {
      if (!signature) throw new Error("signature_missing");
      await verifyHs256Jwt(signature, creds.webhook_secret);
    } catch {
      return jsonResponse({ ok: false, error: "invalid_webhook_signature" }, 401);
    }
  }

  const externalId = provider === "FAPSHI"
    ? text(payload.externalId || payload.external_id || payload.userId, 100)
    : text(payload.external_reference, 100);
  const reference = provider === "FAPSHI"
    ? text(payload.transId || payload.trans_id, 200)
    : text(payload.reference, 200);
  if (!externalId || !reference) return jsonResponse({ ok: false, error: "missing_payment_reference" }, 400);

  const { data: topup } = await db.from("wallet_topups")
    .select("id,provider,transaction_id,amount,currency_code,status")
    .eq("id", externalId).maybeSingle();

  if (topup && String(topup.provider).toUpperCase() === provider) {
    if (String(topup.transaction_id).startsWith("pending:") || String(topup.transaction_id).startsWith("initiating:")) {
      const recorded = await callRpc(db, "record_wallet_topup_provider_reference", {
        p_topup_id: topup.id, p_provider: provider, p_provider_transaction_id: reference, p_checkout_url: null,
      });
      if (recorded !== true) return jsonResponse({ ok: false, error: "payment_reference_mismatch" }, 409);
    } else if (topup.transaction_id !== reference) {
      return jsonResponse({ ok: false, error: "payment_reference_mismatch" }, 409);
    }
    let verified: ProviderStatus;
    try { verified = await providerStatus(provider, creds, env, reference); }
    catch { return jsonResponse({ ok: false, error: "payment_status_unavailable" }, 503); }
    if (verified.amount !== Number(topup.amount) || verified.currency !== String(topup.currency_code).toUpperCase()) {
      return jsonResponse({ ok: false, error: "payment_amount_or_currency_mismatch" }, 409);
    }
    if (verified.status === "SUCCESSFUL") {
      const result = await callRpc(db, "settle_wallet_topup_from_gateway", {
        p_topup_id: topup.id, p_provider: provider, p_provider_transaction_id: reference,
        p_amount: verified.amount, p_currency_code: verified.currency,
      });
      return jsonResponse({ ok: result === true }, result === true ? 200 : 409);
    }
    if (verified.status === "FAILED") {
      const result = await callRpc(db, "fail_wallet_topup_from_gateway", {
        p_topup_id: topup.id, p_provider: provider, p_provider_transaction_id: reference,
      });
      return jsonResponse({ ok: result === true }, result === true ? 200 : 409);
    }
    return jsonResponse({ ok: true, status: "pending" }, 202);
  }

  const { data: withdrawal } = await db.from("user_withdrawals")
    .select("id,gateway_provider,gateway_reference,net_disbursement,currency_code,status")
    .eq("id", externalId).maybeSingle();
  if (!withdrawal || String(withdrawal.gateway_provider || "").toUpperCase() !== provider) {
    return jsonResponse({ ok: false, error: "payment_reference_not_found" }, 404);
  }
  if (
    withdrawal.gateway_reference &&
    !String(withdrawal.gateway_reference).startsWith("initiating:") &&
    withdrawal.gateway_reference !== reference
  ) {
    return jsonResponse({ ok: false, error: "withdrawal_reference_mismatch" }, 409);
  }
  if (!withdrawal.gateway_reference || String(withdrawal.gateway_reference).startsWith("initiating:")) {
    const recorded = await callRpc(db, "record_withdrawal_provider_reference", {
      p_withdrawal_id: withdrawal.id, p_gateway_provider: provider, p_gateway_reference: reference,
    });
    if (recorded !== true) return jsonResponse({ ok: false, error: "withdrawal_reference_mismatch" }, 409);
  }
  let verified: ProviderStatus;
  try { verified = await providerStatus(provider, creds, env, reference); }
  catch { return jsonResponse({ ok: false, error: "payout_status_unavailable" }, 503); }
  if (verified.amount !== Number(withdrawal.net_disbursement) || verified.currency !== String(withdrawal.currency_code).toUpperCase()) {
    return jsonResponse({ ok: false, error: "payout_amount_or_currency_mismatch" }, 409);
  }
  if (verified.status === "SUCCESSFUL" || verified.status === "FAILED") {
    const result = await callRpc(db, "finalize_withdrawal_from_gateway", {
      p_withdrawal_id: withdrawal.id, p_gateway_provider: provider,
      p_outcome: verified.status === "SUCCESSFUL" ? "completed" : "failed",
      p_gateway_reference: reference,
      p_failure_reason: verified.status === "FAILED" ? "Provider reported failed payout" : null,
    });
    return jsonResponse({ ok: result === true }, result === true ? 200 : 409);
  }
  return jsonResponse({ ok: true, status: "pending" }, 202);
}
