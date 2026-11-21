import type { Env } from "./types.js";
import { handleGoogleOAuth } from "./oauth.js";
import { auth } from "./auth.js";
import { handleAuthRoutes } from "./auth-routes.js";
import { handleInternalRoutes } from "./internal.js";
import { handleProfileRoutes } from "./profiles.js";
import { handleMarketplaceRoutes } from "./marketplace.js";
import { handleCommunityRoutes } from "./community.js";
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
async function handle(request:Request,env:Env):Promise<Response>{
  const pre=cors(request,env); if(pre)return pre;
  const url=new URL(request.url), path=url.pathname.replace(/\/$/,"")||"/", method=request.method.toUpperCase();
  const oauthResponse = await handleGoogleOAuth(request,env,url,path,method);
  if(oauthResponse)return oauthResponse;
  if(path==="/health"&&method==="GET"){
    try{await env.DB.prepare("SELECT 1").first();return json({success:true,service:"cenpaya-d1-worker",database:"connected"});}
    catch{return fail("D1 unavailable",503);}
  }
  const internalResponse=await handleInternalRoutes(request,env,url,path,method);
  if(internalResponse)return internalResponse;
  const authResponse=await handleAuthRoutes(request,env,url,path,method);
  if(authResponse)return authResponse;
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
  const profileResponse=await handleProfileRoutes(request,env,{url,path,method,user});
  if(profileResponse)return profileResponse;
  const communityResponse=await handleCommunityRoutes(request,env,{url,path,method,user});
  if(communityResponse)return communityResponse;
  const marketplaceResponse=await handleMarketplaceRoutes(request,env,{url,path,method,user});
  if(marketplaceResponse)return marketplaceResponse;
  return fail("Route not found",404);
}
export default { async fetch(request:Request,env:Env):Promise<Response>{
  try{return withCors(await handle(request,env),request,env);}
  catch(error){console.error("D1 Worker request failed",error instanceof Error?error.message:"unknown");return withCors(fail("Internal server error",500),request,env);}
}};
