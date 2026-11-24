import type {Env,User} from "./types.js";
import {uuid} from "./security.js";
type C={url:URL;path:string;method:string;user:User|null};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>json({success:false,error},status);
const MAX_BYTES=500*1024*1024;
async function processor(env:Env,path:string,data?:unknown,method="POST"){
 if(!env.VIDEO_PROCESSOR||!env.VIDEO_PROCESSOR_TOKEN)return null;
 return env.VIDEO_PROCESSOR.fetch("https://video-processor.internal"+path,{method,headers:{"Authorization":"Bearer "+env.VIDEO_PROCESSOR_TOKEN,...(data?{"Content-Type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
}
export async function handleVideoRoutes(request:Request,env:Env,{url,path,method,user}:C):Promise<Response|null>{
 if(path==="/api/videos/upload-intent"&&method==="POST"){
  if(!user)return fail("Authentication required",401);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return fail("Valid JSON body required");
  const mime=typeof b.mime_type==="string"?b.mime_type.toLowerCase():"",size=Number(b.size_bytes),filename=typeof b.filename==="string"?b.filename.slice(0,160):"video";
  if(!["video/mp4","video/quicktime","video/webm","video/x-matroska"].includes(mime))return fail("Unsupported video format");
  if(!Number.isSafeInteger(size)||size<1||size>MAX_BYTES)return fail("Video must not exceed 500 MB",413);
  const id=uuid(),key="videos/source/"+user.id+"/"+id+"/source",r=await processor(env,"/v1/uploads",{video_id:id,object_key:key,mime_type:mime,size_bytes:size});
  if(!r)return fail("Video processor service is not configured",503);if(!r.ok)return fail("Could not create upload URL",502);
  const data=await r.json() as {upload_url?:string;expires_at?:string};if(!data.upload_url)return fail("Invalid processor response",502);
  await env.DB.prepare("INSERT INTO video_assets(id,owner_id,status,source_key,source_bytes,mime_type) VALUES(?,?,'awaiting_upload',?,?,?)").bind(id,user.id,key,size,mime).run();
  return json({success:true,data:{video_id:id,filename,upload_url:data.upload_url,method:"PUT",headers:{"Content-Type":mime},expires_at:data.expires_at,max_duration_seconds:300}},201);
 }
 const m=path.match(/^\/api\/videos\/([0-9a-f-]{36})\/(complete|status|playlist)$/i);
 if(m){
  if(!user)return fail("Authentication required",401);
  const row=await env.DB.prepare("SELECT v.id,v.owner_id,v.status,v.source_key,v.source_bytes,v.mime_type,v.hls_key,v.duration_seconds,v.thumbnail_key,v.post_id,p.author_id,p.visibility,p.status AS post_status,p.deleted_at FROM video_assets v LEFT JOIN posts p ON p.id=v.post_id WHERE v.id=?").bind(m[1]).first<Record<string,unknown>>();
  if(!row)return fail("Video not found",404);
  const owner=row.owner_id===user.id;
  const visible=owner||(row.post_id&&row.post_status==="published"&&!row.deleted_at&&row.visibility==="public"&&row.author_id!==user.id?true:false);
  if(!visible)return fail("Video not found",404);
  if(m[2]==="status"&&method==="GET")return json({success:true,data:{video_id:row.id,status:row.status,duration_seconds:row.duration_seconds}});
  if(m[2]==="playlist"&&method==="GET"){
   if(row.status!=="ready"||!row.hls_key)return fail("Video is still processing",409);
   if(!owner){
    const blocked=await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(user.id,row.author_id,row.author_id,user.id).first();
    if(blocked)return fail("Video not found",404);
   }
   const requestedKey=url.searchParams.get("key")||String(row.hls_key);
   const prefix=String(row.hls_key).slice(0,String(row.hls_key).lastIndexOf("/")+1);
   if(!requestedKey.startsWith(prefix)||!requestedKey.endsWith(".m3u8"))return fail("Invalid playlist",400);
   const r=await processor(env,"/v1/playback?key="+encodeURIComponent(requestedKey),undefined,"GET");
   if(!r||!r.ok)return fail("Video playback is temporarily unavailable",503);
   const playlist=await r.text();
   const rewritten=playlist.replace(/__CENPAYA_PLAYLIST__\/([^\\s]+)/g,(_match,encoded)=>url.origin+"/api/videos/"+row.id+"/playlist?key="+encoded);
   return new Response(rewritten,{status:200,headers:{"Content-Type":"application/vnd.apple.mpegurl","Cache-Control":"private, no-store","Access-Control-Allow-Origin":url.origin,"Access-Control-Allow-Headers":"Range"}});
  }
  if(m[2]==="complete"&&method==="POST"){
   if(!owner)return fail("Only the uploader can complete this video",403);
   if(row.status!=="awaiting_upload")return fail("Video is already queued",409);
   await env.DB.batch([
    env.DB.prepare("UPDATE video_assets SET status='processing',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND owner_id=? AND status='awaiting_upload'").bind(row.id,user.id),
    env.DB.prepare("INSERT INTO video_processing_jobs(id,video_id,status,attempts,created_at,updated_at) VALUES(?,?,'queued',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(uuid(),row.id)
   ]);
   return json({success:true,data:{video_id:row.id,status:"processing",message:"Video queued for processing"}},202);
  }
  return fail("Method not allowed",405);
 }
 if(path==="/api/videos/publish"&&method==="POST"){
  if(!user)return fail("Authentication required",401);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const videoId=typeof b?.video_id==="string"?b.video_id:"";
  const caption=typeof b?.content==="string"?b.content.trim().slice(0,1000):"";
  if(!videoId)return fail("Video id required");
  const asset=await env.DB.prepare("SELECT id,status,owner_id,post_id FROM video_assets WHERE id=?").bind(videoId).first<{id:string;status:string;owner_id:string;post_id:string|null}>();
  if(!asset||asset.owner_id!==user.id)return fail("Video not found",404);
  if(asset.status!=="ready"||asset.post_id)return fail(asset.status==="processing"?"Video is still processing":"Video is not ready to publish",409);
  const postId=uuid();
  const created=await env.DB.prepare("INSERT INTO posts(id,author_id,content,post_type,visibility,status,published_at) SELECT ?,?,?, 'video','public','published',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM video_assets WHERE id=? AND owner_id=? AND status='ready' AND post_id IS NULL").bind(postId,user.id,caption,videoId,user.id).run();
  if(!created.meta.changes)return fail("Video is no longer available to publish",409);
  const attached=await env.DB.prepare("UPDATE video_assets SET post_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND owner_id=? AND status='ready' AND post_id IS NULL").bind(postId,videoId,user.id).run();
  if(!attached.meta.changes){await env.DB.prepare("DELETE FROM posts WHERE id=? AND author_id=?").bind(postId,user.id).run();return fail("Could not publish video",409);}
  return json({success:true,data:{post_id:postId,video_id:videoId}},201);
 }
 if(path==="/api/reels"&&method==="GET"){
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||10),1),20),cursor=url.searchParams.get("cursor")||"";
  const rows=await env.DB.prepare(`SELECT v.id AS video_id,v.post_id,v.hls_key,v.thumbnail_key,v.duration_seconds,p.content,p.created_at,p.author_id,u.username,u.display_name,u.avatar_url
   FROM video_assets v JOIN posts p ON p.id=v.post_id JOIN users u ON u.id=p.author_id
   WHERE v.status='ready' AND p.status='published' AND p.deleted_at IS NULL AND p.visibility='public'
   AND u.account_status='active' AND u.banned=0 AND u.deleted_at IS NULL
   AND (?='' OR p.created_at<?)
   AND (? IS NULL OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=?)))
   ORDER BY p.created_at DESC LIMIT ?`).bind(cursor,cursor,user?.id||null,user?.id||null,user?.id||null,limit).all<Record<string,unknown>>();
  const data=rows.results.map(row=>({...row,playlist_url:"/api/videos/"+row.video_id+"/playlist",thumbnail_url:null,next_cursor:row.created_at}));
  return json({success:true,data,next_cursor:data.length?data[data.length-1].next_cursor:null});
 }
 return null;
}
export async function processVideoQueue(env:Env):Promise<void>{
 if(!env.VIDEO_PROCESSOR||!env.VIDEO_PROCESSOR_TOKEN)return;
 const jobs=await env.DB.prepare(`SELECT j.id AS job_id,v.id AS video_id,v.source_key,v.source_bytes,v.mime_type
  FROM video_processing_jobs j JOIN video_assets v ON v.id=j.video_id
  WHERE j.status='queued' AND v.status='processing' ORDER BY j.created_at LIMIT 2`).all<Record<string,unknown>>();
 for(const job of jobs.results){
  const claimed=await env.DB.prepare("UPDATE video_processing_jobs SET status='processing',attempts=attempts+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='queued'").bind(job.job_id).run();
  if(!claimed.meta.changes)continue;
  try{
   const response=await processor(env,"/v1/process",{video_id:job.video_id,source_key:job.source_key,source_bytes:job.source_bytes,mime_type:job.mime_type});
   if(!response||!response.ok)throw new Error("Processor unavailable");
   const result=await response.json() as {status?:string;hls_key?:string;thumbnail_key?:string;duration_seconds?:number;width?:number;height?:number;sha256?:string;backup?:string};
   if(result.status!=="ready"||!result.hls_key||result.backup!=="verified")throw new Error("HLS or backup verification failed");
   await env.DB.batch([
    env.DB.prepare("UPDATE video_assets SET status='ready',hls_key=?,thumbnail_key=?,duration_seconds=?,width=?,height=?,failure_code=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='processing'").bind(result.hls_key,result.thumbnail_key||null,result.duration_seconds||null,result.width||null,result.height||null,job.video_id),
    env.DB.prepare("UPDATE video_processing_jobs SET status='completed',last_error=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(job.job_id),
    env.DB.prepare("INSERT OR REPLACE INTO video_backup_jobs(id,video_id,object_key,checksum_sha256,status,attempts) VALUES(?,?,?,?,'verified',1)").bind(uuid(),job.video_id,job.source_key,result.sha256||"")
   ]);
  }catch(error){
   const current=await env.DB.prepare("SELECT attempts FROM video_processing_jobs WHERE id=?").bind(job.job_id).first<{attempts:number}>();
   const terminal=Number(current?.attempts||0)>=3;
   await env.DB.batch([
    env.DB.prepare("UPDATE video_processing_jobs SET status=?,last_error=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(terminal?"failed":"queued",String(error instanceof Error?error.message:"processing_failed").slice(0,500),job.job_id),
    ...(terminal?[env.DB.prepare("UPDATE video_assets SET status='failed',failure_code='processing_failed',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(job.video_id)]:[])
   ]);
  }
 }
}
