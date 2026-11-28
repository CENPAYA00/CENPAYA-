import type { Env, User } from "./types.js";

export type AiIndicatorResult = {
  status: "completed" | "unavailable";
  classification: "possible_ai_generated" | "possible_ai_assisted" | "no_clear_signal" | "inconclusive";
  confidence: number | null;
  reason: string;
  model: string | null;
};

const MODEL = "gemini-2.5-flash";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const fail = (message: string, status = 400) => json({ success: false, error: message }, status);

function unavailable(reason = "AI analysis is temporarily unavailable"): AiIndicatorResult {
  return { status: "unavailable", classification: "inconclusive", confidence: null, reason, model: null };
}

function parseModelResult(payload: unknown): Omit<AiIndicatorResult, "status" | "model"> | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") return null;
  const content = (candidates[0] as Record<string, unknown>).content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts.map(part => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string"
    ? (part as Record<string, unknown>).text as string : "").join("").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const allowed = ["possible_ai_generated", "possible_ai_assisted", "no_clear_signal", "inconclusive"];
    if (typeof parsed.classification !== "string" || !allowed.includes(parsed.classification)) return null;
    const confidence = typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence)) : null;
    return {
      classification: parsed.classification as AiIndicatorResult["classification"],
      confidence,
      reason: typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 500) : "No reliable explanation was returned.",
    };
  } catch { return null; }
}

/**
 * Gemini provides probabilistic content-style signals, not forensic proof of AI authorship.
 * Only public listing title/description text is sent; analysis failure never blocks publication.
 */
export async function analyzeListingText(env: Env, title: string, description: string, listingType: "product" | "service"): Promise<AiIndicatorResult> {
  if (!env.GEMINI_API_KEY) return unavailable("AI analysis is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text:
          "Assess whether this public marketplace listing text contains signals of AI-generated or AI-assisted writing. This is an uncertain style assessment, not proof of authorship. Do not infer AI use merely from polished writing, grammar, sales language, language proficiency, or the writer's likely background. If evidence is weak or ambiguous, choose no_clear_signal or inconclusive. Return only JSON matching the schema.\n" +
          "Listing type: " + listingType + "\nTitle: " + title.slice(0, 160) + "\nDescription: " + description.slice(0, 5000)
        }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              classification: { type: "STRING", enum: ["possible_ai_generated", "possible_ai_assisted", "no_clear_signal", "inconclusive"] },
              confidence: { type: "NUMBER" },
              reason: { type: "STRING" },
            },
            required: ["classification", "confidence", "reason"],
          },
        },
      }),
    });
    if (!response.ok) {
      console.warn("Gemini AI Indicator request failed", response.status);
      return unavailable();
    }
    const parsed = parseModelResult(await response.json());
    if (!parsed) return unavailable("Gemini returned an unreadable analysis");
    return { status: "completed", ...parsed, model: MODEL };
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Analyze seller-uploaded listing images through Gemini. Only images already validated
 * as owned listing media are sent. Large/unsupported files are skipped safely.
 */
export async function analyzeListingImages(env: Env, imageKeys: string[]): Promise<{status:"completed"|"unavailable"; classification:"possible_ai_generated"|"no_clear_signal"|"inconclusive"; confidence:number|null; reason:string; model:string|null}> {
  if (!env.GEMINI_API_KEY) return {status:"unavailable",classification:"inconclusive",confidence:null,reason:"AI image analysis is not configured",model:null};
  if (!env.MEDIA_BUCKET || imageKeys.length === 0) return {status:"unavailable",classification:"inconclusive",confidence:null,reason:"No listing images are available for analysis",model:null};
  const parts: Array<Record<string, unknown>> = [{text:"Assess whether these public product/service listing images show visual signals of AI-generated or synthetically altered imagery. Do not claim certainty or infer authorship from polish alone. If uncertain, return inconclusive. Return only JSON with classification (possible_ai_generated, no_clear_signal, inconclusive), confidence from 0 to 1, and a short reason."}];
  for (const key of imageKeys.slice(0,4)) {
    try {
      const object = await env.MEDIA_BUCKET.get(key);
      if (!object || object.size > 4 * 1024 * 1024) continue;
      const mime = object.httpMetadata?.contentType || "application/octet-stream";
      if (!["image/jpeg","image/png","image/webp"].includes(mime)) continue;
      const bytes = new Uint8Array(await object.arrayBuffer());
      let binary = "";
      for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
      parts.push({inlineData:{mimeType:mime,data:btoa(binary)}});
    } catch { /* A single inaccessible image must not block the listing. */ }
  }
  if (parts.length===1) return {status:"unavailable",classification:"inconclusive",confidence:null,reason:"No supported images were available for analysis",model:null};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),9000);
  try {
    const response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},signal:controller.signal,body:JSON.stringify({
      contents:[{role:"user",parts}],
      generationConfig:{temperature:0,responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{classification:{type:"STRING",enum:["possible_ai_generated","no_clear_signal","inconclusive"]},confidence:{type:"NUMBER"},reason:{type:"STRING"}},required:["classification","confidence","reason"]}}
    })});
    if(!response.ok)return {status:"unavailable",classification:"inconclusive",confidence:null,reason:"AI image analysis is temporarily unavailable",model:null};
    const raw=await response.json() as Record<string,unknown>;
    const parsed=parseModelResult(raw);
    if(!parsed)return {status:"unavailable",classification:"inconclusive",confidence:null,reason:"Image analysis returned an unreadable result",model:null};
    return {status:"completed",classification:parsed.classification==="possible_ai_generated"?"possible_ai_generated":parsed.classification==="no_clear_signal"?"no_clear_signal":"inconclusive",confidence:parsed.confidence,reason:parsed.reason,model:MODEL};
  } catch { return {status:"unavailable",classification:"inconclusive",confidence:null,reason:"AI image analysis is temporarily unavailable",model:null}; }
  finally {clearTimeout(timeout);}
}

export async function handleAiIndicatorRoutes(
  request: Request, env: Env, path: string, method: string, user: User | null,
): Promise<Response | null> {
  const match = path.match(/^\/api\/market\/listings\/([^/]+)\/ai-indicator$/);
  if (!match) return null;
  if (method !== "GET") return fail("Method not allowed", 405);
  const listingId = decodeURIComponent(match[1]);
  const listing = await env.DB.prepare(
    "SELECT id,seller_id,status,moderation_status FROM marketplace_listings WHERE id=? AND deleted_at IS NULL"
  ).bind(listingId).first<{ id: string; seller_id: string; status: string; moderation_status: string }>();
  if (!listing || (listing.status !== "active" && listing.seller_id !== user?.id)) return fail("Listing not found", 404);
  try {
    const result = await env.DB.prepare(
      "SELECT status,classification,confidence,reason,model,media_status,media_classification,media_confidence,media_reason,updated_at FROM ai_indicator_results WHERE listing_id=?"
    ).bind(listingId).first<Record<string, unknown>>();
    return json({ success: true, data: result || unavailable("No AI analysis is available for this listing yet") });
  } catch {
    return json({ success: true, data: unavailable("AI Indicator results are not yet available") });
  }
}
