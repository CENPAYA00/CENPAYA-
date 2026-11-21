import type { Env } from "./types.js";
import { constantTimeEqual, signD1IdentityAssertion } from "./security.js";
import { auth, rateLimit } from "./auth.js";
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(data:unknown,status=200,extraHeaders:HeadersInit={})=>{const headers=new Headers(extraHeaders);headers.set("Content-Type","application/json; charset=utf-8");headers.set("Cache-Control","no-store");return new Response(JSON.stringify(data),{status,headers});};
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const str=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
async function body(request:Request):Promise<Record<string,unknown>|null>{const type=request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();if(type!=="application/json")return null;const length=Number(request.headers.get("Content-Length")||0);if(length>64_000)return null;try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>64_000)return null;const value:unknown=JSON.parse(raw);return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}}

export async function handleInternalRoutes(request:Request,env:Env,url:URL,path:string,method:string):Promise<Response|null>{
  if(path==="/internal/v1/identity/assert"&&method==="POST"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    if(!env.D1_TO_SUPABASE_HMAC_SECRET||env.D1_TO_SUPABASE_HMAC_SECRET.length<32)return fail("Identity service unavailable",503);
    const identity=await auth(request,env);
    if(!identity)return fail("Unauthorized",401);
    try{
      const assertion=await signD1IdentityAssertion(identity.id,env.D1_TO_SUPABASE_HMAC_SECRET);
      return json({assertion},200);
    }catch{
      return fail("Identity service unavailable",503);
    }
  }
  if(path==="/internal/v1/identity/consume"&&method==="POST"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    const b=await body(request);
    const jti=str(b?.jti,200),expiresAt=b?.expires_at,now=Math.floor(Date.now()/1000);
    if(jti.length<16||!Number.isSafeInteger(expiresAt)||Number(expiresAt)<=now-15||Number(expiresAt)>now+135)return fail("Invalid assertion receipt",400);
    try{
      await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE 'identity:jti:%' AND window_start<?").bind(now-15).run();
      const inserted=await env.DB.prepare("INSERT OR IGNORE INTO rate_limits(key,window_start,count) VALUES(?,?,1)")
        .bind("identity:jti:"+jti,Number(expiresAt)).run();
      if(!inserted.meta.changes)return fail("Assertion already used",409);
      return json({success:true});
    }catch{
      return fail("Identity replay protection unavailable",503);
    }
  }
  if(path==="/internal/v1/rate-limit/consume"&&method==="POST"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    const b=await body(request);
    const userId=str(b?.user_id,64),action=str(b?.action,32);
    if(!UUID.test(userId)||!["topup","withdrawal","marketplace_checkout","payment_status"].includes(action))return fail("Invalid rate-limit request",400);
    try{
      const max=action==="topup"?5:action==="withdrawal"?3:action==="payment_status"?30:5;
      const allowed=await rateLimit(env,"financial:"+action+":"+userId,max,60);
      return json({success:true,allowed},allowed?200:429);
    }catch{
      return fail("Rate-limit service unavailable",503);
    }
  }
  if(path==="/internal/v1/admin/overview"&&method==="GET"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    try{
      const users=await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL AND banned=0").first<{total:number}>();
      const listings=await env.DB.prepare("SELECT COUNT(*) AS total FROM public_marketplace_search").first<{total:number}>();
      return json({success:true,data:{total_users:Number(users?.total||0),total_listings:Number(listings?.total||0)}});
    }catch{return fail("Overview unavailable",503);}
  }
  if(path==="/internal/v1/idempotency/consume"&&method==="POST"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    const b=await body(request);
    const userId=str(b?.user_id,64),key=str(b?.idempotency_key,128),scope=str(b?.scope,40);
    if(!UUID.test(userId)||key.length<16||!["marketplace_order","membership_payment"].includes(scope))return fail("Invalid idempotency request",400);
    try{
      const now=Math.floor(Date.now()/1000);
      await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE 'idem:%' AND window_start<?").bind(now-86400).run();
      const result=await env.DB.prepare("INSERT OR IGNORE INTO rate_limits(key,window_start,count) VALUES(?,?,1)").bind("idem:"+scope+":"+userId+":"+key,now).run();
      if(!result.meta.changes)return fail("Duplicate idempotency key",409);
      return json({success:true});
    }catch{return fail("Idempotency service unavailable",503);}
  }

  return null;
}
