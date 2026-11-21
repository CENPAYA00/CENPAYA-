type User = {
  id: string; username: string | null; display_name: string;
  email: string | null; phone: string | null; email_verified: number;
  phone_verified: number; role: string; account_status: string;
  banned: number; password_hash: string | null;
};
interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  OTP_PEPPER: string;
  OTP_DELIVERY?: Fetcher;
  SESSION_TTL_SECONDS?: string;
}
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
      "Access-Control-Allow-Headers":"Content-Type,Authorization","Access-Control-Max-Age":"86400","Vary":"Origin"
    }});
  }
  return null;
}
function withCors(response: Response, request: Request, env: Env): Response {
  const origin=request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).includes(origin)) return response;
  const h=new Headers(response.headers); h.set("Access-Control-Allow-Origin",origin); h.set("Vary","Origin");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
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
const uuid=()=>crypto.randomUUID();
async function digest(value:string):Promise<string>{
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function hmac(value:string,secret:string):Promise<string>{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function passwordHash(password:string):Promise<string>{
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:600000,hash:"SHA-256"},key,256);
  const enc=(a:Uint8Array)=>btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  return "pbkdf2-sha256$600000$"+enc(salt)+"$"+enc(new Uint8Array(bits));
}
async function verifyPassword(password:string,stored:string):Promise<boolean>{
  try{
    const [kind,rounds,salt64,hash64]=stored.split("$"); const n=Number(rounds);
    if(kind!=="pbkdf2-sha256"||!Number.isInteger(n)||n<600000||n>1000000)return false;
    const dec=(s:string)=>{const b64=s.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(b64+"=".repeat((4-b64.length%4)%4)),c=>c.charCodeAt(0));};
    const salt=dec(salt64),expected=dec(hash64);
    if(salt.length!==16||expected.length!==32)return false;
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
    const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:n,hash:"SHA-256"},key,256));
    let diff=0; for(let i=0;i<32;i++)diff|=bits[i]^expected[i]; return diff===0;
  }catch{return false;}
}
async function readUser(db:D1Database,id:string):Promise<User|null>{
  return db.prepare("SELECT id,username,display_name,email,phone,email_verified,phone_verified,role,account_status,banned,password_hash FROM users WHERE id=? AND deleted_at IS NULL").bind(id).first<User>();
}
async function auth(request:Request,env:Env):Promise<User|null>{
  const token=(request.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token || token.length<32 || token.length>256)return null;
  const hash=await digest(token);
  const row=await env.DB.prepare(`SELECT u.id FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.session_token_hash=? AND s.status='active' AND s.expires_at>${NOW}
    AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL`).bind(hash).first<{id:string}>();
  return row?readUser(env.DB,row.id):null;
}
async function rateLimit(db:D1Database,key:string,max:number,windowSeconds:number):Promise<boolean>{
  const now=Math.floor(Date.now()/1000), window=Math.floor(now/windowSeconds)*windowSeconds;
  await db.prepare("INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=CASE WHEN rate_limits.window_start=excluded.window_start THEN rate_limits.count+1 ELSE 1 END").bind(key,window).run();
  const row=await db.prepare("SELECT count FROM rate_limits WHERE key=?").bind(key).first<{count:number}>();
  return (row?.count||0)<=max;
}
async function createSession(db:D1Database,userId:string,request:Request,env:Env):Promise<string>{
  const token=crypto.getRandomValues(new Uint8Array(32));
  const raw=[...token].map(x=>x.toString(16).padStart(2,"0")).join("");
  const ttl=Math.min(Math.max(Number(env.SESSION_TTL_SECONDS||2592000),3600),7776000);
  const expires=new Date(Date.now()+ttl*1000).toISOString();
  await db.prepare("INSERT INTO user_sessions(id,user_id,session_token_hash,ip_address_hash,user_agent,status,expires_at,last_seen_at) VALUES(?,?,?,?,?,'active',?,?)")
    .bind(uuid(),userId,await digest(raw),null,request.headers.get("User-Agent")?.slice(0,300)||null,expires,new Date().toISOString()).run();
  return raw;
}
async function sendOtp(env:Env,db:D1Database,userId:string,channel:"email"|"sms",destination:string,purpose:"verify_email"|"verify_phone"|"password_reset"):Promise<boolean>{
  if(!env.OTP_DELIVERY || !env.OTP_PEPPER)return false;
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0");
  const id=uuid(), codeHash=await hmac(userId+":"+purpose+":"+code,env.OTP_PEPPER);
  const expires=new Date(Date.now()+10*60*1000).toISOString();
  await db.prepare("DELETE FROM otp_codes WHERE user_id=? AND purpose=? AND verified_at IS NULL").bind(userId,purpose).run();
  await db.prepare("INSERT INTO otp_codes(id,user_id,channel,destination,provider,purpose,code_hash,expires_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id,userId,channel,destination,"worker",purpose,codeHash,expires).run();
  const response=await env.OTP_DELIVERY.fetch("https://otp-delivery.internal/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,destination,code,purpose})});
  if(!response.ok){await db.prepare("DELETE FROM otp_codes WHERE id=?").bind(id).run();return false;}
  return true;
}
async function verifyOtp(env:Env,db:D1Database,userId:string,purpose:"verify_email"|"verify_phone"|"password_reset",code:string):Promise<boolean>{
  const row=await db.prepare("SELECT id,code_hash,attempts,expires_at FROM otp_codes WHERE user_id=? AND purpose=? AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(userId,purpose).first<{id:string;code_hash:string;attempts:number;expires_at:string}>();
  if(!row||row.attempts>=5||row.expires_at<=new Date().toISOString())return false;
  await db.prepare("UPDATE otp_codes SET attempts=attempts+1 WHERE id=?").bind(row.id).run();
  const expected=await hmac(userId+":"+purpose+":"+code,env.OTP_PEPPER||"");
  if(expected!==row.code_hash)return false;
  await db.prepare("UPDATE otp_codes SET verified_at="+NOW+" WHERE id=?").bind(row.id).run();
  if(purpose==="verify_email") await db.prepare("UPDATE users SET email_verified=1,email_verified_at="+NOW+",updated_at="+NOW+" WHERE id=?").bind(userId).run();
  else if(purpose==="verify_phone") await db.prepare("UPDATE users SET phone_verified=1,phone_verified_at="+NOW+",updated_at="+NOW+" WHERE id=?").bind(userId).run();
  return true;
}
function safeUser(u:User){return {id:u.id,username:u.username,display_name:u.display_name,email:u.email,phone:u.phone,email_verified:!!u.email_verified,phone_verified:!!u.phone_verified,role:u.role};}
async function handle(request:Request,env:Env):Promise<Response>{
  const pre=cors(request,env); if(pre)return pre;
  const url=new URL(request.url), path=url.pathname.replace(/\/$/,"")||"/", method=request.method.toUpperCase();
  if(path==="/health"&&method==="GET"){
    try{await env.DB.prepare("SELECT 1").first();return json({success:true,service:"cenpaya-d1-worker",database:"connected"});}
    catch{return fail("D1 unavailable",503);}
  }
  if(path==="/api/auth/register"&&method==="POST"){
    const b=await body(request); if(!b)return fail("Valid JSON body required");
    const username=str(b.username,30).toLowerCase(),display=str(b.display_name,100),email=str(b.email,254).toLowerCase()||null,phone=str(b.phone,32)||null,password=str(b.password,128);
    if(!/^[a-z0-9_]{3,30}$/.test(username)||!display||password.length<12||(!email&&!phone))return fail("Valid username, display name, email or phone, and password (12+ characters) required");
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail("Invalid email address");
    if(!await rateLimit(env.DB,"register:"+await digest(email||phone||username),5,3600))return fail("Too many registration attempts",429);
    const duplicate=await env.DB.prepare("SELECT id FROM users WHERE lower(username)=? OR (? IS NOT NULL AND lower(email)=?) OR (? IS NOT NULL AND phone=?)").bind(username,email,email,phone,phone).first();
    if(duplicate)return fail("Account details already in use",409);
    const id=uuid(),hash=await passwordHash(password);
    await env.DB.prepare("INSERT INTO users(id,username,display_name,email,phone,password_hash) VALUES(?,?,?,?,?,?)").bind(id,username,display,email,phone,hash).run();
    const channel=email?"email":"sms",purpose=email?"verify_email":"verify_phone";
    let delivered=false;
    try{delivered=await sendOtp(env,env.DB,id,channel,email||phone!,purpose);}catch{delivered=false;}
    if(!delivered)return json({success:false,error:"Verification delivery is unavailable; retry OTP delivery for this account.",user_id:id},503);
    return json({success:true,user_id:id,verification_required:true,channel},201);
  }
  if(path==="/api/auth/otp/resend"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const identifier=str(b.identifier,254).toLowerCase(),purpose=str(b.purpose,20);
    if(!identifier||!["verify_email","verify_phone"].includes(purpose))return fail("Identifier and valid verification purpose required");
    if(!await rateLimit(env.DB,"otp-resend:"+await digest(identifier+":"+purpose),3,600))return fail("Too many OTP requests",429);
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
    if(!await rateLimit(env.DB,"verify:"+userId,10,600))return fail("Too many verification attempts",429);
    if(!await verifyOtp(env,env.DB,userId,purpose as "verify_email"|"verify_phone",code))return fail("Invalid or expired verification code",400);
    const user=await readUser(env.DB,userId);if(!user)return fail("Account not found",404);
    const token=await createSession(env.DB,userId,request,env);
    return json({success:true,user:safeUser(user),token});
  }
  if(path==="/api/auth/password/request"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const identifier=str(b.identifier,254).toLowerCase();
    if(!identifier)return fail("Identifier required");
    if(!await rateLimit(env.DB,"password-reset:"+await digest(identifier),4,3600))return fail("Too many reset attempts",429);
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
    const userId=str(b.user_id,64),code=str(b.code,6),password=str(b.new_password,128);
    if(!UUID.test(userId)||!/^\d{6}$/.test(code)||password.length<12)return fail("Valid user, six-digit code, and new password (12+ characters) required");
    if(!await rateLimit(env.DB,"password-reset-verify:"+userId,8,900))return fail("Too many reset attempts",429);
    if(!await verifyOtp(env,env.DB,userId,"password_reset",code))return fail("Invalid or expired reset code",400);
    const hash=await passwordHash(password);
    await env.DB.prepare("UPDATE users SET password_hash=?,password_updated_at="+NOW+",updated_at="+NOW+" WHERE id=? AND deleted_at IS NULL").bind(hash,userId).run();
    await env.DB.prepare("UPDATE user_sessions SET status='revoked',revoked_at="+NOW+" WHERE user_id=? AND status='active'").bind(userId).run();
    const token=await createSession(env.DB,userId,request,env);
    const updated=await readUser(env.DB,userId);
    return json({success:true,user:updated?safeUser(updated):null,token});
  }
  if(path==="/api/auth/login"&&method==="POST"){
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const identifier=str(b.identifier,254).toLowerCase(),password=str(b.password,128);
    if(!identifier||!password)return fail("Identifier and password required");
    if(!await rateLimit(env.DB,"login:"+await digest(identifier),8,900))return fail("Too many sign-in attempts",429);
    const user=await env.DB.prepare("SELECT id,username,display_name,email,phone,email_verified,phone_verified,role,account_status,banned,password_hash FROM users WHERE (lower(email)=? OR lower(username)=? OR phone=?) AND deleted_at IS NULL").bind(identifier,identifier,identifier).first<User>();
    if(!user||!user.password_hash||!(await verifyPassword(password,user.password_hash)))return fail("Invalid credentials",401);
    if(user.banned||user.account_status!=="active")return fail("Account is unavailable",403);
    if(!(user.email_verified||user.phone_verified))return fail("Verify your email address or phone number before signing in",403);
    const token=await createSession(env.DB,user.id,request,env);
    return json({success:true,user:safeUser(user),token});
  }
  if(path==="/api/auth/logout"&&method==="POST"){
    const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
    if(token)await env.DB.prepare("UPDATE user_sessions SET status='revoked',revoked_at="+NOW+" WHERE session_token_hash=?").bind(await digest(token)).run();
    return json({success:true});
  }
  const user=await auth(request,env);
  if(path==="/api/me"&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    return json({success:true,user:safeUser(user)});
  }
  if(path==="/api/me/profile"&&method==="PATCH"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const allowed=["display_name","bio","avatar_url","cover_url","country_code","preferred_language","location_city","location_region","occupation","profile_visibility"];
    const fields=allowed.filter(k=>Object.prototype.hasOwnProperty.call(b,k));
    if(!fields.length)return fail("No supported profile fields supplied");
    const values:(string|null)[]=[];
    const sets=fields.map(k=>{let v=b[k];if(typeof v!=="string"&&v!==null)return "";v=typeof v==="string"?v.trim().slice(0,k==="bio"?2000: k==="display_name"?100:255):null;values.push(v as string|null);return '"'+k+'"=?';});
    if(sets.some(x=>!x))return fail("Invalid profile field value");
    if(b.profile_visibility!==undefined&&!["public","private","followers"].includes(String(b.profile_visibility)))return fail("Invalid profile visibility");
    values.push(user.id);
    await env.DB.prepare("UPDATE users SET "+sets.join(",")+",updated_at="+NOW+" WHERE id=?").bind(...values).run();
    const updated=await readUser(env.DB,user.id);return json({success:true,user:updated?safeUser(updated):null});
  }
  const publicProfile=path.match(/^\/api\/profiles\/([^/]+)$/);
  if(publicProfile&&method==="GET"){
    const key=decodeURIComponent(publicProfile[1]);
    const profile=await env.DB.prepare("SELECT id,username,display_name,avatar_url,cover_url,bio,country_code,location_city,is_premium,followers_count,sales_count,reputation_score,created_at FROM public_profiles WHERE id=? OR lower(username)=lower(?)").bind(key,key).first();
    return profile?json({success:true,data:profile}):fail("Profile not found",404);
  }
  if(path==="/api/countries"&&method==="GET"){
    const rows=await env.DB.prepare("SELECT country_code,name,currency_code,phone_prefix,status FROM supported_countries WHERE status IN ('active','coming_soon') ORDER BY name").all();
    return json({success:true,data:rows.results});
  }
  const publicListing=path.match(/^\/api\/market\/listings\/([^/]+)$/);
  if(publicListing&&method==="GET"){
    const row=await env.DB.prepare("SELECT * FROM public_marketplace_search WHERE listing_id=?").bind(publicListing[1]).first();
    return row?json({success:true,data:row}):fail("Listing not found",404);
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
      WHERE tm.user_id=? AND tm.left_at IS NULL ORDER BY COALESCE(t.last_message_at,t.created_at) DESC LIMIT 100`).bind(user.id,user.id).all();
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
  if(path==="/api/chat/groups"&&method==="POST"){
    if(!user)return fail("Unauthorized",401);
    const b=await body(request);if(!b)return fail("Valid JSON body required");
    const title=str(b.title,100),requested=Array.isArray(b.member_ids)?b.member_ids.map(x=>str(x,64)):[];
    const ids=[...new Set([user.id,...requested])];
    if(!title||ids.length<3||ids.length>50||ids.some(id=>!UUID.test(id)))return fail("A group title and 2–49 valid members are required");
    const placeholders=ids.map(()=>"?").join(",");
    const found=await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE id IN ("+placeholders+") AND account_status='active' AND banned=0 AND deleted_at IS NULL").bind(...ids).first<{total:number}>();
    if((found?.total||0)!==ids.length)return fail("One or more group members are unavailable",400);
    const id=uuid(),statements=[env.DB.prepare("INSERT INTO chat_threads(id,thread_type,title,created_by) VALUES(?,'group',?,?)").bind(id,title,user.id)];
    for(const memberId of ids)statements.push(env.DB.prepare("INSERT INTO chat_thread_members(thread_id,user_id,role) VALUES(?,?,?)").bind(id,memberId,memberId===user.id?"owner":"member"));
    await env.DB.batch(statements);
    return json({success:true,id},201);
  }
  const chatMessages=path.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
  if(chatMessages&&method==="GET"){
    if(!user)return fail("Unauthorized",401);
    const threadId=chatMessages[1];
    const member=await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(threadId,user.id).first();
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
