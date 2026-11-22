import type { Env, User } from "./types.js";
import { cacheGet, cachePut } from "./security.js";
import { readUser, safeUser } from "./auth.js";
type RouteContext = { url: URL; path: string; method: string; user: User | null };
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const str=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
async function body(request:Request):Promise<Record<string,unknown>|null>{
  const type=request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if(type!=="application/json")return null;
  const length=Number(request.headers.get("Content-Length")||0);if(length>64_000)return null;
  try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>64_000)return null;const value:unknown=JSON.parse(raw);return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}
}

export async function handleProfileRoutes(request:Request,env:Env,context:RouteContext):Promise<Response|null>{
  const {url,path,method,user}=context;
  if(path==="/api/me"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    return json({success:true,user:safeUser(user)});
  }
  if(path==="/api/me/profile"&&method==="PATCH"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const allowed=["username","phone","display_name","bio","avatar_url","cover_url","country_code","preferred_language","location_city","location_region","occupation","profile_visibility"];
    const fields=allowed.filter(k=>Object.prototype.hasOwnProperty.call(b,k));
    if(!fields.length)return fail("No supported profile fields supplied");
    const values:(string|null)[]=[];
    const sets=fields.map(k=>{let v=b[k];if(typeof v!=="string"&&v!==null)return "";v=typeof v==="string"?v.trim().slice(0,k==="bio"?2000: k==="display_name"?100:255):null;values.push(v as string|null);return '"'+k+'"=?';});
    if(sets.some(x=>!x))return fail("Invalid profile field value");
    if(b.profile_visibility!==undefined&&!["public","private","followers"].includes(String(b.profile_visibility)))return fail("Invalid profile visibility");
    if(b.username!==undefined){
      const username=str(b.username,30).toLowerCase();
      if(!/^[a-z0-9_]{3,30}$/.test(username))return fail("Username must be 3-30 characters using letters, numbers, or underscores");
      const taken=await env.DB.prepare("SELECT 1 FROM users WHERE lower(username)=? AND id<>?").bind(username,user.id).first();
      if(taken)return fail("Username is already taken",409);
    }
    if(b.phone!==undefined&&b.phone!==null){
      const phone=str(b.phone,32);
      if(phone.length<7)return fail("A valid phone number is required");
      const taken=await env.DB.prepare("SELECT 1 FROM users WHERE phone=? AND id<>?").bind(phone,user.id).first();
      if(taken)return fail("Phone number is already in use",409);
    }
    values.push(user.id);
    const onboardingSet=b.onboarding_completed===true?",onboarding_completed=1":"";
    const phoneVerificationReset=fields.includes("phone")?",phone_verified=0,phone_verified_at=NULL":"";
    await env.DB.prepare("UPDATE users SET "+sets.join(",")+onboardingSet+phoneVerificationReset+",updated_at="+NOW+" WHERE id=?").bind(...values).run();
    const updated=await readUser(env.DB,user.id);return json({success:true,user:updated?safeUser(updated):null});
  }
  const publicProfile=path.match(/^\/api\/profiles\/([^/]+)$/);
  if(publicProfile&&publicProfile[1]!=="suggestions"&&method==="GET"){
    const key=decodeURIComponent(publicProfile[1]);
    const cached=await cacheGet(env,"public-profile:"+key.toLowerCase());
    if(cached)return json({success:true,data:cached,source:"cache"});
    const profile=await env.DB.prepare("SELECT id,username,display_name,avatar_url,cover_url,bio,country_code,location_city,is_premium,followers_count,sales_count,reputation_score,created_at FROM public_profiles WHERE id=? OR lower(username)=lower(?)").bind(key,key).first();
    if(profile)await cachePut(env,"public-profile:"+key.toLowerCase(),profile,300);
    return profile?json({success:true,data:profile}):fail("Profile not found",404);
  }
  if(path==="/api/profiles/suggestions"&&method==="GET"){
    const rows=await env.DB.prepare("SELECT id,username,avatar_url,occupation,location_city AS city FROM public_profiles ORDER BY created_at DESC LIMIT 12").all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/countries"&&method==="GET"){
    const cached=await cacheGet(env,"supported-countries");
    if(cached)return json({success:true,data:cached,source:"cache"});
    const rows=await env.DB.prepare("SELECT country_code,name,currency_code,phone_prefix,status FROM supported_countries WHERE status IN ('active','coming_soon') ORDER BY name").all();
    await cachePut(env,"supported-countries",rows.results,3600);
    return json({success:true,data:rows.results});
  }

  return null;
}
