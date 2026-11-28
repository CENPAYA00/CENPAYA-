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
  if(path==="/internal/v1/countries/sync"&&method==="POST"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    const b=await body(request);
    if(!b)return fail("Valid JSON body required",400);
    const countryCode=str(b.country_code,2).toUpperCase();
    const name=str(b.name,100);
    const phonePrefix=str(b.phone_prefix,8);
    const currencyCode=str(b.currency_code,3).toUpperCase();
    const currencyValue=Number(b.currency_value_in_xaf);
    const flagEmoji=b.flag_emoji==null?null:str(b.flag_emoji,32);
    const regions=Array.isArray(b.regions)?b.regions:[];
    const methods=Array.isArray(b.enabled_methods)?b.enabled_methods:[];
    const active=b.is_active===true;
    if(!/^[A-Z]{2}$/.test(countryCode)||name.length<2||!(phonePrefix.startsWith("+") && /^[1-9][0-9]{0,6}$/.test(phonePrefix.slice(1)))||
       !/^[A-Z]{3}$/.test(currencyCode)||!Number.isFinite(currencyValue)||currencyValue<=0||
       regions.length>200||!regions.every(v=>typeof v==="string"&&v.trim().length<=100)||
       methods.length>10||!methods.every(v=>typeof v==="string"&&/^[a-z0-9_]{2,40}$/.test(v))||
       typeof b.is_active!=="boolean")return fail("Invalid country configuration",400);
    const status=active?"active":"coming_soon";
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO country_configuration_projection(country_code,name,phone_prefix,currency_code,currency_value_in_xaf,flag_emoji,regions_json,enabled_methods_json,status,config_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,"+NOW+") ON CONFLICT(country_code) DO UPDATE SET name=excluded.name,phone_prefix=excluded.phone_prefix,currency_code=excluded.currency_code,currency_value_in_xaf=excluded.currency_value_in_xaf,flag_emoji=excluded.flag_emoji,regions_json=excluded.regions_json,enabled_methods_json=excluded.enabled_methods_json,status=excluded.status,config_version=country_configuration_projection.config_version+1,updated_at="+NOW)
          .bind(countryCode,name,phonePrefix,currencyCode,currencyValue,flagEmoji,JSON.stringify(regions),JSON.stringify(methods),status),
        env.DB.prepare("INSERT INTO supported_countries(country_code,name,currency_code,phone_prefix,status) VALUES(?,?,?,?,?) ON CONFLICT(country_code) DO UPDATE SET name=excluded.name,currency_code=excluded.currency_code,phone_prefix=excluded.phone_prefix,status=excluded.status")
          .bind(countryCode,name,currencyCode,phonePrefix,status)
      ]);
      await env.CACHE?.delete("supported-countries");
      return json({success:true,data:{country_code:countryCode,status}});
    }catch(error){
      console.error("country_projection_sync_failed",error instanceof Error?error.message:"unknown");
      return fail("Country configuration projection unavailable. Apply D1 migration 0067 first.",503);
    }
  }
  if(path==="/internal/v1/staff/workspace/sync"&&method==="POST"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    const b=await body(request);
    const userId=str(b?.user_id,64),role=str(b?.role,32);
    if(!UUID.test(userId)||!["staff_member","support_agent","super_admin","user"].includes(role))return fail("Invalid staff workspace sync request",400);
    try{
      const exists=await env.DB.prepare("SELECT id FROM users WHERE id=? AND deleted_at IS NULL").bind(userId).first<{id:string}>();
      if(!exists)return fail("User not found",404);
      if(role==="staff_member"){
        await env.DB.prepare("INSERT INTO staff_workspace_members(user_id,workspace_role,is_active,updated_at) VALUES(?,'staff_member',1,"+NOW+") ON CONFLICT(user_id) DO UPDATE SET workspace_role='staff_member',is_active=1,updated_at="+NOW).bind(userId).run();
        await env.DB.prepare("UPDATE users SET role='user',updated_at="+NOW+" WHERE id=? AND role<>'owner'").bind(userId).run();
      }else{
        await env.DB.prepare("DELETE FROM staff_workspace_members WHERE user_id=?").bind(userId).run();
        const d1Role=role==="support_agent"?"support_agent":role==="super_admin"?"super_admin":"user";
        await env.DB.prepare("UPDATE users SET role=?,updated_at="+NOW+" WHERE id=? AND role<>'owner'").bind(d1Role,userId).run();
      }
      return json({success:true});
    }catch{return fail("Staff workspace projection unavailable. Apply D1 migration 0065 first.",503);}
  }
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
    if(!UUID.test(userId)||!["topup","withdrawal","marketplace_checkout","payment_status","boost"].includes(action))return fail("Invalid rate-limit request",400);
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
