import type { Env } from "./types.js";
import { handleGoogleOAuth } from "./oauth.js";
import { auth } from "./auth.js";
import { handleAuthRoutes } from "./auth-routes.js";
import { handleInternalRoutes } from "./internal.js";
import { handleProfileRoutes } from "./profiles.js";
import { handleMarketplaceRoutes } from "./marketplace.js";
import { handleCommunityRoutes } from "./community.js";
import { handleSocialRoutes } from "./social.js";
import { handleMediaRoutes } from "./media.js";
import { handleSearchRoute } from "./search.js";
import { handleVideoRoutes } from "./video.js";
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
  const searchResponse=await handleSearchRoute(request,env,user?.id||null);
  if(searchResponse)return searchResponse;
  const videoResponse=await handleVideoRoutes(request,env,{path,method,user});
  if(videoResponse)return videoResponse;
  const mediaResponse=await handleMediaRoutes(request,env,{url,path,method,user});
  if(mediaResponse)return mediaResponse;
  const profileResponse=await handleProfileRoutes(request,env,{url,path,method,user});
  if(profileResponse)return profileResponse;
  const socialResponse=await handleSocialRoutes(request,env,{url,path,method,user});
  if(socialResponse)return socialResponse;
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
