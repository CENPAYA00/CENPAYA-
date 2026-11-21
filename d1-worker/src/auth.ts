import type { Env, User } from "./types.js";
import { digest, hmac, uuid } from "./security.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export async function readUser(db:D1Database,id:string):Promise<User|null>{
  return db.prepare("SELECT id,username,display_name,email,phone,email_verified,phone_verified,role,account_status,banned,password_hash,onboarding_completed FROM users WHERE id=? AND deleted_at IS NULL").bind(id).first<User>();
}
export async function auth(request:Request,env:Env):Promise<User|null>{
  const bearer=(request.headers.get("Authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  const cookie=request.headers.get("Cookie")||"";
  const cookieToken=cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith("cenpaya_session="))?.slice("cenpaya_session=".length);
  const token=bearer || (cookieToken ? decodeURIComponent(cookieToken) : undefined);
  if(!token || token.length<32 || token.length>256)return null;
  const hash=await digest(token);
  const row=await env.DB.prepare(`SELECT u.id FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.session_token_hash=? AND s.status='active' AND s.expires_at>${NOW}
    AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL`).bind(hash).first<{id:string}>();
  return row?readUser(env.DB,row.id):null;
}
export async function createSession(db:D1Database,userId:string,_request:Request,env:Env):Promise<string>{
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,"0")).join("");
  const ttl=Math.max(300,Math.min(2592000,Number(env.SESSION_TTL_SECONDS||2592000)));
  const expiresAt=new Date(Date.now()+ttl*1000).toISOString();
  await db.prepare("INSERT INTO user_sessions(id,user_id,session_token_hash,status,expires_at) VALUES(?,?,?,'active',?)")
    .bind(uuid(),userId,await digest(token),expiresAt).run();
  return token;
}
export async function rateLimit(env:Env,key:string,max:number,windowSeconds:number):Promise<boolean>{
  if(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN){
    try{
      const script="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
      const response=await fetch(env.UPSTASH_REDIS_REST_URL,{method:"POST",headers:{Authorization:"Bearer "+env.UPSTASH_REDIS_REST_TOKEN,"Content-Type":"application/json"},body:JSON.stringify(["EVAL",script,"1","cenpaya:rl:"+key,String(windowSeconds)])});
      if(response.ok){const result=await response.json() as {result?:number};if(typeof result.result==="number")return result.result<=max;}
    }catch{ /* Redis is optional; D1 remains the fallback limiter. */ }
  }
  const now=Math.floor(Date.now()/1000), window=Math.floor(now/windowSeconds)*windowSeconds;
  // RETURNING makes the increment and limit decision use the same atomic write;
  // a separate SELECT could observe another request's later count under load.
  const row=await env.DB.prepare("INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=CASE WHEN rate_limits.window_start=excluded.window_start THEN rate_limits.count+1 ELSE 1 END RETURNING count")
    .bind(key,window).first<{count:number}>();
  return (row?.count||0)<=max;
}
export async function sendOtp(env:Env,db:D1Database,userId:string,channel:"email"|"sms",destination:string,purpose:"verify_email"|"verify_phone"|"password_reset"):Promise<boolean>{
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
export async function verifyOtp(env:Env,db:D1Database,userId:string,purpose:"verify_email"|"verify_phone"|"password_reset",code:string):Promise<boolean>{
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
export function safeUser(u:User){return {id:u.id,username:u.username,display_name:u.display_name,email:u.email,phone:u.phone,email_verified:!!u.email_verified,phone_verified:!!u.phone_verified,role:u.role,onboarding_completed:!!u.onboarding_completed};}
