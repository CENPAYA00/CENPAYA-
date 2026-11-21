import type { Env, User } from "./types.js";
import { uuid, constantTimeEqual, signD1IdentityAssertion, cacheGet, cachePut } from "./security.js";
import { digest, passwordHash, verifyPassword } from "./security.js";
import { handleGoogleOAuth } from "./oauth.js";
import { rateLimit, readUser, auth, sendOtp, verifyOtp, safeUser } from "./auth.js";
import { createSession } from "./sessions.js";
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200, extraHeaders: HeadersInit = {}) => {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
};
const fail = (message: string, status = 400) => json({success:false,error:message},status);
const allowedOrigins = (env: Env) => (env.ALLOWED_ORIGINS || "").split(",").map(x=>x.trim()).filter(Boolean);
function cors(request: Request, env: Env): Response | null {
  const origin=request.headers.get("Origin");
  if (origin && !allowedOrigins(env).includes(origin)) return fail("Origin not allowed",403);
  if (request.method==="OPTIONS") {
    if (!origin || !allowedOrigins(env).includes(origin)) return fail("Origin not allowed",403);
    return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type,Authorization","Access-Control-Allow-Credentials":"true","Access-Control-Max-Age":"86400","Vary":"Origin"
    }});
  }
  return null;
}
function withCors(response: Response, request: Request, env: Env): Response {
  const origin=request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).includes(origin)) return response;
  const h=new Headers(response.headers); h.set("Access-Control-Allow-Origin",origin); h.set("Access-Control-Allow-Credentials","true"); h.set("Vary","Origin");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
function sessionCookie(token:string,env:Env){const ttl=Math.max(300,Math.min(2592000,Number(env.SESSION_TTL_SECONDS||2592000)));return `cenpaya_session=${encodeURIComponent(token)}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=None`;}
function clearSessionCookie(){return "cenpaya_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None";}
function sessionJson(data:unknown,token:string,env:Env,status=200){return json(data,status,{"Set-Cookie":sessionCookie(token,env)});}
function requestSessionToken(request:Request){const bearer=(request.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];const cookie=(request.headers.get("Cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("cenpaya_session="))?.slice("cenpaya_session=".length);return (cookie?decodeURIComponent(cookie):"")||bearer||"";}
async function body(request: Request): Promise<Record<string,unknown>|null> {
  const type=request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if(type!=="application/json") return null;
  const length=Number(request.headers.get("Content-Length")||0);
  if(length>64_000) return null;
  try {
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>64_000)return null;
    const value: unknown=JSON.parse(raw);
    return value && typeof value==="object" && !Array.isArray(value) ? value as Record<string,unknown> : null;
  } catch { return null; }
}
const str=(v:unknown,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
async function handle(request:Request,env:Env):Promise<Response>{
  const pre=cors(request,env); if(pre)return pre;
  const url=new URL(request.url), path=url.pathname.replace(/\/$/,"")||"/", method=request.method.toUpperCase();
  const oauthResponse = await handleGoogleOAuth(request,env,url,path,method);
  if(oauthResponse)return oauthResponse;
  if(path==="/health"&&method==="GET"){
    try{await env.DB.prepare("SELECT 1").first();return json({success:true,service:"cenpaya-d1-worker",database:"connected"});}
    catch{return fail("D1 unavailable",503);}
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
    if(!UUID.test(userId)||!["topup","withdrawal","marketplace_checkout"].includes(action))return fail("Invalid rate-limit request",400);
    try{
      const max=action==="topup"?5:action==="withdrawal"?3:5;
      const allowed=await rateLimit(env,"financial:"+action+":"+userId,max,60);
      return json({success:true,allowed},allowed?200:429);
    }catch{
      return fail("Rate-limit service unavailable",503);
    }
  }
  if(path==="/api/auth/register"&&method==="POST"){
    const b=await body(request); if(!b)return fail("Valid JSON body required");
    const username=str(b.username,30).toLowerCase(),display=str(b.display_name,100),email=str(b.email,254).toLowerCase()||null,phone=str(b.phone,32)||null,password=str(b.password,128);
    const gender=str(b.gender,30),dob=str(b.date_of_birth,10),preferredLanguage=str(b.preferred_lang,5)||"en";
    if(!/^[a-z0-9_]{3,30}$/.test(username)||!display||password.length<12||(!email&&!phone))return fail("Valid username, display name, email or phone, and password (12+ characters) required");
    if(!["male","female","other","prefer_not_to_say"].includes(gender)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dob)||!["en","fr"].includes(preferredLanguage)||b.terms_accepted!==true)return fail("Valid date of birth, gender, language, and acceptance of the terms are required");
    const birth=new Date(dob+"T00:00:00.000Z");
    if(Number.isNaN(birth.getTime())||birth.toISOString().slice(0,10)!==dob)return fail("Invalid date of birth");
    const today=new Date();
    let age=today.getUTCFullYear()-birth.getUTCFullYear();
    if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate()))age--;
    if(age<13||age>120)return fail("You must be at least 13 years old and enter a valid date of birth");
    if(email&&!/^[^ @]+@[^ @]+[.][^ @]+$/.test(email))return fail("Invalid email address");
    if(!await rateLimit(env,"register:"+await digest(email||phone||username),5,3600))return fail("Too many registration attempts",429);
    const duplicate=await env.DB.prepare("SELECT id FROM users WHERE lower(username)=? OR (? IS NOT NULL AND lower(email)=?) OR (? IS NOT NULL AND phone=?)").bind(username,email,email,phone,phone).first();
    if(duplicate)return fail("Account details already in use",409);
    const id=uuid(),hash=await passwordHash(password);
    await env.DB.prepare("INSERT INTO users(id,username,display_name,email,phone,password_hash,gender,date_of_birth,preferred_language,terms_accepted_at) VALUES(?,?,?,?,?,?,?,?,?,"+NOW+")")
      .bind(id,username,display,email,phone,hash,gender,dob,preferredLanguage).run();
    const channel=email?"email":"sms",purpose=email?"verify_email":"verify_phone";
    let delivered=false;
    try{delivered=await sendOtp(env,env.DB,id,channel,email||phone!,purpose);}catch{delivered=false;}
    if(!delivered)return json({success:true,user_id:id,verification_required:true,channel,delivery_pending:true},202);
    return json({success:true,user_id:id,verification_required:true,channel},201);
  }
  if(path==="/api/auth/otp/resend"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const identifier=str(b.identifier,254).toLowerCase(),purpose=str(b.purpose,20);
    if(!identifier||!["verify_email","verify_phone"].includes(purpose))return fail("Identifier and valid verification purpose required");
    if(!await rateLimit(env,"otp-resend:"+await digest(identifier+":"+purpose),3,600))return fail("Too many OTP requests",429);
    const account=await env.DB.prepare("SELECT id,email,phone,email_verified,phone_verified FROM users WHERE (lower(email)=? OR lower(username)=? OR phone=?) AND deleted_at IS NULL AND banned=0").bind(identifier,identifier,identifier).first<{id:string;email:string|null;phone:string|null;email_verified:number;phone_verified:number}>();
    if(account){
      const emailPurpose=purpose==="verify_email"&&!account.email_verified&&!!account.email;
      const phonePurpose=purpose==="verify_phone"&&!account.phone_verified&&!!account.phone;
      if(emailPurpose||phonePurpose){
        const channel=emailPurpose?"email":"sms",destination=emailPurpose?account.email!:account.phone!;
        try{await sendOtp(env,env.DB,account.id,channel,destination,purpose as "verify_email"|"verify_phone");}catch{}
      }
    }
    return json({success:true,message:"If verification is still required, a new code has been requested."});
  }
  if(path==="/api/auth/verify"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const userId=str(b.user_id,64),code=str(b.code,6),purpose=str(b.purpose,20);
    if(!UUID.test(userId)||!/^\d{6}$/.test(code)||!["verify_email","verify_phone"].includes(purpose))return fail("Invalid verification request");
    if(!await rateLimit(env,"verify:"+userId,10,600))return fail("Too many verification attempts",429);
    if(!await verifyOtp(env,env.DB,userId,purpose as "verify_email"|"verify_phone",code))return fail("Invalid or expired verification code",400);
    const user=await readUser(env.DB,userId);if(!user)return fail("Account not found",404);
    const token=await createSession(env.DB,userId,request,env);
    return sessionJson({success:true,user:safeUser(user)},token,env);
  }
  if(path==="/api/auth/password/request"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const identifier=str(b.identifier,254).toLowerCase();
    if(!identifier)return fail("Identifier required");
    if(!await rateLimit(env,"password-reset:"+await digest(identifier),4,3600))return fail("Too many reset attempts",429);
    const account=await env.DB.prepare("SELECT id,email,phone,email_verified,phone_verified FROM users WHERE (lower(email)=? OR lower(username)=? OR phone=?) AND deleted_at IS NULL AND banned=0").bind(identifier,identifier,identifier).first<{id:string;email:string|null;phone:string|null;email_verified:number;phone_verified:number}>();
    if(account){
      const channel=account.email_verified&&account.email?"email":account.phone_verified&&account.phone?"sms":null;
      const destination=channel==="email"?account.email:channel==="sms"?account.phone:null;
      if(channel&&destination){try{await sendOtp(env,env.DB,account.id,channel,destination,"password_reset");}catch{}}
    }
    return json({success:true,message:"If the account is eligible, a password reset code has been sent."});
  }
  if(path==="/api/auth/password/reset"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const identifier=str(b.identifier,254).toLowerCase(),requestedUserId=str(b.user_id,64),code=str(b.code,6),password=str(b.new_password,128);
    if((!identifier&&!UUID.test(requestedUserId))||!/^[0-9]{6}$/.test(code)||password.length<12)return fail("Email/username, six-digit code, and new password (12+ characters) required");
    const account=identifier
      ? await env.DB.prepare("SELECT id FROM users WHERE (lower(email)=? OR lower(username)=? OR phone=?) AND deleted_at IS NULL AND banned=0").bind(identifier,identifier,identifier).first<{id:string}>()
      : await env.DB.prepare("SELECT id FROM users WHERE id=? AND deleted_at IS NULL AND banned=0").bind(requestedUserId).first<{id:string}>();
    if(!account)return fail("Invalid or expired reset code",400);
    const userId=account.id;
    if(!await rateLimit(env,"password-reset-verify:"+userId,8,900))return fail("Too many reset attempts",429);
    if(!await verifyOtp(env,env.DB,userId,"password_reset",code))return fail("Invalid or expired reset code",400);
    const hash=await passwordHash(password);
    await env.DB.prepare("UPDATE users SET password_hash=?,password_updated_at="+NOW+",updated_at="+NOW+" WHERE id=? AND deleted_at IS NULL").bind(hash,userId).run();
    await env.DB.prepare("UPDATE user_sessions SET status='revoked',revoked_at="+NOW+" WHERE user_id=? AND status='active'").bind(userId).run();
    const token=await createSession(env.DB,userId,request,env);
    const updated=await readUser(env.DB,userId);
    return sessionJson({success:true,user:updated?safeUser(updated):null},token,env);
  }
  if(path==="/api/auth/login"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const identifier=str(b.identifier,254).toLowerCase(),password=str(b.password,128);
    if(!identifier||!password)return fail("Identifier and password required");
    if(!await rateLimit(env,"login:"+await digest(identifier),8,900))return fail("Too many sign-in attempts",429);
    const user=await env.DB.prepare("SELECT id,username,display_name,email,phone,email_verified,phone_verified,role,account_status,banned,password_hash FROM users WHERE (lower(email)=? OR lower(username)=? OR phone=?) AND deleted_at IS NULL").bind(identifier,identifier,identifier).first<User>();
    if(!user||!user.password_hash||!(await verifyPassword(password,user.password_hash)))return fail("Invalid credentials",401);
    if(user.banned||user.account_status!=="active")return fail("Account is unavailable",403);
    if(!(user.email_verified||user.phone_verified))return fail("Verify your email address or phone number before signing in",403);
    const token=await createSession(env.DB,user.id,request,env);
    return sessionJson({success:true,user:safeUser(user)},token,env);
  }
  if(path==="/api/auth/logout"&&method==="POST"){
    const token=requestSessionToken(request);
    if(token)await env.DB.prepare("UPDATE user_sessions SET status='revoked',revoked_at="+NOW+" WHERE session_token_hash=?").bind(await digest(token)).run();
    return json({success:true},200,{"Set-Cookie":clearSessionCookie()});
  }
  if(path==="/api/auth/refresh"&&method==="POST"){
    const user=await auth(request,env);
    const refreshToken=(request.headers.get("Cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("cenpaya_session="))?.slice("cenpaya_session=".length);
    if(!user||!refreshToken)return fail("Unauthorized",401);
    const accessToken=await createSession(env.DB,user.id,request,env,900);
    return json({success:true,token:accessToken,expires_in:900,user:safeUser(user)});
  }
  const user=await auth(request,env);
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
    await env.DB.prepare("UPDATE users SET "+sets.join(",")+onboardingSet+",updated_at="+NOW+" WHERE id=?").bind(...values).run();
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
  const internalListingQuote=path.match(/^\/internal\/v1\/market\/listings\/([^/]+)\/quote$/);
  if(internalListingQuote&&method==="GET"){
    const configuredSecret=env.D1_INTERNAL_CALL_SECRET||"";
    const suppliedSecret=request.headers.get("X-CenPaya-Internal-Secret")||"";
    if(!configuredSecret||!constantTimeEqual(suppliedSecret,configuredSecret))return fail("Unauthorized",401);
    const row=await env.DB.prepare("SELECT * FROM public_marketplace_search WHERE listing_id=?").bind(decodeURIComponent(internalListingQuote[1])).first<Record<string,unknown>>();
    if(!row)return fail("Listing not found",404);
    const data={...row,listing_id:row.listing_id||row.id,id:row.listing_id||row.id,title:row.product_title||row.title,price:row.product_price??row.price_amount??row.price,seller_id:row.seller_id||row.merchant_id,images:row.images||(row.image_url?[row.image_url]:[]),currency_code:row.currency_code||row.currency||"XAF"};
    return json({success:true,data});
  }
  const publicListing=path.match(/^\/api\/market\/listings\/([^/]+)$/);
  if(publicListing&&method==="GET"){
    const row=await env.DB.prepare("SELECT * FROM public_marketplace_search WHERE listing_id=?").bind(publicListing[1]).first<Record<string,unknown>>();
    if(!row)return fail("Listing not found",404);
    const data={...row,listing_id:row.listing_id||row.id,id:row.listing_id||row.id,title:row.product_title||row.title,price:row.product_price??row.price_amount??row.price,seller_id:row.seller_id||row.merchant_id,images:row.images||(row.image_url?[row.image_url]:[])};
    return json({success:true,data});
  }
  if(path==="/api/feed"&&method==="GET"){
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20),1),50),before=url.searchParams.get("before");
    const rows=await env.DB.prepare(`SELECT p.id,p.author_id,p.content,p.post_type,p.visibility,p.published_at,p.created_at,
      u.username,u.display_name,u.avatar_url FROM posts p JOIN users u ON u.id=p.author_id
      WHERE p.status='published' AND p.deleted_at IS NULL AND p.visibility='public'
      AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
      ${before?"AND p.created_at < ?":""} ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT ?`)
      .bind(...(before?[before]:[]),limit).all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/posts"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const content=str(b.content,10000),visibility=str(b.visibility,20)||"public",postType=str(b.post_type,30)||"text";
    if(!content||!["public","followers","friends","private"].includes(visibility)||!["text","image","video","mixed"].includes(postType))return fail("Invalid post content or type");
    const id=uuid();
    await env.DB.prepare("INSERT INTO posts(id,author_id,content,post_type,visibility,status,published_at) VALUES(?,?,?,?,?,'published',"+NOW+")").bind(id,user.id,content,postType,visibility).run();
    return json({success:true,id},201);
  }
  if(path==="/api/market/categories"&&method==="GET"){
    const rows=await env.DB.prepare("SELECT id,parent_id,name,slug,description,category_type,position,icon,section FROM marketplace_categories WHERE status='active' ORDER BY position,name").all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/search"&&method==="GET"){
    const q=str(url.searchParams.get("q"),200),kind=str(url.searchParams.get("type"),20)||"all";
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||30),1),50);
    if(!q)return json({success:true,data:[]});
    if(!env.AI||!env.AI_SEARCH_NAME)return fail("Cloudflare AI Search is not configured on this Worker",503);
    const cacheKey="search:"+await digest(kind+":"+q.toLowerCase()+":"+limit);
    const cached=await cacheGet(env,cacheKey);
    if(cached)return json({success:true,data:cached,source:"cache"});
    const index=env.AI.autorag(env.AI_SEARCH_NAME);
    const raw=await index.search({query:q,rewrite_query:true,max_num_results:limit});
    type SearchHit = {
      id: string; kind: string; title: string; subtitle: string; cover: string | null;
      meta: string; is_demo: boolean; score: unknown; snippet: string;
    };
    const asRecord=(value:unknown):Record<string,unknown> =>
      value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
    const firstString=(...values:unknown[]):string=>{
      const value=values.find(item=>typeof item==="string"&&item.length>0);
      return typeof value==="string"?value:"";
    };
    const root=asRecord(raw),hits=asRecord(root.hits);
    const rawResults=Array.isArray(root.data)?root.data:Array.isArray(root.results)?root.results:Array.isArray(hits.hits)?hits.hits:[];
    const normalized:SearchHit[]=rawResults.map((rawItem:unknown)=>{
      const item=asRecord(rawItem);
      const metadata=asRecord(item.metadata??item.attributes??item.meta??item._source);
      const content=firstString(item.content,item.text,item.snippet,metadata.content);
      const rawKind=firstString(metadata.kind,metadata.entity_type,metadata.type,"post").toLowerCase();
      const entityKind=rawKind.includes("listing")?"listing":rawKind.includes("service")?"service":rawKind.includes("post")?"post":rawKind;
      const cover=firstString(metadata.cover_url,metadata.image_url,metadata.thumbnail_url)||null;
      return {
        id:firstString(metadata.id,metadata.entity_id,item.id,item._id),
        kind:entityKind,
        title:firstString(metadata.title,metadata.name,content.slice(0,100),"Search result"),
        subtitle:firstString(metadata.subtitle,metadata.username,metadata.location),
        cover,meta:firstString(metadata.meta),is_demo:metadata.is_demo===true||metadata.is_demo===1,
        score:item.score??item._score??null,snippet:content.slice(0,320),
      };
    }).filter((item)=>item.id.length>0&&(kind==="all"||item.kind===kind||
      (kind==="market"&&item.kind==="listing")||(kind==="services"&&item.kind==="service")||
      (kind==="home"&&item.kind==="post")));
    const ids=[...new Set(normalized.map((item)=>item.id))].slice(0,limit);
    if(!ids.length)return json({success:true,data:[],source:"ai-search"});
    const placeholders=ids.map(()=>"?").join(",");
    let verified:SearchHit[]=[];
    const hitMap=new Map(normalized.map((item)=>[item.id,item]));
    if(kind==="post"||kind==="home"){
      const rows=await env.DB.prepare(`SELECT p.id,p.content,p.post_type,p.created_at,p.author_id,u.username,u.display_name,u.avatar_url
        FROM posts p JOIN users u ON u.id=p.author_id
        WHERE p.id IN (${placeholders}) AND p.status='published' AND p.deleted_at IS NULL AND p.visibility='public'
        AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL`).bind(...ids).all();
      verified=(rows.results as Array<Record<string,unknown>>).map((row)=>{
        const hit=hitMap.get(String(row.id));
        const content=firstString(row.content,hit?.title,"Post");
        return {id:String(row.id),kind:"post",title:content.slice(0,100),
          subtitle:firstString(row.username? "@"+String(row.username):"",hit?.subtitle),
          cover:hit?.cover??null,meta:row.created_at?new Date(String(row.created_at)).toLocaleDateString():"",
          is_demo:hit?.is_demo??false,score:hit?.score??null,snippet:hit?.snippet??""};
      });
    }else{
      const rows=await env.DB.prepare(`SELECT * FROM public_marketplace_search WHERE listing_id IN (${placeholders})`).bind(...ids).all();
      verified=(rows.results as Array<Record<string,unknown>>).map((row)=>{
        const hit=hitMap.get(String(row.listing_id));
        const listingType=firstString(row.listing_type,hit?.kind,"listing").toLowerCase();
        const entityKind=listingType.includes("service")?"service":"listing";
        let images:string[]=[];
        if(Array.isArray(row.images))images=row.images.filter((value):value is string=>typeof value==="string");
        else if(typeof row.images==="string"){
          try{const parsed:unknown=JSON.parse(row.images);images=Array.isArray(parsed)?parsed.filter((value):value is string=>typeof value==="string"):row.images.split(",");}
          catch{images=row.images.split(",");}
        }
        const price=row.price_amount??row.price??null;
        const currency=firstString(row.currency_code,"XAF");
        const image=firstString(row.image_url,images[0],hit?.cover)||null;
        return {id:String(row.listing_id),kind:entityKind,
          title:firstString(row.product_title,row.title,hit?.title,"Marketplace item"),
          subtitle:firstString(row.location_city,row.location_region,row.country_code,hit?.subtitle),
          cover:image,meta:price===null?firstString(hit?.meta):`${Number(price).toLocaleString()} ${currency}`,
          is_demo:row.is_demo===true||row.is_demo===1||hit?.is_demo===true,score:hit?.score??null,snippet:hit?.snippet??""};
      }).filter((item)=>kind==="all"||kind==="market"||(kind==="services"&&item.kind==="service")||
        (kind==="listing"&&item.kind==="listing")||(kind==="service"&&item.kind==="service"));
    }
    await cachePut(env,cacheKey,verified,60);
    return json({success:true,data:verified,source:"ai-search"});
  }
  if(path==="/api/market/search"&&method==="GET"){
    const q=str(url.searchParams.get("q"),100).replace(/[%_]/g,""),category=str(url.searchParams.get("category_id"),64),country=str(url.searchParams.get("country"),2).toUpperCase();
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||24),1),50),offset=Math.max(Number(url.searchParams.get("offset")||0),0);
    const where:string[]=[];const values:unknown[]=[];
    if(q){where.push("product_title LIKE ?");values.push("%"+q+"%");}
    if(category){where.push("category_id=?");values.push(category);}
    if(country){where.push("country_code=?");values.push(country);}
    const rows=await env.DB.prepare("SELECT * FROM public_marketplace_search "+(where.length?"WHERE "+where.join(" AND "):"")+" ORDER BY is_boosted DESC,published_date DESC LIMIT ? OFFSET ?").bind(...values,limit,offset).all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/market/listings"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const title=str(b.title,160),description=str(b.description,10000),category=str(b.category_id,64),type=str(b.listing_type,30),country=str(b.country_code,2).toUpperCase();
    const priceType=str(b.price_type,20)||"fixed",priceAmount=b.price_amount,currency=str(b.currency_code,3).toUpperCase();
    if(!title||!description||!category||! /^[A-Z]{2}$/.test(country)||!["product","service"].includes(type))return fail("Title, description, category, country and valid listing type required");
    if(!["fixed","negotiable","contact"].includes(priceType))return fail("Invalid price type");
    if(priceType!=="contact"&&(!Number.isSafeInteger(priceAmount)||Number(priceAmount)<0||! /^[A-Z]{3}$/.test(currency)))return fail("Fixed or negotiable listings require a non-negative integer price and three-letter currency");
    const cat=await env.DB.prepare("SELECT id,category_type FROM marketplace_categories WHERE id=? AND status='active'").bind(category).first<{id:string;category_type:string}>();
    if(!cat)return fail("Category not found",404);
    if(cat.category_type!=="both"&&cat.category_type!==type)return fail("Listing type does not match category",400);
    const id=uuid();
    await env.DB.prepare("INSERT INTO marketplace_listings(id,seller_id,category_id,title,description,listing_type,price_type,price_amount,currency_code,country_code,status) VALUES(?,?,?,?,?,?,?,?,?,?,'draft')")
      .bind(id,user.id,category,title,description,type,priceType,priceType==="contact"?null:Number(priceAmount),priceType==="contact"?null:currency,country).run();
    return json({success:true,id,status:"draft"},201);
  }
  if(path==="/api/chat/threads"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const rows=await env.DB.prepare(`SELECT t.id,t.thread_type,t.title,t.created_by,t.last_message_at,t.created_at,
      (SELECT m.message_text FROM chat_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id AND m.sender_id<>? AND m.created_at>COALESCE(tm.last_read_at,'1970-01-01T00:00:00.000Z')) AS unread_count
      FROM chat_thread_members tm JOIN chat_threads t ON t.id=tm.thread_id
      WHERE tm.user_id=? AND tm.left_at IS NULL AND t.thread_type='direct' ORDER BY COALESCE(t.last_message_at,t.created_at) DESC LIMIT 100`).bind(user.id,user.id).all();
    return json({success:true,data:rows.results});
  }
  if(path==="/api/chat/direct"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const other=str(b.user_id,64);
    if(!UUID.test(other)||other===user.id)return fail("A valid other user is required");
    const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(other).first();
    if(!target)return fail("User not found",404);
    const blocked=await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(user.id,other,other,user.id).first();
    if(blocked)return fail("Messaging is unavailable for this user",403);
    const directKey=[user.id,other].sort().join(":");
    const existing=await env.DB.prepare("SELECT id FROM chat_threads WHERE direct_key=?").bind(directKey).first<{id:string}>();
    if(existing)return json({success:true,id:existing.id,existing:true});
    const id=uuid();
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO chat_threads(id,thread_type,direct_key,created_by) VALUES(?,'direct',?,?)").bind(id,directKey,user.id),
        env.DB.prepare("INSERT INTO chat_thread_members(thread_id,user_id,role) VALUES(?,?, 'member'),(?,?, 'member')").bind(id,user.id,id,other)
      ]);
      return json({success:true,id},201);
    }catch{
      const raced=await env.DB.prepare("SELECT id FROM chat_threads WHERE direct_key=?").bind(directKey).first<{id:string}>();
      return raced?json({success:true,id:raced.id,existing:true}):fail("Unable to create conversation",409);
    }
  }
  const chatMessages=path.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
  if(chatMessages&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const threadId=chatMessages[1];
    const member=await env.DB.prepare("SELECT 1 FROM chat_thread_members m JOIN chat_threads t ON t.id=m.thread_id WHERE m.thread_id=? AND m.user_id=? AND m.left_at IS NULL AND t.thread_type='direct'").bind(threadId,user.id).first();
    if(!member)return fail("Conversation not found",404);
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||50),1),100),before=url.searchParams.get("before");
    const rows=await env.DB.prepare(`SELECT m.id,m.thread_id,m.sender_id,m.message_text,m.status,m.created_at,
      u.username,u.display_name,u.avatar_url FROM chat_messages m JOIN users u ON u.id=m.sender_id
      WHERE m.thread_id=? ${before?"AND m.created_at < ?":""}
      ORDER BY m.created_at DESC LIMIT ?`).bind(threadId,...(before?[before]:[]),limit).all();
    return json({success:true,data:rows.results.reverse()});
  }
  if(chatMessages&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const message=str(b.message_text,4000),threadId=chatMessages[1];
    if(!message)return fail("Message text is required");
    const member=await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(threadId,user.id).first();
    if(!member)return fail("Conversation not found",404);
    const id=uuid();
    await env.DB.prepare("INSERT INTO chat_messages(id,thread_id,sender_id,message_text) VALUES(?,?,?,?)").bind(id,threadId,user.id,message).run();
    await env.DB.prepare("UPDATE chat_thread_members SET last_read_at="+NOW+" WHERE thread_id=? AND user_id=?").bind(threadId,user.id).run();
    return json({success:true,id},201);
  }
  const chatRead=path.match(/^\/api\/chat\/threads\/([^/]+)\/read$/);
  if(chatRead&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const r=await env.DB.prepare("UPDATE chat_thread_members SET last_read_at="+NOW+" WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(chatRead[1],user.id).run();
    return r.meta.changes?json({success:true}):fail("Conversation not found",404);
  }
  if(path==="/api/notifications"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||30),1),100);
    const rows=await env.DB.prepare("SELECT id,actor_id,notification_type,entity_type,entity_id,title,body,is_read,read_at,created_at FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT ?").bind(user.id,limit).all();
    return json({success:true,data:rows.results});
  }
  const mark=path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if(mark&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    await env.DB.prepare("UPDATE notifications SET is_read=1,read_at="+NOW+" WHERE id=? AND recipient_id=?").bind(mark[1],user.id).run();
    return json({success:true});
  }
  if(path==="/api/support/tickets"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const subject=str(b.subject,160),description=str(b.description,5000),category=str(b.category,40)||"general";
    if(!subject||!description||!["general","account","technical","marketplace","payments","security","privacy","other"].includes(category))return fail("Valid subject, description and category required");
    const id=uuid(),number="CP-"+Date.now().toString(36).toUpperCase()+"-"+uuid().slice(0,8).toUpperCase();
    await env.DB.prepare("INSERT INTO support_tickets(id,user_id,ticket_number,subject,description,category) VALUES(?,?,?,?,?,?)").bind(id,user.id,number,subject,description,category).run();
    return json({success:true,id,ticket_number:number},201);
  }
  if(path==="/api/support/tickets"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const rows=await env.DB.prepare("SELECT id,ticket_number,subject,category,priority,status,last_message_at,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();
    return json({success:true,data:rows.results});
  }
  return fail("Route not found",404);
}
export default { async fetch(request:Request,env:Env):Promise<Response>{
  try{return withCors(await handle(request,env),request,env);}
  catch(error){console.error("D1 Worker request failed",error instanceof Error?error.message:"unknown");return withCors(fail("Internal server error",500),request,env);}
}};
