import { createHmac, timingSafeEqual } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("FINANCIAL_ALLOWED_ORIGIN") ?? "https://cenpaya.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cenpaya-signature, x-cenpaya-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrderEvent = {
  event_id: string;
  event_type: "order.created" | "payment.confirmed" | "delivery.accepted" | "order.disputed" | "order.refunded" | "order.cancelled" | "order.completed";
  order_id: string;
  buyer_id: string;
  seller_id: string;
  listing_id?: string | null;
  order_type: "goods" | "freelance";
  financial_status: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(["order.created", "payment.confirmed", "delivery.accepted", "order.disputed", "order.refunded", "order.cancelled", "order.completed"]);

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function constantTimeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function verifyProviderSignature(raw: string, req: Request) {
  const secret = Deno.env.get("FINANCIAL_WEBHOOK_SECRET");
  const timestamp = req.headers.get("x-cenpaya-timestamp") ?? "";
  const supplied = (req.headers.get("x-cenpaya-signature") ?? "").replace(/^sha256=/, "");
  if (!secret || !timestamp || !/^[0-9]{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const epoch = Number(timestamp.length === 13 ? Number(timestamp) / 1000 : timestamp);
  if (!Number.isFinite(epoch) || Math.abs(Date.now() / 1000 - epoch) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return constantTimeEqual(expected, supplied);
}

function validEvent(value: unknown): value is OrderEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  return typeof e.event_id === "string" && e.event_id.length >= 12 && e.event_id.length <= 128
    && typeof e.event_type === "string" && EVENT_TYPES.has(e.event_type)
    && typeof e.order_id === "string" && e.order_id.length <= 128
    && typeof e.buyer_id === "string" && UUID.test(e.buyer_id)
    && typeof e.seller_id === "string" && UUID.test(e.seller_id) && e.buyer_id !== e.seller_id
    && (e.listing_id == null || typeof e.listing_id === "string")
    && (e.order_type === "goods" || e.order_type === "freelance")
    && typeof e.financial_status === "string" && /^[a-z_]{3,40}$/.test(e.financial_status);
}

async function forwardToD1(event: OrderEvent) {
  const endpoint = Deno.env.get("D1_WORKER_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("D1_INTERNAL_CALL_SECRET");
  if (!endpoint || !secret || secret.length < 32) throw new Error("D1 event bridge is not configured");
  const res = await fetch(`${endpoint}/internal/v1/marketplace/order-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CenPaya-Internal-Secret": secret },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`D1 event bridge returned ${res.status}`);
  return await res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return response({ success: false, error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  if (url.pathname.endsWith("/v1/internal/order-events")) {
    const raw = await req.text();
    if (raw.length > 64_000) return response({ success: false, error: "Payload too large" }, 413);
    if (!await verifyProviderSignature(raw, req)) return response({ success: false, error: "Invalid webhook signature" }, 401);
    let event: unknown;
    try { event = JSON.parse(raw); } catch { return response({ success: false, error: "Invalid JSON" }, 400); }
    if (!validEvent(event)) return response({ success: false, error: "Invalid financial event" }, 400);
    try {
      const result = await forwardToD1(event);
      return response({ success: true, data: result });
    } catch (error) {
      console.error("financial event forwarding failed", error);
      return response({ success: false, error: "Event forwarding failed; provider should retry" }, 503);
    }
  }

  return response({ success: false, error: "Not found" }, 404);
});
