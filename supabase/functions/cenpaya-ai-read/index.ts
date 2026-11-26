type ReadIntent = "wallet" | "transactions" | "marketplace_orders" | "service_orders" | "subscriptions" | "support_tickets" | "profile";
type Claims = { iss: string; aud: string; sub: string; iat: number; exp: number; jti: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENTS = new Set<ReadIntent>(["wallet", "transactions", "marketplace_orders", "service_orders", "subscriptions", "support_tickets", "profile"]);

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), c => c.charCodeAt(0));
}
function decodeJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const size = Math.max(a.length, b.length);
  for (let i = 0; i < size; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}
async function verifyIdentityAssertion(token: string): Promise<Claims | null> {
  const secret = Deno.env.get("D1_TO_SUPABASE_HMAC_SECRET") ?? "";
  if (secret.length < 32 || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodeJsonPart<{ alg?: string; typ?: string }>(parts[0]);
    const claims = decodeJsonPart<Claims>(parts[1]);
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== "cenpaya-d1-worker" || claims.aud !== "cenpaya-supabase-worker"
      || !UUID.test(claims.sub) || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
      || claims.iat > now + 15 || claims.exp <= now || claims.exp - claims.iat > 120
      || typeof claims.jti !== "string" || claims.jti.length < 16 || claims.jti.length > 200) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts[0] + "." + parts[1])));
    if (!equalBytes(expected, decodeBase64Url(parts[2]))) return null;
    return claims;
  } catch { return null; }
}
async function consumeAssertion(claims: Claims): Promise<boolean> {
  const workerUrl = (Deno.env.get("D1_WORKER_URL") ?? "").replace(/\/$/, "");
  const secret = Deno.env.get("D1_INTERNAL_CALL_SECRET") ?? "";
  if (!workerUrl || secret.length < 32) return false;
  try {
    const workerBase = new URL(workerUrl);
    if (workerBase.protocol !== "https:") return false;
    const result = await fetch(new URL("/internal/v1/identity/consume", workerBase).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CenPaya-Internal-Secret": secret },
      body: JSON.stringify({ jti: claims.jti, expires_at: claims.exp }),
      signal: AbortSignal.timeout(5000),
    });
    return result.ok;
  } catch { return false; }
}
function getSupabaseServerKey(): { key: string; isSecretKey: boolean } {
  const keysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson) as Record<string, unknown>;
      if (typeof keys.default === "string" && keys.default.startsWith("sb_secret_")) return { key: keys.default, isSecretKey: true };
    } catch { /* Fall back to the legacy server key if configured. */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return { key: legacy, isSecretKey: false };
}

async function selectRows(table: string, params: Record<string, string>, limit: number) {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serverKey = getSupabaseServerKey();
  if (!base || !serverKey.key || new URL(base).protocol !== "https:") throw new Error("Supabase read service is not configured");
  const query = new URLSearchParams({ select: params.select, ...params, limit: String(limit) });
  query.delete("select");
  const url = base + "/rest/v1/" + table + "?select=" + encodeURIComponent(params.select) + "&" + query.toString();
  const headers: Record<string, string> = { apikey: serverKey.key, Accept: "application/json" };
  // New sb_secret keys are sent only as apikey. Legacy service_role keys are JWTs.
  if (!serverKey.isSecretKey) headers.Authorization = "Bearer " + serverKey.key;
  const result = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(6000),
  });
  if (!result.ok) throw new Error("Supabase read query failed: " + result.status);
  const rows: unknown = await result.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected Supabase read response");
  return rows;
}

async function readUserData(userId: string, intent: ReadIntent): Promise<unknown> {
  const owner = "user_id=eq." + userId;
  switch (intent) {
    case "wallet": {
      const [wallets, balances] = await Promise.all([
        selectRows("wallets", { select: "available_funds,referral_pending_lock,referral_received_locked,referral_earnings_available,referral_bonus_pending,updated_at", [ "user_id" ]: owner }, 1),
        selectRows("user_balances", { select: "currency_code,available_funds,referral_earnings_available,referral_pending_lock,referral_received_locked", [ "user_id" ]: owner }, 20),
      ]);
      return { wallets, balances };
    }
    case "transactions": {
      const [payments, walletHistory] = await Promise.all([
        selectRows("transactional_ledger", { select: "flow_direction,gross_amount,system_fee_cut,net_amount,currency_code,status,created_at,operator_reference", [ "user_id" ]: owner, order: "created_at.desc" }, 20),
        selectRows("wallet_historical_ledger", { select: "currency_code,entry_type,amount_mutated,running_balance_snapshot,created_at,description", [ "user_id" ]: owner, order: "created_at.desc" }, 20),
      ]);
      return { transactions: payments, wallet_history: walletHistory };
    }
    case "marketplace_orders":
      return await selectRows("orders", { select: "id,amount,currency_code,escrow_status,order_status,order_type,created_at,updated_at,estimated_delivery_at,delivery_method,tracking_number,buyer_confirmed_received,seller_confirmed_delivered", or: "(buyer_id.eq." + userId + ",seller_id.eq." + userId + ")", order: "created_at.desc" }, 20);
    case "service_orders":
      return await selectRows("service_orders", { select: "id,amount,currency_code,escrow_status,created_at,updated_at,confirmed_delivery_at,delivered_at,buyer_confirmed_received,revision_count", or: "(buyer_id.eq." + userId + ",seller_id.eq." + userId + ")", order: "created_at.desc" }, 20);
    case "subscriptions": {
      const [memberships, payments] = await Promise.all([
        selectRows("user_memberships", { select: "tier,status,starts_at,expires_at,created_at", [ "user_id" ]: owner, order: "created_at.desc" }, 10),
        selectRows("subscription_payments", { select: "amount,currency_code,status,created_at", [ "user_id" ]: owner, order: "created_at.desc" }, 10),
      ]);
      return { memberships, subscription_payments: payments };
    }
    case "support_tickets": {
      const tickets = await selectRows("platform_tickets", { select: "id,subject,status,created_at,updated_at,associated_order_id", [ "user_id" ]: owner, order: "created_at.desc" }, 10);
      const ids = tickets.map((row: any) => row?.id).filter((id: unknown) => typeof id === "string" && UUID.test(id));
      if (!ids.length) return { tickets, messages: [] };
      const messages = await selectRows("ticket_messages", { select: "ticket_id,sender_role,body,created_at", ticket_id: "in.(" + ids.join(",") + ")", order: "created_at.asc" }, 40);
      return { tickets, messages };
    }
    case "profile":
      return await selectRows("users", { select: "username,is_subscribed,role,is_email_verified,is_phone_verified,country_iso,preferred_lang,created_at,moderation_state", id: "eq." + userId }, 1);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return response({ success: false, error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const claims = await verifyIdentityAssertion(token);
  if (!claims) return response({ success: false, error: "Unauthorized" }, 401);
  if (!await consumeAssertion(claims)) return response({ success: false, error: "Identity assertion expired, replayed, or unavailable" }, 401);

  const contentType = req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return response({ success: false, error: "JSON body required" }, 415);
  let body: unknown;
  try {
    const declaredLength = Number(req.headers.get("Content-Length") ?? 0);
    if (declaredLength > 2048) return response({ success: false, error: "Payload too large" }, 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) return response({ success: false, error: "Payload too large" }, 413);
    body = JSON.parse(raw);
  } catch { return response({ success: false, error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response({ success: false, error: "Invalid request" }, 400);
  const requestBody = body as Record<string, unknown>;
  if (Object.keys(requestBody).some(key => key !== "intent") || typeof requestBody.intent !== "string" || !INTENTS.has(requestBody.intent as ReadIntent)) {
    return response({ success: false, error: "Unsupported read request" }, 400);
  }
  try {
    const data = await readUserData(claims.sub, requestBody.intent as ReadIntent);
    return response({ success: true, data: { intent: requestBody.intent, records: data } });
  } catch (error) {
    console.error("CenPaya AI read-only Supabase query failed", error instanceof Error ? error.message : "unknown");
    return response({ success: false, error: "Requested account information is temporarily unavailable" }, 503);
  }
});
