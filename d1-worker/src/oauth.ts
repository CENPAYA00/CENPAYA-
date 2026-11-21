import type { Env } from "./types.js";
import { readUser } from "./auth.js";
import { createSession } from "./sessions.js";
import { digest, randomToken, sha256Base64Url, uuid } from "./security.js";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const fail = (message: string, status = 400) => json({ success: false, error: message }, status);
const str = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const allowedOrigins = (env: Env) => (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);

export async function handleGoogleOAuth(
  request: Request, env: Env, url: URL, path: string, method: string,
): Promise<Response | null> {
  if(path==="/api/auth/google/start"&&method==="GET"){
    if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_REDIRECT_URI)return fail("Google sign-in is not configured",503);
    const returnTo=url.searchParams.get("return_to")||env.FRONTEND_URL||"";
    if(!returnTo||!allowedOrigins(env).includes(returnTo))return fail("Invalid sign-in return address",400);
    const state=await randomToken(),verifier=await randomToken(48),challenge=await sha256Base64Url(verifier);
    await env.DB.prepare("INSERT INTO oauth_states(state_hash,code_verifier,return_to,expires_at) VALUES(?,?,?,?)")
      .bind(await digest(state),verifier,returnTo,new Date(Date.now()+10*60*1000).toISOString()).run();
    const target=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.GOOGLE_REDIRECT_URI,response_type:"code",scope:"openid email profile",state,code_challenge:challenge,code_challenge_method:"S256",prompt:"select_account"}).toString();
    return Response.redirect(target.toString(),302);
  }
  if(path==="/api/auth/google/callback"&&method==="GET"){
    const state=str(url.searchParams.get("state"),256),code=str(url.searchParams.get("code"),4096);
    const oauthError=url.searchParams.get("error");
    const fallback=env.FRONTEND_URL||allowedOrigins(env)[0]||"/";
    if(oauthError||!state||!code)return Response.redirect(new URL("/?google_error=cancelled",fallback).toString(),302);
    const pending=await env.DB.prepare("SELECT code_verifier,return_to,expires_at FROM oauth_states WHERE state_hash=?").bind(await digest(state)).first<{code_verifier:string;return_to:string;expires_at:string}>();
    await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash=?").bind(await digest(state)).run();
    if(!pending||pending.expires_at<=new Date().toISOString()||!allowedOrigins(env).includes(pending.return_to))return Response.redirect(new URL("/?google_error=invalid_state",fallback).toString(),302);
    try{
      if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.GOOGLE_REDIRECT_URI)throw new Error("Google OAuth is not configured");
      const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.GOOGLE_REDIRECT_URI,grant_type:"authorization_code",code_verifier:pending.code_verifier})});
      if(!tokenResponse.ok)throw new Error("Google token exchange failed");
      const tokenData=await tokenResponse.json() as {id_token?:string};
      if(!tokenData.id_token)throw new Error("Google did not return an identity token");
      const infoResponse=await fetch("https://oauth2.googleapis.com/tokeninfo?id_token="+encodeURIComponent(tokenData.id_token));
      if(!infoResponse.ok)throw new Error("Google identity validation failed");
      const info=await infoResponse.json() as {aud?:string;iss?:string;exp?:string;sub?:string;email?:string;email_verified?:string|boolean;name?:string;picture?:string};
      if(info.aud!==env.GOOGLE_CLIENT_ID||!["accounts.google.com","https://accounts.google.com"].includes(info.iss||"")||Number(info.exp||0)<=Math.floor(Date.now()/1000)||String(info.email_verified)!=="true"||!info.sub||!info.email)throw new Error("Google identity could not be verified");
      const email=info.email.toLowerCase();
      let identity=await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider='google' AND provider_user_id=?").bind(info.sub).first<{user_id:string}>();
      let userId=identity?.user_id;
      if(!userId){
        const existing=await env.DB.prepare("SELECT id FROM users WHERE lower(email)=? AND deleted_at IS NULL").bind(email).first<{id:string}>();
        if(existing){
          userId=existing.id;
          await env.DB.prepare("UPDATE users SET email_verified=1,email_verified_at="+NOW+",updated_at="+NOW+" WHERE id=?").bind(userId).run();
        }else{
          const base=(email.split("@")[0]||"google_user").toLowerCase().replace(/[^a-z0-9_]/g,"_").replace(/^_+|_+$/g,"").slice(0,22)||"google_user";
          let username=base+"_"+(await randomToken(4)).replace(/[^a-zA-Z0-9]/g,"").slice(0,6).toLowerCase();
          for(let i=0;i<5;i++){
            const taken=await env.DB.prepare("SELECT 1 FROM users WHERE lower(username)=?").bind(username).first();
            if(!taken)break;
            username=base+"_"+(await randomToken(5)).replace(/[^a-zA-Z0-9]/g,"").slice(0,8).toLowerCase();
          }
          userId=uuid();
          await env.DB.prepare("INSERT INTO users(id,username,display_name,email,email_verified,email_verified_at) VALUES(?,?,?,?,1,"+NOW+")")
            .bind(userId,username,str(info.name,100)||base,email).run();
        }
        await env.DB.prepare("INSERT INTO oauth_identities(id,user_id,provider,provider_user_id,email) VALUES(?,?,'google',?,?)")
          .bind(uuid(),userId,info.sub,email).run();
      }
      const user=await readUser(env.DB,userId);
      if(!user||user.banned||user.account_status!=="active")throw new Error("CenPaya account is unavailable");
      const session=await createSession(env.DB,userId,request,env);
      const destination=new URL("/",pending.return_to);
      destination.hash=new URLSearchParams({d1_token:session,auth_provider:"google"}).toString();
      return Response.redirect(destination.toString(),302);
    }catch(error){
      console.error("Google OAuth callback failed",error instanceof Error?error.message:"unknown");
      return Response.redirect(new URL("/?google_error=sign_in_failed",pending.return_to).toString(),302);
    }
  }
  return null;
}
