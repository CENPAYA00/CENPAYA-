import type { Env, User } from "./types.js";
import { uuid } from "./security.js";

type Context={url:URL;path:string;method:string;user:User|null};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(message:string,status=400)=>json({success:false,error:message},status);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES=500*1024*1024;
const MIME=new Set(["video/mp4","video/quicktime","video/webm","video/x-matroska"]);
async function readBody(req:Request){try{if(req.headers.get("Content-Type")?.split(";")[0]!=="application/json")return null;const raw=await req.text();if(raw.length>64000)return null;const v=JSON.parse(raw);return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;}catch{return null;}}
async function videoEnabled(env:Env){const r=await env.DB.prepare("SELECT enabled FROM feature_flags WHERE key='video_global'").first<{enabled:number}>();return Number(r?.enabled||0)===1;}
async function processor(env:Env,path:string,data?:unknown,method="POST"){
 if(!env.VIDEO_PROCESSOR_TOKEN)return null;
 const headers={"Authorization":"Bearer "+env.VIDEO_PROCESSOR_TOKEN,...(data?{"Content-Type":"application/json"}:{})};
 const init:RequestInit={method,headers,body:data?JSON.stringify(data):undefined};
 if(env.VIDEO_PROCESSOR)return env.VIDEO_PROCESSOR.fetch("https://video-processor.internal"+path,init);
 const base=env.VIDEO_PROCESSOR_URL?.trim();if(!base)return null;
 let endpoint:URL;try{endpoint=new URL(path,base);}catch{return null;}
 if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password)return null;
 return fetch(endpoint,init);
}
export async function enqueueVideoCleanup(env:Env,videoId:string){
 await env.DB.prepare("INSERT INTO video_cleanup_jobs(id,video_id,status) VALUES(?,?,'queued') ON CONFLICT(video_id) DO UPDATE SET status=CASE WHEN video_cleanup_jobs.status='completed' THEN 'completed' ELSE 'queued' END,last_error=NULL,attempts=CASE WHEN video_cleanup_jobs.status='failed' THEN 0 ELSE video_cleanup_jobs.attempts END,updated_at=CASE WHEN video_cleanup_jobs.status='failed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE video_cleanup_jobs.updated_at END").bind(uuid(),videoId).run();
}
async function authorized(env:Env,user:User,row:Record<string,unknown>){
 if(row.purpose==="chat"){
  const member=await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(row.related_id,user.id).first();
  const message=await env.DB.prepare("SELECT 1 FROM chat_messages WHERE video_asset_id=? AND status<>'deleted'").bind(row.id).first();
  return !!member&&!!message;
 }
 if(row.purpose==="delivery"){
  const order=await env.DB.prepare("SELECT 1 FROM marketplace_order_delivery_videos dv JOIN marketplace_order_workflows o ON o.order_id=dv.order_id WHERE dv.video_id=? AND o.order_id=? AND (o.buyer_id=? OR o.seller_id=?)").bind(row.id,row.related_id,user.id,user.id).first();
  return !!order;
 }
 if(row.purpose==="listing"){
  const listing=await env.DB.prepare("SELECT 1 FROM marketplace_listings WHERE id=? AND deleted_at IS NULL AND (seller_id=? OR (status='active' AND moderation_status='approved'))").bind(row.related_id,user.id).first();
  return !!listing;
 }
 return row.owner_id===user.id;
}
export async function handleVideoLifecycleRoutes(req:Request,env:Env,ctx:Context):Promise<Response|null>{
 const {url,path,method,user}=ctx;
 if(!path.startsWith("/api/video-assets/")&&!path.startsWith("/api/chat/videos/"))return null;
 if(!await videoEnabled(env))return fail("All video features are disabled by the platform administrator",503);
 if(!user)return fail("Authentication required",401);
 if(path==="/api/video-assets/upload-intent"&&method==="POST"){
  const b=await readBody(req);if(!b)return fail("Valid JSON body required");
  const purpose=String(b.purpose||"");
  const relatedId=typeof b.related_id==="string"?b.related_id:"";
  const mime=typeof b.mime_type==="string"?b.mime_type.toLowerCase():"";
  const size=Number(b.size_bytes);
  if(!["chat","delivery","listing"].includes(purpose)||!MIME.has(mime))return fail("Invalid video purpose or format");
  if(!Number.isSafeInteger(size)||size<1||size>MAX_BYTES)return fail("Video must not exceed 500 MB",413);
  if(!UUID.test(relatedId))return fail("A valid related record is required");
  let maxDuration=300;
  if(purpose==="chat"){
   const member=await env.DB.prepare("SELECT 1 FROM chat_thread_members WHERE thread_id=? AND user_id=? AND left_at IS NULL").bind(relatedId,user.id).first();
   if(!member)return fail("Conversation not found",404);
  }else if(purpose==="delivery"){
   maxDuration=180;
   const order=await env.DB.prepare("SELECT seller_id,financial_status FROM marketplace_order_workflows WHERE order_id=?").bind(relatedId).first<{seller_id:string;financial_status:string}>();
   if(!order||order.seller_id!==user.id)return fail("Only the order seller can upload delivery evidence",403);
   if(!["hold","paid","in_progress","pending"].includes(order.financial_status))return fail("This order is not in a deliverable financial state",409);
  }else{
   const listing=await env.DB.prepare("SELECT seller_id,sale_state,deleted_at FROM marketplace_listings WHERE id=?").bind(relatedId).first<{seller_id:string;sale_state:string;deleted_at:string|null}>();
   if(!listing||listing.seller_id!==user.id||listing.deleted_at||listing.sale_state==="sold")return fail("Available seller listing not found",404);
  }
  const id=uuid(),key="videos/source/"+user.id+"/"+id+"/source";
  const r=await processor(env,"/v1/uploads",{video_id:id,object_key:key,mime_type:mime,size_bytes:size});
  if(!r)return fail("Video processor service is not configured",503);
  if(!r.ok)return fail("Could not create upload URL",502);
  const data=await r.json() as {upload_url?:string;expires_at?:string};
  if(!data.upload_url)return fail("Invalid processor response",502);
  await env.DB.prepare("INSERT INTO video_assets(id,owner_id,status,source_key,source_bytes,mime_type,purpose,related_id,max_duration_seconds,retention_expires_at) VALUES(?,?,'awaiting_upload',?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))")
   .bind(id,user.id,key,size,mime,purpose,relatedId,maxDuration).run();
  return json({success:true,data:{video_id:id,upload_url:data.upload_url,method:"PUT",headers:{"Content-Type":mime},expires_at:data.expires_at,max_duration_seconds:maxDuration}},201);
 }
 const complete=path.match(/^\/api\/video-assets\/([0-9a-f-]{36})\/complete$/i);
 if(complete&&method==="POST"){
  const row=await env.DB.prepare("SELECT id,owner_id,status,purpose FROM video_assets WHERE id=?").bind(complete[1]).first<{id:string;owner_id:string;status:string;purpose:string}>();
  if(!row||row.owner_id!==user.id)return fail("Video not found",404);
  if(row.status!=="awaiting_upload")return fail("Video upload is already completed",409);
  const result=await env.DB.prepare("UPDATE video_assets SET status='processing',retention_expires_at=CASE WHEN purpose='chat' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days') ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND owner_id=? AND status='awaiting_upload'").bind(row.id,user.id).run();
  if(!result.meta.changes)return fail("Video upload state changed",409);
  await env.DB.prepare("INSERT OR IGNORE INTO video_processing_jobs(id,video_id,status,attempts,created_at,updated_at) VALUES(?,?,'queued',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(uuid(),row.id).run();
  return json({success:true,data:{video_id:row.id,status:"processing"}},202);
 }
 const assetRoute=path.match(/^\/api\/video-assets\/([0-9a-f-]{36})\/(status|playlist)$/i);
 if(assetRoute&&(method==="GET")){
  const row=await env.DB.prepare("SELECT * FROM video_assets WHERE id=? AND deleted_at IS NULL").bind(assetRoute[1]).first<Record<string,unknown>>();
  if(!row)return fail("Video not found",404);
  if(assetRoute[2]==="status"){
   if(row.owner_id!==user.id)return fail("Video not found",404);
   return json({success:true,data:{video_id:row.id,status:row.status,duration_seconds:row.duration_seconds}});
  }
  if(!await authorized(env,user,row))return fail("Video not found",404);
  if(row.status!=="ready"||!row.hls_key)return fail("Video is still processing",409);
  const prefix=String(row.hls_key).slice(0,String(row.hls_key).lastIndexOf("/")+1);
  const key=url.searchParams.get("key")||String(row.hls_key);
  if(!key.startsWith(prefix)||!key.endsWith(".m3u8"))return fail("Invalid playlist",400);
  const r=await processor(env,"/v1/playback?key="+encodeURIComponent(key),undefined,"GET");
  if(!r||!r.ok)return fail("Video playback is temporarily unavailable",503);
  const playlist=await r.text();
  const rewritten=playlist.replace(/__CENPAYA_PLAYLIST__\/([^\s]+)/g,(_m,encoded)=>url.origin+"/api/video-assets/"+row.id+"/playlist?key="+encoded);
  return new Response(rewritten,{status:200,headers:{"Content-Type":"application/vnd.apple.mpegurl","Cache-Control":"private,no-store","Access-Control-Allow-Origin":url.origin}});
 }
 const genericDownload=path.match(/^\/api\/video-assets\/([0-9a-f-]{36})\/download$/i);
 if(genericDownload&&method==="GET"){
  const row=await env.DB.prepare("SELECT * FROM video_assets WHERE id=? AND status='ready' AND deleted_at IS NULL").bind(genericDownload[1]).first<Record<string,unknown>>();
  if(!row||!await authorized(env,user,row))return fail("Video not found",404);
  const r=await processor(env,"/v1/download?key="+encodeURIComponent(String(row.source_key)),undefined,"GET");
  if(!r||!r.ok)return fail("Video download is temporarily unavailable",503);
  const data=await r.json() as {url?:string;expires_at?:string};
  return data.url?json({success:true,data:{url:data.url,expires_at:data.expires_at}}):fail("Invalid download response",502);
 }
 const download=path.match(/^\/api\/chat\/videos\/([0-9a-f-]{36})\/download$/i);
 if(download&&method==="GET"){
  const row=await env.DB.prepare("SELECT * FROM video_assets WHERE id=? AND purpose='chat' AND status='ready' AND deleted_at IS NULL").bind(download[1]).first<Record<string,unknown>>();
  if(!row||!await authorized(env,user,row))return fail("Video not found",404);
  const r=await processor(env,"/v1/download?key="+encodeURIComponent(String(row.source_key)),undefined,"GET");
  if(!r||!r.ok)return fail("Video download is temporarily unavailable",503);
  const data=await r.json() as {url?:string;expires_at?:string};
  return data.url?json({success:true,data:{url:data.url,expires_at:data.expires_at}}):fail("Invalid download response",502);
 }
 return fail("Method not allowed",405);
}
export async function processVideoLifecycleCleanupQueue(env:Env):Promise<void>{
 const now=await env.DB.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS value").first<{value:string}>();
 await env.DB.prepare("INSERT OR IGNORE INTO video_cleanup_jobs(id,video_id,status) SELECT lower(hex(randomblob(16))),id,'queued' FROM video_assets WHERE deleted_at IS NULL AND retention_expires_at IS NOT NULL AND retention_expires_at<=?").bind(now?.value||"").run();
 const jobs=await env.DB.prepare("SELECT j.id AS job_id,v.id AS video_id,v.source_key,v.hls_key,v.purpose FROM video_cleanup_jobs j JOIN video_assets v ON v.id=j.video_id WHERE j.status IN ('queued','failed') AND j.attempts<50 AND j.updated_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute') ORDER BY j.created_at LIMIT 5").all<Record<string,unknown>>();
 for(const job of jobs.results){
  const claim=await env.DB.prepare("UPDATE video_cleanup_jobs SET status='processing',attempts=attempts+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status IN ('queued','failed')").bind(job.job_id).run();
  if(!claim.meta.changes)continue;
  if(job.purpose==="delivery"){
   const state=await env.DB.prepare("SELECT financial_status,workflow_status FROM marketplace_order_workflows WHERE order_id=(SELECT related_id FROM video_assets WHERE id=?)").bind(job.video_id).first<{financial_status:string;workflow_status:string}>();
   if(!state||state.workflow_status==="disputed"||!["accepted","completed"].includes(state.workflow_status)||!["released","completed"].includes(state.financial_status)){
    await env.DB.batch([
     env.DB.prepare("UPDATE video_assets SET retention_expires_at=NULL WHERE id=?").bind(job.video_id),
     env.DB.prepare("UPDATE video_cleanup_jobs SET status='failed',last_error='Retention paused until delivery acceptance and financial completion',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(job.job_id)
    ]);
    continue;
   }
  }
  try{
   const response=await processor(env,"/v1/delete",{source_key:job.source_key,hls_key:job.hls_key||null});
   if(!response||!response.ok)throw new Error("Storage deletion failed");
   await env.DB.batch([
    env.DB.prepare("UPDATE chat_messages SET status='deleted',message_text='Video expired',video_asset_id=NULL WHERE video_asset_id=?").bind(job.video_id),
    env.DB.prepare("UPDATE video_assets SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),status='failed',failure_code='retention_expired',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(job.video_id),
    env.DB.prepare("UPDATE video_cleanup_jobs SET status='completed',last_error=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(job.job_id)
   ]);
  }catch(error){
   await env.DB.prepare("UPDATE video_cleanup_jobs SET status='failed',last_error=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(String(error instanceof Error?error.message:"cleanup_failed").slice(0,500),job.job_id).run();
  }
 }
}
export async function processListingRetentionQueue(env:Env):Promise<void>{
 const listings=await env.DB.prepare("SELECT id,images_json,documents_json FROM marketplace_listings WHERE media_purged_at IS NULL AND (deleted_at IS NOT NULL OR (sale_state='sold' AND purge_after<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))) LIMIT 10").all<Record<string,unknown>>();
 for(const listing of listings.results){
  const id=String(listing.id);
  const activeOrder=await env.DB.prepare("SELECT 1 FROM marketplace_order_workflows WHERE listing_id=? AND workflow_status NOT IN ('completed','refunded','cancelled') LIMIT 1").bind(id).first();
  if(activeOrder)continue;
  const videos=await env.DB.prepare("SELECT id AS video_id FROM video_assets WHERE purpose='listing' AND related_id=? AND deleted_at IS NULL").bind(id).all<{video_id:string}>();
  for(const v of videos.results)await enqueueVideoCleanup(env,v.video_id);
  const keys=await env.DB.prepare("SELECT r2_object_key FROM marketplace_listing_media WHERE listing_id=?").bind(id).all<{r2_object_key:string}>();
  const jsonKeys=[listing.images_json,listing.documents_json].flatMap(v=>{try{const a=JSON.parse(String(v||"[]"));return Array.isArray(a)?a.filter((x):x is string=>typeof x==="string"&&x.startsWith("marketplace/")):[];}catch{return[];}});
  const all=[...new Set([...keys.results.map(x=>x.r2_object_key),...jsonKeys])];
  if(all.length&&!env.MEDIA_BUCKET)continue;
  if(all.length&&env.MEDIA_BUCKET)await env.MEDIA_BUCKET.delete(all);
  await env.DB.batch([
   env.DB.prepare("DELETE FROM marketplace_listing_media WHERE listing_id=?").bind(id),
   env.DB.prepare("UPDATE marketplace_listings SET status='removed',deleted_at=COALESCE(deleted_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),images_json='[]',documents_json='[]',media_purged_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(id)
  ]);
 }
}
