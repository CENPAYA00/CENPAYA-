import type { Env } from "./types.js";
import { digest, uuid } from "./security.js";

export async function createSession(db:D1Database,userId:string,request:Request,env:Env):Promise<string>{
  const token=crypto.getRandomValues(new Uint8Array(32));
  const raw=[...token].map(x=>x.toString(16).padStart(2,"0")).join("");
  const ttl=Math.min(Math.max(Number(env.SESSION_TTL_SECONDS||2592000),3600),7776000);
  const expires=new Date(Date.now()+ttl*1000).toISOString();
  await db.prepare("INSERT INTO user_sessions(id,user_id,session_token_hash,ip_address_hash,user_agent,status,expires_at,last_seen_at) VALUES(?,?,?,?,?,'active',?,?)")
    .bind(uuid(),userId,await digest(raw),null,request.headers.get("User-Agent")?.slice(0,300)||null,expires,new Date().toISOString()).run();
  return raw;
}
