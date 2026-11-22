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
  if(path==="/api/app-settings/video_posts_enabled"&&method==="GET"){
    const setting=await env.DB.prepare("SELECT value_json FROM app_settings WHERE key='video_posts_enabled'").first<{value_json:string}>();
    let value="false";
    if(setting){
      try{value=String(JSON.parse(setting.value_json));}
      catch{value=String(setting.value_json);}
    }
    return json({value});
  }
  if(path==="/api/profiles/search"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const q=str(url.searchParams.get("q"),60).replace(/[%_]/g,"").trim();
    if(q.length<2)return json({success:true,data:[]});
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20),1),30);
    const rows=await env.DB.prepare("SELECT id,username,display_name,avatar_url FROM users WHERE account_status='active' AND banned=0 AND deleted_at IS NULL AND (lower(username) LIKE lower(?) OR lower(display_name) LIKE lower(?)) ORDER BY followers_count DESC,created_at DESC LIMIT ?")
      .bind("%"+q+"%","%"+q+"%",limit).all();
    return json({success:true,data:rows.results});
  }
  const publicProfile=path.match(/^\/api\/profiles\/([^/]+)$/);
  if(publicProfile&&publicProfile[1]!=="suggestions"&&method==="GET"){
    const key=decodeURIComponent(publicProfile[1]);
    const profile=await env.DB.prepare("SELECT id,username,display_name,avatar_url,cover_url,bio,phone,email,country_code,location_city,location_region,occupation,is_premium,followers_count,sales_count,reputation_score,created_at,profile_visibility FROM users WHERE (id=? OR lower(username)=lower(?)) AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(key,key).first<Record<string,unknown>>();
    if(!profile)return fail("Profile not found",404);
    const ownerId=String(profile.id),viewerId=user?.id||null;
    let isFollower=false;
    if(viewerId!==ownerId){
      const blocked=await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(ownerId,viewerId||"",viewerId||"",ownerId).first();
      if(blocked)return fail("Profile not found",404);
      const follows=viewerId?await env.DB.prepare("SELECT 1 FROM user_follows WHERE follower_id=? AND following_id=?").bind(viewerId,ownerId).first():null;
      isFollower=!!follows;
      if(profile.profile_visibility==="private"||(profile.profile_visibility==="followers"&&!isFollower))return fail("Profile not found",404);
    }
    const visibility=await env.DB.prepare("SELECT bio,phone,email,joined,occupation,location FROM user_profile_details_visibility WHERE user_id=?").bind(ownerId).first<Record<string,string>>();
    const defaults={bio:"public",phone:"followers",email:"private",joined:"public",occupation:"public",location:"followers"};
    const rules={...defaults,...(visibility||{})};
    const canSee=(rule:string)=>viewerId===ownerId||rule==="public"||(rule==="followers"&&isFollower);
    const data={...profile,
      bio:canSee(rules.bio)?profile.bio:null,
      phone:canSee(rules.phone)?profile.phone:null,
      email:canSee(rules.email)?profile.email:null,
      occupation:canSee(rules.occupation)?profile.occupation:null,
      country_code:canSee(rules.location)?profile.country_code:null,
      location_city:canSee(rules.location)?profile.location_city:null,
      location_region:canSee(rules.location)?profile.location_region:null,
      created_at:canSee(rules.joined)?profile.created_at:null
    };
    delete (data as Record<string,unknown>).profile_visibility;
    return json({success:true,data});
  }
  if(path==="/api/profiles/suggestions"&&method==="GET"){
    const rows=await env.DB.prepare("SELECT id,username,avatar_url FROM public_profiles ORDER BY created_at DESC LIMIT 12").all();
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
