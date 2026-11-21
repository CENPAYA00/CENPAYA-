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
